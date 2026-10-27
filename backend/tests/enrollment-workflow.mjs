import { fixtureSubject, cleanupCurriculumFixtures } from './curriculum-fixture.mjs';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import auth from '../dist/routes/auth.js';
import classes from '../dist/routes/classes.js';
import pool from '../dist/config/db.js';
const app = express(); app.use(express.json({ limit: '8mb' })); app.use(cookieParser()); app.use('/auth', auth); app.use('/classes', classes);
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`; const suffix = Date.now(); const ids = []; let checks = 0;
async function call(route, token, method = 'GET', body, expected = 200) {
  const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `token=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await res.json(); assert.equal(res.status, expected, `${method} ${route}: ${JSON.stringify(data)}`); checks++; return data;
}
const cor = { departmentCode: 'BSIT', yearLevel: 2, section: 'A', corFileName: 'original.png', corFileType: 'image/png', corFileSize: 68, corDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=' };
try {
  const users = {};
  for (const [name, role] of [['student', 'student'], ['other', 'student'], ['teacher', 'teacher'], ['unrelated', 'teacher'], ['reviewer', 'teacher']]) {
    const credentials = { name, email: `workflow-${name}-${suffix}@example.invalid`, password: `Test-${suffix}!`, role };
    const signup = await call('/auth/signup', null, 'POST', credentials, 201); ids.push(signup.user.id);
    users[name] = { id: signup.user.id, token: (await call('/auth/login', null, 'POST', credentials)).token };
  }
  const s = users.student.token, t = users.teacher.token, r = users.reviewer.token;
  const classroom = (await call('/classes', t, 'POST', { name: 'Verified college subject', description: 'Workflow regression fixture', code: `WF${suffix}`, subjectId: await fixtureSubject('BSIT',2), departmentCode: 'BSIT', yearLevel: 2 }, 201)).class;
  const body = { ...cor, section: 'B', code: classroom.code };
  await call('/classes/join/lookup', s, 'POST', { code: classroom.code });
  assert.equal((await call('/classes/enrollment-requests', t)).requests.length, 0, 'Code verification sends no request or approval notification.');
  assert.equal((await call('/classes/notifications', t)).notifications.filter(n => n.type === 'enrollment_request').length, 0);
  await call('/classes/join', s, 'POST', body, 403);
  assert.equal((await call('/classes/enrollment-requests', t)).requests.length, 0);
  await pool.query("UPDATE users SET department_code='BSIT',year_level=2,section='A' WHERE id=ANY($1::int[])", [[users.student.id, users.other.id]]);
  await call('/classes/join', s, 'POST', { ...body, corDataUrl: undefined }, 400);
  await call('/classes/join', s, 'POST', { ...body, corDataUrl: 'data:image/png;base64,SGVsbG8=' }, 415);
  assert.equal((await call('/classes/academic/profile', s)).requests.length, 0, 'A failed request creates no orphan verification.');
  const request = (await call('/classes/join', s, 'POST', body, 202)).request;
  assert.equal(request.verification_status, 'Pending Academic Verification'); assert.equal(request.eligible_for_approval, false); assert.equal(request.declared_section, 'B'); assert.equal(request.cor_submitted, true);
  assert.equal((await call('/classes/academic/profile', s)).profile.department_code, 'BSIT', 'Declaration cannot change the official profile.');
  await call('/classes/join', s, 'POST', body, 409);
  const queue = (await call('/classes/enrollment-requests', t)).requests; assert.ok(queue.some(v => v.id === request.id)); assert.equal(queue[0].declared_department, 'BSIT'); assert.equal(queue[0].official_department, 'BSIT'); assert.equal(queue[0].cor_data_url, undefined);
  assert.equal((await call('/classes/enrollment-requests', users.unrelated.token)).requests.length, 0);
  assert.equal((await call('/classes/enrollment-requests/mine', users.other.token)).requests.length, 0);
  const notices = (await call('/classes/notifications', t)).notifications; assert.ok(notices.some(n => n.type === 'enrollment_request'));
  for (const token of [s, t]) assert.equal((await call(`/classes/documents/cor/${request.id}`, token)).document.dataUrl, cor.corDataUrl);
  for (const token of [users.other.token, users.unrelated.token, r]) await call(`/classes/documents/cor/${request.id}`, token, 'GET', undefined, 403);
  await call(`/classes/enrollment-requests/${request.id}`, users.unrelated.token, 'PATCH', { status: 'accepted' }, 404);
  await call(`/classes/enrollment-requests/${request.id}`, t, 'PATCH', { status: 'accepted' }, 403);
  assert.equal((await call('/classes/enrolled', s)).classes.length, 0);
  await pool.query('UPDATE users SET can_verify_academics=TRUE WHERE id=$1', [users.reviewer.id]);
  const academics = (await call('/classes/academic/review', r)).requests.find(v => v.id === request.academic_request_id);
  assert.ok(academics.enrollment_requests.some(v => v.id === request.id));
  assert.equal((await call(`/classes/documents/cor/${request.id}`, r)).document.dataUrl, cor.corDataUrl);
  await call(`/classes/academic/review/${academics.id}`, t, 'PATCH', { status: 'approved' }, 403);
  await call(`/classes/academic/review/${academics.id}`, r, 'PATCH', { status: 'approved', note: 'Fixture official registration checked against COR.' });
  const ready = (await call('/classes/enrollment-requests', t)).requests.find(v => v.id === request.id); assert.equal(ready.verification_status, 'Pending Teacher Approval'); assert.equal(ready.eligible_for_approval, true);
  await call(`/classes/enrollment-requests/${request.id}`, t, 'PATCH', { status: 'accepted' });
  assert.ok((await call('/classes/enrolled', s)).classes.some(c => c.id === classroom.id));
  const accepted = (await call('/classes/enrollment-requests/mine', s)).requests.find(v => v.id === request.id); assert.equal(accepted.verification_status, 'Enrolled'); assert.equal(accepted.cor_file_name, cor.corFileName);
  assert.ok((await call('/classes/notifications', s)).notifications.some(n => n.type === 'enrollment_review' && n.title === 'Enrollment Approved'));
  await call(`/classes/enrollment-requests/${request.id}`, t, 'PATCH', { status: 'accepted' }, 409);
  const next = (await call('/classes/join', users.other.token, 'POST', body, 202)).request;
  await call(`/classes/enrollment-requests/${next.id}`, t, 'PATCH', { status: 'rejected', rejectionNote: 'Registration details need correction.' });
  const rejected = (await call('/classes/enrollment-requests/mine', users.other.token)).requests.find(v => v.id === next.id); assert.equal(rejected.rejection_note, 'Registration details need correction.'); assert.equal(rejected.verification_status, 'Rejected');
  assert.equal((await call(`/classes/documents/cor/${next.id}`, users.other.token)).document.dataUrl, cor.corDataUrl);
  assert.ok((await call('/classes/notifications', users.other.token)).notifications.some(n => n.message.includes('Registration details need correction.')));
  await call('/classes/join', users.other.token, 'POST', { ...body, departmentCode: 'BSHM' }, 403);
  await call('/classes/join', users.other.token, 'POST', { ...body, yearLevel: 3 }, 403);
  console.log(`PASS: ${checks} HTTP checks for lookup -> saved COR/request -> assigned teacher -> academic verification -> admission, notifications, rejection/history, and private document access.`);
} finally {
  if (ids.length) await pool.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2', [ids, `workflow-%-${suffix}@example.invalid`]);
  await new Promise(r => server.close(r)); await cleanupCurriculumFixtures(); await pool.end();
}
