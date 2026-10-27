import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import auth from '../dist/routes/auth.js';
import classes from '../dist/routes/classes.js';
import pool from '../dist/config/db.js';
import { DEPARTMENTS, ensureCollegeSchema } from '../dist/services/CollegeEnrollment.js';
import { cleanupSubjectHistory } from './curriculum-fixture.mjs';

const app = express(); app.use(express.json({ limit: '8mb' })); app.use(cookieParser()); app.use('/auth', auth); app.use('/classes', classes);
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`, suffix = Date.now(), users = {}, subjectIds = [], offerings = [], codes = new Set();
let checks = 0;
const cor = { corFileName: 'synthetic.png', corFileType: 'image/png', corDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=' };
async function call(path, token, method = 'GET', body, expected = 200) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `token=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json(); assert.equal(res.status, expected, `${method} ${path}: ${JSON.stringify(data)}`); checks++; return data;
}
try {
  const before = (await pool.query('SELECT id,subject_id,department_code,year_level,semester,active FROM curriculum_subjects ORDER BY id')).rows;
  await ensureCollegeSchema(); await ensureCollegeSchema();
  assert.deepEqual((await pool.query('SELECT id,subject_id,department_code,year_level,semester,active FROM curriculum_subjects ORDER BY id')).rows, before, 'Repeating migration must preserve every real curriculum assignment.');
  for (const [name, role] of [['manager','teacher'],['teacher','teacher'],['student','student'],['other','student']]) {
    const input = { name, role, email: `semester-${name}-${suffix}@example.invalid`, password: `Test-${suffix}!` };
    const registered = await call('/auth/signup', null, 'POST', input, 201);
    users[name] = { id: registered.user.id, token: (await call('/auth/login', null, 'POST', input)).token };
  }
  await call('/classes/academic/options', users.student.token);
  await pool.query('UPDATE users SET can_manage_curriculum=TRUE WHERE id=$1', [users.manager.id]);
  const m = users.manager.token, t = users.teacher.token, s = users.student.token;
  for (const invalid of [0,3,'1','First Semester',null]) {
    await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT', yearLevel: 1, semester: invalid, rows: [] }, 400);
    await call('/classes', t, 'POST', { departmentCode: 'BSIT', yearLevel: 1, semester: invalid, subjectId: 1, description: 'Invalid semester' }, 400);
  }
  for (const [departmentCode] of DEPARTMENTS) for (let yearLevel = 1; yearLevel <= 4; yearLevel++) {
    await pool.query('UPDATE users SET department_code=$2,year_level=$3 WHERE id=$1', [users.student.id,departmentCode,yearLevel]);
    for (const semester of [1,2]) {
      const count = semester === 1 ? 3 : 2;
      const prefix = `TEST-S${suffix}-${departmentCode}-${yearLevel}-${semester}`;
      const rows = Array.from({ length: count }, (_, i) => ({ code: `${prefix}-${i}`, name: `Synthetic semester ${semester} subject ${i}`, active: true }));
      const saved = (await call('/classes/curriculum', m, 'POST', { departmentCode,yearLevel,semester,rows })).catalog;
      const subjects = saved.subjects.filter(v => v.code.startsWith(prefix)); subjectIds.push(...subjects.map(v => v.id));
      assert.equal(subjects.length, count, 'Every saved subject must be returned, not only the first.');
      const fresh = await call('/classes/curriculum', t);
      assert.equal(fresh.assignments.filter(a => subjects.some(v => v.id === a.subject_id) && a.department_code === departmentCode && a.year_level === yearLevel && a.semester === semester).length, count);
      const available = await call('/classes/eligible', s);
      assert.equal(available.subjects.filter(v => subjects.some(sub => sub.id === v.id) && v.semester === semester).length, count);
      const subject = subjects[0];
      await call('/classes', t, 'POST', { departmentCode,yearLevel,semester: semester === 1 ? 2 : 1,subjectId: subject.id,description: 'Wrong semester fixture' }, 403);
      const classroom = (await call('/classes', t, 'POST', { departmentCode,yearLevel,semester,subjectId: subject.id,description: 'Synthetic semester class' }, 201)).class;
      assert.equal(classroom.name, `${subject.code} - ${subject.name}`); assert.equal(classroom.semester, semester);
      assert.match(classroom.code, /^[A-Z]{3}\d{3}-[A-Z]{2}\d$/); assert.ok(!codes.has(classroom.code)); codes.add(classroom.code);
      const lookup = await call('/classes/join/lookup', s, 'POST', { code: classroom.code });
      assert.equal(lookup.eligible, true); assert.equal(lookup.class.semester, semester); assert.equal(lookup.class.subject_code, subject.code);
      const wrongSemester = await call('/classes/join', s, 'POST', { code:classroom.code,departmentCode,yearLevel,semester:semester===1?2:1,...cor },403);
      assert.equal(wrongSemester.eligibility.code,'SEMESTER_MISMATCH');assert.equal(wrongSemester.eligibility.requiredSemester,semester);
      const request = (await call('/classes/join', s, 'POST', { code: classroom.code,departmentCode,yearLevel,semester,...cor }, 202)).request;
      assert.equal(request.requested_semester, semester); assert.equal(request.eligible_for_approval, true);
      assert.equal((await call(`/classes/documents/cor/${request.id}`, t)).document.dataUrl, cor.corDataUrl);
      await call(`/classes/enrollment-requests/${request.id}`, t, 'PATCH', { status: 'accepted' });
      offerings.push({ departmentCode,yearLevel,semester,subject,classroom });
    }
  }
  assert.equal(offerings.length,40); assert.equal((await call('/classes/enrolled', s)).classes.length,40);
  const first = offerings.find(o => o.departmentCode === 'BSIT' && o.yearLevel === 1 && o.semester === 1);
  const current = await call('/classes/curriculum', m), shared = current.subjects.find(v => v.id === first.subject.id);
  // One canonical subject can legitimately be mapped into both semesters.
  const second = (await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT',yearLevel: 1,semester: 2,rows: [{ subjectId: shared.id,code: shared.code,name: shared.name,subjectVersion: shared.version,active: true }] })).catalog;
  const secondAssignment = second.assignments.find(a => a.subject_id === shared.id && a.department_code === 'BSIT' && a.year_level === 1 && a.semester === 2);
  assert.ok(secondAssignment); assert.ok(second.assignments.some(a => a.subject_id === shared.id && a.semester === 1));
  await pool.query("UPDATE users SET department_code='BSIT',year_level=1 WHERE id=$1", [users.other.id]);
  const other = users.other.token;
  const pending = (await call('/classes/join', other, 'POST', { code: first.classroom.code,departmentCode: 'BSIT',yearLevel: 1,...cor }, 202)).request;
  await call(`/classes/${first.classroom.id}/enrollment-settings`, t, 'PATCH', { departmentCode: 'BSIT',yearLevel: 1,subjectId: shared.id,semester: 2,enrollmentOpen: true });
  await call(`/classes/enrollment-requests/${pending.id}`, t, 'PATCH', { status: 'accepted' }, 409);
  assert.equal((await call('/classes/enrollment-requests', t)).requests.find(r => r.id === pending.id).eligible_for_approval,false);
  await call(`/classes/enrollment-requests/${pending.id}`, t, 'PATCH', { status: 'rejected' });
  const secondPending = (await call('/classes/join', other, 'POST', { code: first.classroom.code,departmentCode: 'BSIT',yearLevel: 1,...cor }, 202)).request;
  await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT',yearLevel: 1,semester: 2,rows: [{ subjectId: shared.id,code: shared.code,name: shared.name,subjectVersion: shared.version,assignmentVersion: secondAssignment.version,active: false }] });
  assert.equal((await call('/classes/join/lookup', other, 'POST', { code: first.classroom.code })).eligible,false);
  await call(`/classes/enrollment-requests/${secondPending.id}`, t, 'PATCH', { status: 'accepted' }, 403);
  // First-semester mapping still works, and historical members keep their access.
  await call(`/classes/${first.classroom.id}/enrollment-settings`, t, 'PATCH', { departmentCode: 'BSIT',yearLevel: 1,subjectId: shared.id,semester: 1,enrollmentOpen: true });
  assert.equal((await call('/classes/join/lookup', other, 'POST', { code: first.classroom.code })).eligible,true);
  assert.equal((await call('/classes/enrolled', s)).classes.length,40);
  await call(`/classes/${first.classroom.id}/activities`, s);
  console.log(`PASS: ${checks} semester HTTP checks; all 40 department/year/semester combinations, 100 saved subjects, multiple picker options, derived class identity, unique generated join codes, COR and approval, wrong-semester rejection, shared subjects, stale-semester approvals, independent deactivation, preserved data and historical access.`);
} finally {
  const ids = Object.values(users).map(u => u.id);
  if (ids.length) await pool.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2', [ids, `semester-%-${suffix}@example.invalid`]);
  if (subjectIds.length) {await cleanupSubjectHistory(subjectIds);await pool.query('DELETE FROM curriculum_subjects WHERE subject_id=ANY($1::int[])', [subjectIds]); await pool.query('DELETE FROM subjects WHERE id=ANY($1::int[])', [subjectIds]);}
  await new Promise(r => server.close(r)); await pool.end();
}
