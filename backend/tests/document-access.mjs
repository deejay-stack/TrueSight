import { fixtureSubject, cleanupCurriculumFixtures } from './curriculum-fixture.mjs';
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import authRoutes from "../dist/routes/auth.js";
import classRoutes from "../dist/routes/classes.js";
import pool from "../dist/config/db.js";

// The route modules can be exercised without starting or replacing any detector.
const app = express();
app.use(express.json({ limit: "8mb" })); app.use(cookieParser());
app.use("/api/auth", authRoutes); app.use("/api/classes", classRoutes);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const origin = `http://127.0.0.1:${server.address().port}/api`;
const suffix = String(Date.now());
const ids = [];
async function call(route, token, method = "GET", body, expected = 200) {
  const response = await fetch(`${origin}${route}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Cookie: `token=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
try {
  const tokens = {};
  for (const [name, role] of [["teacher", "teacher"], ["student", "student"], ["otherTeacher", "teacher"], ["otherStudent", "student"]]) {
    const credentials = { name: `Preview access ${name}`, email: `preview-access-${name}-${suffix}@example.invalid`, password: `PreviewTest-${suffix}!`, role };
    const registered = await call("/auth/signup", null, "POST", credentials, 201);
    ids.push(Number(registered.user.id));
    if (role === "student") await pool.query("UPDATE users SET department_code='BSIT',year_level=$2 WHERE id=$1", [registered.user.id, 1]);
    tokens[name] = (await call("/auth/login", null, "POST", credentials)).token;
  }
  const classroom = (await call("/classes", tokens.teacher, "POST", { subjectId: await fixtureSubject(), departmentCode: "BSIT", yearLevel: 1, name: "Preview access fixture", description: "Temporary document permission check", code: `PA${suffix}` }, 201)).class;
  const bytes = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=";
  await call("/classes/join", tokens.student, "POST", { code: classroom.code, departmentCode: "BSIT", yearLevel: 1, corFileName: "fixture.png", corFileType: "image/png", corFileSize: 68, corDataUrl: bytes }, 202);
  const request = (await call("/classes/enrollment-requests", tokens.teacher)).requests.find((item) => Number(item.class_id) === Number(classroom.id));
  for (const token of [tokens.teacher, tokens.student]) {
    const { document } = await call(`/classes/documents/cor/${request.id}`, token);
    assert.equal(document.dataUrl, bytes); assert.equal(document.kind, "cor");
  }
  for (const [token, status] of [[null, 401], [tokens.otherTeacher, 403], [tokens.otherStudent, 403]]) await call(`/classes/documents/cor/${request.id}`, token, "GET", null, status);
  await call(`/classes/documents/cor/not-a-number`, tokens.teacher, "GET", null, 400);
  await call(`/classes/enrollment-requests/${request.id}`, tokens.teacher, "PATCH", { status: "rejected", rejectionNote: "Test" });
  assert.equal((await call(`/classes/documents/cor/${request.id}`, tokens.student)).document.status, "rejected");
  assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM class_enrollments WHERE class_id=$1", [classroom.id])).rows[0].count, 0);
  console.log("PASS: stored COR is readable by its student and class teacher; unrelated teachers/students and unauthenticated readers are denied; rejection and enrollment behavior preserved");
} finally {
  if (ids.length) await pool.query("DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2", [ids, `preview-access-%-${suffix}@example.invalid`]);
  await new Promise((resolve) => server.close(resolve));
  await cleanupCurriculumFixtures(); await pool.end();
}
