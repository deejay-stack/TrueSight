import { fixtureSubject, cleanupCurriculumFixtures } from './curriculum-fixture.mjs';
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pool from "../dist/config/db.js";
import { previewPdf } from "./preview-fixtures.mjs";

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
    if (role === "student") await pool.query("UPDATE users SET department_code='BSIT',year_level=$2 WHERE id=$1", [registered.user.id, 1]);
    const login = await request("/auth/login", null, "POST", credentials);
    tokens[role] = login.token;
    assert.equal(login.user.role, role);
  }
  console.log("PASS: teacher and student login");
  const classroom = await request("/classes", tokens.teacher, "POST", { subjectId: await fixtureSubject(), departmentCode: "BSIT", yearLevel: 1, name: "Detector integration test", code: `DT${suffix}`, description: "Temporary local regression fixture" });
  const classId = classroom.class.id;
  const corImage = await sharp({ create: { width: 400, height: 600, channels: 3, background: "white" } }).png().toBuffer();
  const joinBody = { departmentCode: "BSIT", yearLevel: 1, code: `DT${suffix}`, corFileName: "fixture-cor.png", corFileType: "image/png", corFileSize: corImage.length, corDataUrl: `data:image/png;base64,${corImage.toString("base64")}` };
  await request("/classes/join", tokens.student, "POST", joinBody);
  let enrollment = (await request("/classes/enrollment-requests", tokens.teacher)).requests.find((item) => Number(item.class_id) === Number(classId));
  assert.equal(enrollment.cor_data_url, undefined, "Queue metadata does not include private COR bytes");
  assert.equal((await request(`/classes/documents/cor/${enrollment.id}`, tokens.teacher)).document.dataUrl, joinBody.corDataUrl);
  await request(`/classes/enrollment-requests/${enrollment.id}`, tokens.teacher, "PATCH", { status: "rejected", rejectionNote: "Test rejection" });
  await request("/classes/join", tokens.student, "POST", joinBody);
  enrollment = (await request("/classes/enrollment-requests", tokens.teacher)).requests.find((item) => Number(item.class_id) === Number(classId) && item.status === "pending");
  await request(`/classes/enrollment-requests/${enrollment.id}`, tokens.teacher, "PATCH", { status: "accepted" });
  assert.ok((await request("/classes/enrolled", tokens.student)).classes.some((item) => Number(item.id) === Number(classId)));
  console.log("PASS: COR upload, review, reject, resubmit, approve, and enrollment");
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
  for (const format of ["essay", "code", "image", "docx", "pdf"]) {
    const type = ["docx", "pdf"].includes(format) ? "file" : format;
    const assignment = await request(`/classes/${classId}/activities`, tokens.teacher, "POST", {
      title: type === "essay" ? template.rows[0].title : `${type} inference test`,
      description: type === "essay" ? template.rows[0].description : "Temporary inference fixture",
      instructor: "Regression Teacher", submissionType: type, dueDate: "2099-01-01", maxScore: 100,
      ...(type === "code" ? { programmingLanguage: "Python" } : {}),
      ...(type === "essay" ? { aiScoringEnabled: true, rubric: [
        { id: "requirements", title: "Explicit requirements", description: "At least 10 words; include classroom project", maxPoints: 20, aiEnabled: true, assessment: { minimumWords: 10, requiredPhrases: ["classroom project"] } },
        { id: "judgment", title: "Quality and originality", description: "Teacher judgment required", maxPoints: 80, aiEnabled: true },
      ] } : {}),
    });
    const activityId = assignment.activity.id;
    const pdf = previewPdf();
    const content = format === "pdf" ? { fileName: "fixture.pdf", fileType: "application/pdf", fileSize: pdf.length, fileDataUrl: `data:application/pdf;base64,${pdf.toString("base64")}` } : type === "image" ? { fileName: "fixture.png", fileType: "image/png", fileSize: image.length, fileDataUrl: `data:image/png;base64,${image.toString("base64")}` } : type === "file" ? {
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
    if (type === "essay") {
      assert.equal(result.ai_assessment.status, "partial");
      assert.equal(result.ai_assessment.suggestedTotal, null);
      assert.equal(result.ai_assessment.partialTotal, 20);
      assert.equal(result.ai_assessment.criteria[1].score, null);
      assert.match(result.ai_assessment.criteria[1].explanation, /teacher evaluation/);
      const provisional = await pool.query("SELECT teacher_score, grade_approved FROM submissions WHERE id=$1", [id]);
      assert.equal(provisional.rows[0].teacher_score, null); assert.equal(provisional.rows[0].grade_approved, false);
      const hidden = await fetch(`${origin}/api/classes/activities/${activityId}/rating`, { headers: { Cookie: `token=${tokens.student}` } });
      assert.equal(hidden.status, 404);
      const own = await request(`/classes/activities/${activityId}`, tokens.student);
      assert.equal(own.submission.ai_assessment, undefined); assert.equal(own.activity.rubric[0].assessment, undefined);
      console.log("PASS: completed real analysis automatically generates evidence-backed partial suggestions, no official grade or student disclosure");
    }
    assert.ok(result.analysis_details.reasons.length >= 4, "Detailed model rationale should be stored");
    if (expectedDetector === "text") {
      const segments = result.analysis_details.segmentExplanation;
      assert.equal(segments.status, "completed");
      assert.ok(segments.segments.length > 0 && segments.segments.length <= 24);
      for (const segment of segments.segments) {
        assert.equal(segments.analyzedText.slice(segment.start, segment.end), segment.text);
        assert.ok(Math.abs(segment.aiProbability + segment.humanProbability - 1) < 1e-5);
      }
      const explanation = result.analysis_details.textExplanation;
      assert.equal(explanation.status, "completed");
      assert.ok(explanation.sentences.length > 0);
      assert.ok(explanation.sentences.length <= 16);
      for (const sentence of explanation.sentences) {
        assert.equal(explanation.analyzedText.slice(sentence.start, sentence.end), sentence.text);
        assert.ok(Math.abs(sentence.impactPercentagePoints - (result.analysis_details.probabilities.ai - sentence.maskedAiProbability) * 100) < 1e-8);
      }
    }
    assert.equal(result.analysis_details.threshold, { text: 0.9913054109, code: 0.54, image: 0.5 }[expectedDetector]);
    const after = logs.join("").match(/\[ai-inference\] detector=/g)?.length ?? 0;
    assert.equal(after - before, 1, "Exactly one detector must run per submission");
    assert.ok(logs.join("").includes(`detector=${expectedDetector}`));
    const stored = await pool.query("SELECT ai_probability, is_ai_generated, analysis_details FROM submissions WHERE id=$1", [id]);
    assert.ok(Math.abs(Number(stored.rows[0].ai_probability) - Number(result.ai_probability)) <= 0.005);
    assert.deepEqual(stored.rows[0].analysis_details.textExplanation, result.analysis_details.textExplanation);
    assert.deepEqual(stored.rows[0].analysis_details.segmentExplanation, result.analysis_details.segmentExplanation);
    const p = result.analysis_details.probabilities.ai;
    assert.equal(result.is_ai_generated, expectedDetector === "image" ? p > 0.5 : p >= result.analysis_details.threshold);
    const detail = await request(`/classes/submissions/${id}`, tokens.teacher);
    assert.equal(detail.submission.analysis_details.modelName, result.analysis_details.modelName);
    const history = await pool.query("SELECT COUNT(*)::int AS count FROM submission_history WHERE submission_id=$1", [id]);
    assert.equal(history.rows[0].count, 1);
    const preview = await request(`/classes/documents/submission/${id}`, tokens.teacher);
    const ownPreview = await request(`/classes/documents/submission/${id}`, tokens.student);
    assert.equal(preview.document.dataUrl, content.fileDataUrl ?? null);
    assert.equal(ownPreview.document.textContent, content.contentText ?? null);
    if (type === "code") { assert.equal(preview.document.code, true); assert.equal(preview.document.language, "Python"); }
    submissions.push({ id, activityId, content, format });
    console.log(`PASS: ${type} submission -> ${expectedDetector} only -> database -> teacher response (${result.ai_probability}% AI)`);
  }

  // Exercise an older TXT record without broadening the existing PDF/DOCX upload rule.
  const legacyAssignment = (await request(`/classes/${classId}/activities`, tokens.teacher, "POST", {
    title: "Legacy TXT preview", description: "Temporary compatibility fixture", instructor: "Regression Teacher", submissionType: "file", dueDate: "2099-01-01", maxScore: 100,
  })).activity;
  const legacyText = "Our team reviewed the original classroom notes. We compared the prototype with the earlier draft and explained the changes.";
  const legacyContent = { fileName: "legacy.txt", fileType: "text/plain", fileSize: Buffer.byteLength(legacyText), fileDataUrl: `data:text/plain;base64,${Buffer.from(legacyText).toString("base64")}` };
  const rejectedTxt = await fetch(`${origin}/api/classes/activities/${legacyAssignment.id}/submissions`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `token=${tokens.student}` }, body: JSON.stringify(legacyContent) });
  assert.equal(rejectedTxt.status, 415, "Existing assignment upload rule must stay unchanged");
  const legacy = (await pool.query("INSERT INTO submissions (activity_id, student_id, file_name, file_type, file_size, file_data_url, status, submitted_at) VALUES ($1,$2,$3,$4,$5,$6,'pending',NOW()) RETURNING id", [legacyAssignment.id, userIds[1], legacyContent.fileName, legacyContent.fileType, legacyContent.fileSize, legacyContent.fileDataUrl])).rows[0];
  const legacyAnalysis = (await request(`/classes/submissions/${legacy.id}/analyze`, tokens.teacher, "POST")).submission;
  assert.equal(legacyAnalysis.analysis_details.segmentExplanation.status, "completed");
  assert.equal(legacyAnalysis.analysis_details.segmentExplanation.analyzedText, legacyText);
  submissions.push({ id: legacy.id, activityId: legacyAssignment.id, content: legacyContent, format: "txt" });
  console.log("PASS: legacy TXT extraction, real model heatmap, and unchanged new-upload restriction");

  // Same version, overlapping model runs: only the most recently leased run may persist.
  const concurrentId = submissions.find(s => s.format === 'essay').id;
  const analyzeUrl = `${origin}/api/classes/submissions/${concurrentId}/analyze`;
  const firstRun = fetch(analyzeUrl, { method: 'POST', headers: { Cookie: `token=${tokens.teacher}` } });
  const secondRun = fetch(analyzeUrl, { method: 'POST', headers: { Cookie: `token=${tokens.teacher}` } });
  const concurrent = await Promise.all([firstRun, secondRun]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  const winner = await concurrent.find(r => r.status === 200).json();
  const current = await request(`/classes/submissions/${concurrentId}`, tokens.teacher);
  assert.equal(current.submission.analysis_details.analysisId, winner.submission.analysis_details.analysisId);
  assert.equal(current.submission.analysis_details.submissionId, Number(concurrentId));
  console.log('PASS: overlapping analyses cannot overwrite the latest result; ID, probabilities, and explanation remain from one run.');

  // Deny unauthenticated and unrelated users for every original document.
  const stranger = await request("/auth/signup", null, "POST", { name: "Unrelated regression student", email: `detector-test-stranger-${suffix}@example.invalid`, password: `LocalTest-${suffix}!`, role: "student" });
  userIds.push(Number(stranger.user.id));
  const strangerLogin = await request("/auth/login", null, "POST", { email: `detector-test-stranger-${suffix}@example.invalid`, password: `LocalTest-${suffix}!`, role: "student" });
  const otherTeacher = await request("/auth/signup", null, "POST", { name: "Unrelated regression teacher", email: `detector-test-other-teacher-${suffix}@example.invalid`, password: `LocalTest-${suffix}!`, role: "teacher" });
  userIds.push(Number(otherTeacher.user.id));
  const otherTeacherLogin = await request("/auth/login", null, "POST", { email: `detector-test-other-teacher-${suffix}@example.invalid`, password: `LocalTest-${suffix}!`, role: "teacher" });
  for (const { id } of submissions) {
    for (const token of [null, strangerLogin.token, otherTeacherLogin.token]) {
      const response = await fetch(`${origin}/api/classes/documents/submission/${id}`, { headers: token ? { Cookie: `token=${token}` } : {} });
      assert.ok([401, 403].includes(response.status));
    }
  }
  console.log("PASS: document bytes preserved and unauthorized file access denied");
  const legacyCorPdf = previewPdf();
  const legacyCor = (await pool.query("INSERT INTO class_enrollment_requests (class_id, student_id, status, cor_file_name, cor_file_type, cor_file_size, cor_data_url) VALUES ($1,$2,'pending','legacy-cor.pdf','application/pdf',$3,$4) RETURNING id", [classId, stranger.user.id, legacyCorPdf.length, `data:application/pdf;base64,${legacyCorPdf.toString("base64")}`])).rows[0];
  if (process.env.TRUESIGHT_BROWSER_TEST === "1") {
    const { testBrowserPreviews } = await import("./browser-preview.mjs");
    await testBrowserPreviews({ tokens, submissions, enrollment, joinBody, legacyCor });
  }
  const essay = submissions[0];
  await request(`/classes/submissions/${essay.id}/evaluation`, tokens.teacher, "PATCH", { approve: true, rubricScores: { requirements: 18, judgment: 69 }, score: 87, remarks: "Integration test remark", comments: "Reviewed test work" });
  const evaluated = await request(`/classes/submissions/${essay.id}`, tokens.teacher);
  assert.equal(Number(evaluated.submission.teacher_score), 87);
  assert.equal(evaluated.submission.teacher_remarks, "Integration test remark");
  const batch = await request(`/classes/${classId}/submissions/analyze`, tokens.teacher, "POST");
  assert.equal(batch.updated, 6);
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
  if (userIds.length) {
    await pool.query("DELETE FROM submission_grade_history WHERE student_id = ANY($1::int[])", [userIds]);
    await pool.query("DELETE FROM users WHERE id = ANY($1::int[]) AND email LIKE $2", [userIds, `detector-test-%-${suffix}@example.invalid`]);
  }
  await cleanupCurriculumFixtures(); await pool.end();
  if (server.connected) server.send("test-shutdown");
  if (server.exitCode === null) await once(server, "exit");
}
