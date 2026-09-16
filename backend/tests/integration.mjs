import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pool from "../dist/config/db.js";

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "http://127.0.0.1:5107";
const logs = [];
const userIds = [];
const suffix = `${Date.now()}`;
const server = spawn(process.execPath, ["--import", "./tests/local-only-fetch.mjs", "dist/server.js"], {
  cwd: backend, windowsHide: true,
  env: { ...process.env, PORT: "5107", HF_HUB_OFFLINE: "1", PYTHON_EXECUTABLE: path.join(backend, "../.venv/Scripts/python.exe") },
  stdio: ["ignore", "pipe", "pipe", "ipc"],
});
server.stdout.on("data", (chunk) => logs.push(chunk.toString()));
server.stderr.on("data", (chunk) => { logs.push(chunk.toString()); process.stderr.write(chunk); });

async function request(url, token, method = "GET", body) {
  const response = await fetch(`${origin}/api${url}`, {
    method, headers: { "Content-Type": "application/json", ...(token ? { Cookie: `token=${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await response.json();
  assert.ok(response.ok, `${method} ${url}: ${JSON.stringify(payload)}`);
  return payload;
}

async function waitForHealth() {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Test server exited: ${logs.join("").slice(-4000)}`);
    try {
      const response = await fetch(`${origin}/health`);
      const health = await response.json();
      if (health.status === "ok") return health;
    } catch { /* Startup has not bound its port yet. */ }
    if (logs.join("").includes("Failed to load")) throw new Error("A real model failed to load");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Models did not become healthy");
}

try {
  const health = await waitForHealth();
  assert.deepEqual(Object.keys(health.models).sort(), ["code", "image", "text"]);
  assert.ok(!JSON.stringify(health).includes("modelPath"));
  console.log("PASS: all three real models loaded once; health exposes no paths");

  const tokens = {};
  for (const role of ["teacher", "student"]) {
    const credentials = { name: `Detection test ${role}`, email: `detector-test-${role}-${suffix}@example.invalid`, password: `LocalTest-${suffix}!`, role };
    const registered = await request("/auth/signup", null, "POST", credentials);
    userIds.push(Number(registered.user.id));
    const login = await request("/auth/login", null, "POST", credentials);
    tokens[role] = login.token;
    assert.equal(login.user.role, role);
  }
  console.log("PASS: teacher and student login");
  const classroom = await request("/classes", tokens.teacher, "POST", { name: "Detector integration test", code: `DT${suffix}`, description: "Temporary local regression fixture" });
  const classId = classroom.class.id;
  await pool.query("INSERT INTO class_enrollments (class_id, student_id) VALUES ($1, $2)", [classId, userIds[1]]);
  // Reuse an existing essay assignment's definition in an isolated test class.
  const template = await pool.query("SELECT title, description FROM activities WHERE submission_type = 'essay' ORDER BY id LIMIT 1");
  assert.ok(template.rows.length, "A working existing TEXT assignment is required");
  const image = await sharp({ create: { width: 224, height: 224, channels: 3, background: { r: 70, g: 130, b: 180 } } }).png().toBuffer();
  const document = execFileSync(path.join(backend, "../.venv/Scripts/python.exe"), ["-c", `
import io, sys, zipfile
b = io.BytesIO()
with zipfile.ZipFile(b, 'w') as z:
    z.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    z.writestr('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>I tested our classroom project with my group and wrote down the problems we found. The next version preserved our drafts after a lost connection.</w:t></w:r></w:p></w:body></w:document>')
sys.stdout.buffer.write(b.getvalue())
`], { windowsHide: true });
  const submissions = [];
  for (const type of ["essay", "code", "image", "file"]) {
    const assignment = await request(`/classes/${classId}/activities`, tokens.teacher, "POST", {
      title: type === "essay" ? template.rows[0].title : `${type} inference test`,
      description: type === "essay" ? template.rows[0].description : "Temporary inference fixture",
      instructor: "Regression Teacher", submissionType: type, dueDate: "2099-01-01", maxScore: 100,
      ...(type === "code" ? { programmingLanguage: "Python" } : {}),
    });
    const activityId = assignment.activity.id;
    const content = type === "image" ? { fileName: "fixture.png", fileType: "image/png", fileSize: image.length, fileDataUrl: `data:image/png;base64,${image.toString("base64")}` } : type === "file" ? {
      fileName: "fixture.docx", fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", fileSize: document.length,
      fileDataUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${document.toString("base64")}`,
    } : {
      contentText: type === "code" ? "def add(a, b):\n    return a + b\n\nprint(add(2, 3))\n" : "During our classroom project, I tested the first prototype with my group. We found that the upload button stopped working when the connection dropped. I wrote down the steps, repeated the test, and explained the problem to our teacher. The next version kept the draft so we could submit it later. This experience helped me understand why testing with real users matters.",
    };
    const saved = await request(`/classes/activities/${activityId}/submissions`, tokens.student, "POST", content);
    const id = saved.submission.id;
    assert.equal(saved.submission.status.toLowerCase(), "pending");
    const expectedDetector = type === "essay" || type === "file" ? "text" : type;
    const before = logs.join("").match(/\[ai-inference\] detector=/g)?.length ?? 0;
    const analyzed = await request(`/classes/submissions/${id}/analyze`, tokens.teacher, "POST");
    const result = analyzed.submission;
    assert.equal(result.status, "analyzed", JSON.stringify(result.analysis_details));
    assert.equal(result.analysis_details.detectorType, expectedDetector);
    assert.equal(result.analysis_details.threshold, { text: 0.9913054109, code: 0.54, image: 0.5 }[expectedDetector]);
    const after = logs.join("").match(/\[ai-inference\] detector=/g)?.length ?? 0;
    assert.equal(after - before, 1, "Exactly one detector must run per submission");
    assert.ok(logs.join("").includes(`detector=${expectedDetector}`));
    const stored = await pool.query("SELECT ai_probability, is_ai_generated, analysis_details FROM submissions WHERE id=$1", [id]);
    assert.equal(Number(stored.rows[0].ai_probability), Number(result.ai_probability));
    const p = result.analysis_details.probabilities.ai;
    assert.equal(result.is_ai_generated, expectedDetector === "image" ? p > 0.5 : p >= result.analysis_details.threshold);
    const detail = await request(`/classes/submissions/${id}`, tokens.teacher);
    assert.equal(detail.submission.analysis_details.modelName, result.analysis_details.modelName);
    const history = await pool.query("SELECT COUNT(*)::int AS count FROM submission_history WHERE submission_id=$1", [id]);
    assert.equal(history.rows[0].count, 1);
    submissions.push({ id, activityId, content });
    console.log(`PASS: ${type} submission -> ${expectedDetector} only -> database -> teacher response (${result.ai_probability}% AI)`);
  }

  const essay = submissions[0];
  await request(`/classes/submissions/${essay.id}/evaluation`, tokens.teacher, "PATCH", { score: 87, remarks: "Integration test remark", comments: "Reviewed test work" });
  const evaluated = await request(`/classes/submissions/${essay.id}`, tokens.teacher);
  assert.equal(Number(evaluated.submission.teacher_score), 87);
  assert.equal(evaluated.submission.teacher_remarks, "Integration test remark");
  const batch = await request(`/classes/${classId}/submissions/analyze`, tokens.teacher, "POST");
  assert.equal(batch.updated, 4);
  assert.equal(batch.failed, 0);
  const retained = await pool.query("SELECT teacher_score, teacher_remarks FROM submissions WHERE id=$1", [essay.id]);
  assert.equal(Number(retained.rows[0].teacher_score), 87);
  assert.equal(retained.rows[0].teacher_remarks, "Integration test remark");
  assert.ok(!logs.join("").includes("UNEXPECTED_OUTBOUND_FETCH"));
  console.log("PASS: batch routing, grades, remarks, submission history, and no external Node detection requests");

  // Resubmission should remain saved when local inference is unavailable.
  await request(`/classes/activities/${essay.activityId}/submissions`, tokens.student, "POST", essay.content);
  server.send("test-stop-worker");
  for (let attempt = 0; attempt < 100; attempt++) {
    if ((await (await fetch(`${origin}/health`)).json()).status === "degraded") break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const failed = await request(`/classes/submissions/${essay.id}/analyze`, tokens.teacher, "POST");
  assert.equal(failed.submission.status, "pending");
  assert.equal(failed.submission.ai_probability, null);
  assert.equal(failed.submission.is_ai_generated, null);
  assert.equal(failed.submission.analysis_details.analysisStatus, "failed");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM submissions WHERE id=$1", [essay.id])).rows[0].count, 1);
  assert.equal((await pool.query("SELECT content_text FROM submissions WHERE id=$1", [essay.id])).rows[0].content_text, essay.content.contentText);
  console.log("PASS: failed analysis preserves submission with null scores and no fallback");
} finally {
  // Only fixture users created by this exact run are removed; FK cascades clean their test class.
  if (userIds.length) await pool.query("DELETE FROM users WHERE id = ANY($1::int[]) AND email LIKE $2", [userIds, `detector-test-%-${suffix}@example.invalid`]);
  await pool.end();
  if (server.connected) server.send("test-shutdown");
  if (server.exitCode === null) await once(server, "exit");
}
