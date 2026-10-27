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
const base = `http://127.0.0.1:${server.address().port}`, suffix = Date.now(), users = {}, subjectIds = [];
let checks = 0;
const cor = { corFileName: 'synthetic.png', corFileType: 'image/png', corDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=' };
async function call(path, token, method = 'GET', body, expected = 200) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `token=${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json(); assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(data)}`); checks++; return data;
}
async function catalogRow(subjectId, active) {
  const catalog = await call('/classes/curriculum', users.manager.token);
  const s = catalog.subjects.find(s => s.id === subjectId), a = catalog.assignments.find(a => a.subject_id === subjectId && a.department_code === 'BSIT' && a.year_level === 1);
  return { subjectId, code: s.code, name: s.name, subjectVersion: s.version, assignmentVersion: a.version, active };
}
try {
  for (const [name, role] of [['manager','teacher'], ['teacher','teacher'], ['reviewer','teacher'], ['student','student'], ['pending','student'], ['new','student']]) {
    const input = { name, role, email: `curriculum-${name}-${suffix}@example.invalid`, password: `Test-${suffix}!` };
    const registered = await call('/auth/signup', null, 'POST', input, 201);
    users[name] = { id: registered.user.id, token: (await call('/auth/login', null, 'POST', input)).token };
  }
  await call('/classes/academic/options', users.student.token);
  await pool.query('UPDATE users SET can_manage_curriculum=TRUE WHERE id=$1', [users.manager.id]);
  await pool.query('UPDATE users SET can_verify_academics=TRUE WHERE id=$1', [users.reviewer.id]);
  const m = users.manager.token, t = users.teacher.token, s = users.student.token;
  await call('/classes/curriculum', s, 'GET', undefined, 403);
  await call('/classes/curriculum', null, 'GET', undefined, 401);
  for (const token of [s, t, users.reviewer.token]) await call('/classes/curriculum', token, 'POST', { departmentCode: 'BSIT', yearLevel: 1, rows: [] }, 403);
  const before = (await call('/classes/curriculum', m)).subjects.length;
  await ensureCollegeSchema(); await ensureCollegeSchema();
  assert.equal((await call('/classes/curriculum', m)).subjects.length, before, 'Migration must not seed sample subjects.');
  for (const scope of [{ departmentCode: 'INVALID', yearLevel: 1 }, { departmentCode: 'BSIT', yearLevel: '2nd Year' }, { departmentCode: 'BSIT', yearLevel: 5 }]) await call('/classes/curriculum', m, 'POST', { ...scope, rows: [] }, 400);
  const rolledBackCode = `TEST-ROLLBACK-${suffix}`;
  await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT', yearLevel: 1, rows: [{ code: rolledBackCode, name: 'Synthetic rollback', active: true }, { code: '', name: '', active: true }] }, 400);
  assert.ok(!(await call('/classes/curriculum', m)).subjects.some(s => s.code === rolledBackCode), 'Curriculum edits roll back as a batch.');
  const combinations = [];
  for (const [departmentCode] of DEPARTMENTS) for (let yearLevel = 1; yearLevel <= 4; yearLevel++) {
    const code = `TEST-${suffix}-${departmentCode}-${yearLevel}`;
    const saved = await call('/classes/curriculum', m, 'POST', { departmentCode, yearLevel, rows: [{ code: code.toLowerCase(), name: 'Synthetic curriculum regression subject', active: true }] });
    const subject = (await call('/classes/curriculum', m)).subjects.find(s => s.code === code); subjectIds.push(subject.id);
    assert.deepEqual(saved.catalog.subjects.find(s => s.code === code), subject, 'Save response must contain the database-generated ID and version seen by a fresh request.');
    const assignment = saved.catalog.assignments.find(a => a.subject_id === subject.id && a.department_code === departmentCode && a.year_level === yearLevel);
    assert.ok(assignment?.id); assert.equal(assignment.active, true); assert.equal(assignment.version, 1);
    const classroom = (await call('/classes', t, 'POST', { name: code, code: `CU${suffix}${combinations.length}`, description: 'Synthetic curriculum regression fixture', subjectId: subject.id, departmentCode, yearLevel }, 201)).class;
    combinations.push({ departmentCode, yearLevel, subject, classroom });
  }
  await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT', yearLevel: 1, rows: [{ code: combinations[0].subject.code.toLowerCase(), name: 'Duplicate', active: true }] }, 409);
  const initial = await catalogRow(combinations[0].subject.id, true);
  const beforeHistory = (await call(`/classes/curriculum/history?subjectId=${initial.subjectId}`, m)).history;
  await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT', yearLevel: 1, rows: [{ ...initial,code:`TEST-ACCIDENT-${suffix}`,name:'Accidental replacement' }] }, 409);
  const unchanged = (await call('/classes/curriculum',m)).subjects.find(s=>s.id===initial.subjectId);
  assert.equal(unchanged.code,initial.code);assert.equal(unchanged.name,initial.name);assert.equal(unchanged.version,initial.subjectVersion);
  assert.equal((await call(`/classes/curriculum/history?subjectId=${initial.subjectId}`,m)).history.length,beforeHistory.length,'Rejected replacement creates no misleading history.');
  for (const token of [t,s]) await call(`/classes/curriculum/history?subjectId=${initial.subjectId}`,token,'GET',undefined,403);
  const edited = await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT', yearLevel: 1, rows: [{ ...initial, editExisting:true, name: 'Synthetic persisted subject edit' }] });
  const fresh = await call('/classes/curriculum', m);
  const editedSubject = edited.catalog.subjects.find(s => s.id === initial.subjectId);
  assert.equal(editedSubject.version, initial.subjectVersion + 1);
  assert.equal(fresh.subjects.find(s => s.id === initial.subjectId).name, 'Synthetic persisted subject edit');
  const history = (await call(`/classes/curriculum/history?subjectId=${initial.subjectId}`,m)).history;
  const rename = history.find(h=>h.operation==='UPDATE' && h.entity_table==='subjects');
  assert.equal(rename.before_data.name,initial.name);assert.equal(rename.after_data.name,editedSubject.name);
  await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT', yearLevel: 1, rows: [{ ...initial, subjectVersion: editedSubject.version, name: editedSubject.name }] });
  assert.equal((await call('/classes/curriculum', m)).assignments.filter(a => a.subject_id === initial.subjectId && a.department_code === 'BSIT' && a.year_level === 1).length, 1, 'Saving and reloading must not duplicate an assignment.');
  const closed = (await call('/classes', t, 'POST', { name: 'Unmapped legacy-like class', code: `UM${suffix}`, description: 'Synthetic unmapped fixture', departmentCode: 'BSIT', yearLevel: 1 }, 201)).class;
  assert.equal(closed.enrollment_open, false);
  await call(`/classes/${closed.id}/enrollment-settings`, t, 'PATCH', { departmentCode: 'BSIT', yearLevel: 1, enrollmentOpen: true }, 400);
  // Simulate an active legacy class whose mapping is missing; do not modify any real class.
  await pool.query('UPDATE classes SET enrollment_open=TRUE WHERE id=$1', [closed.id]);
  assert.ok((await call('/classes/curriculum', m)).issues.some(c => c.id === closed.id));
  await call('/classes/join/lookup', s, 'POST', { code: `INVALID-${suffix}` }, 404);
  let allowed = 0, mismatches = 0;
  for (const own of combinations) {
    await pool.query('UPDATE users SET department_code=$2,year_level=$3 WHERE id=$1', [users.student.id, own.departmentCode, own.yearLevel]);
    const available = await call('/classes/eligible', s);
    const fixtureClasses = available.classes.filter(c => combinations.some(v => v.classroom.id === c.id));
    const fixtureSubjects = available.subjects.filter(s => subjectIds.includes(s.id));
    assert.equal(fixtureClasses.length, 1); assert.equal(fixtureClasses[0].id, own.classroom.id);
    assert.equal(fixtureSubjects.length, 1); assert.equal(fixtureSubjects[0].id, own.subject.id);
    for (const other of combinations) {
      const lookup = await call('/classes/join/lookup', s, 'POST', { code: other.classroom.code });
      assert.equal(lookup.eligible, own === other);
      assert.equal(lookup.class.subject_id, other.subject.id);
      assert.equal(lookup.class.teacher_id, undefined); assert.equal(lookup.class.description, undefined);
      if (own !== other) {
        // Manipulating declarations cannot bypass verified records; no COR is required to receive this denial.
        const denied = await call('/classes/join', s, 'POST', { code: other.classroom.code, departmentCode: other.departmentCode, yearLevel: other.yearLevel }, 403);
        assert.equal(denied.eligibility.eligible, false); mismatches++;
      }
    }
    assert.equal((await call('/classes/enrollment-requests', t)).requests.filter(r => r.status === 'pending').length, 0);
    const body = { code: own.classroom.code, departmentCode: own.departmentCode, yearLevel: own.yearLevel, ...cor };
    const request = (await call('/classes/join', s, 'POST', body, 202)).request;
    assert.equal(request.eligible_for_approval, true); assert.equal(request.subject_code, own.subject.code);
    assert.equal((await call(`/classes/documents/cor/${request.id}`, t)).document.dataUrl, cor.corDataUrl);
    await call('/classes/join', s, 'POST', body, 409);
    await call(`/classes/enrollment-requests/${request.id}`, t, 'PATCH', { status: 'accepted' });
    await call('/classes/join', s, 'POST', body, 409); allowed++;
  }
  assert.equal(allowed, 20); assert.equal(mismatches, 380);
  assert.equal((await call('/classes/enrolled', s)).classes.length, 20);
  await pool.query("UPDATE users SET department_code='BSIT',year_level=1 WHERE id=ANY($1::int[])", [[users.student.id,users.pending.id]]);
  const unmapped = await call('/classes/join/lookup', s, 'POST', { code: closed.code });
  assert.equal(unmapped.eligible, false); assert.equal(unmapped.eligibility.code, 'CURRICULUM_NOT_CONFIGURED');
  await call('/classes/join', s, 'POST', { code: closed.code, departmentCode: 'BSIT', yearLevel: 1, ...cor }, 403);
  const own = combinations[0], p = users.pending.token;
  const body = { code: own.classroom.code, departmentCode: 'BSIT', yearLevel: 1, ...cor };
  const race = await Promise.all([1,2].map(() => fetch(base + '/classes/join', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `token=${p}` }, body: JSON.stringify(body) })));
  assert.deepEqual(race.map(r => r.status).sort(), [202,409]); const pending = (await race.find(r => r.status === 202).json()).request;
  let stale = await catalogRow(own.subject.id, false);
  await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT', yearLevel: 1, rows: [stale] });
  await call('/classes/curriculum', m, 'POST', { departmentCode: 'BSIT', yearLevel: 1, rows: [stale] }, 409);
  assert.equal((await call('/classes/enrollment-requests', t)).requests.find(r => r.id === pending.id).eligible_for_approval, false);
  await call(`/classes/enrollment-requests/${pending.id}`, t, 'PATCH', { status: 'accepted' }, 403);
  assert.equal((await call('/classes/enrolled', p)).classes.length, 0);
  assert.equal((await call('/classes/enrolled', s)).classes.length, 20, 'Curriculum edits cannot remove historical enrollments.');
  await call(`/classes/${own.classroom.id}/activities`, s);
  assert.equal((await call(`/classes/documents/cor/${pending.id}`, p)).document.dataUrl, cor.corDataUrl);
  await call(`/classes/enrollment-requests/${pending.id}`, t, 'PATCH', { status: 'rejected' });
  // Explicit shared subject across a second department/year, not a department bypass.
  const catalog = await call('/classes/curriculum', m), subject = catalog.subjects.find(s => s.id === own.subject.id);
  await call('/classes/curriculum', m, 'POST', { departmentCode: 'BEED', yearLevel: 2, rows: [{ subjectId: subject.id, code: subject.code, name: subject.name, subjectVersion: subject.version, active: true }] });
  const shared = (await call('/classes', t, 'POST', { subjectId: subject.id, departmentCode: 'BEED', yearLevel: 2, name: 'Synthetic shared subject', code: `SH${suffix}`, description: 'Shared mapping regression' }, 201)).class;
  assert.equal((await call('/classes/join/lookup', p, 'POST', { code: shared.code })).eligible, false);
  await pool.query("UPDATE users SET department_code='BEED',year_level=2 WHERE id=$1", [users.pending.id]);
  assert.equal((await call('/classes/join/lookup', p, 'POST', { code: shared.code })).eligible, true);
  const changed = (await call('/classes/join', p, 'POST', { code: shared.code, departmentCode: 'BEED', yearLevel: 2, ...cor }, 202)).request;
  const alternative = combinations.find(c => c.departmentCode === 'BEED' && c.yearLevel === 2);
  await call(`/classes/${shared.id}/enrollment-settings`, t, 'PATCH', { subjectId: alternative.subject.id, departmentCode: 'BEED', yearLevel: 2, enrollmentOpen: true });
  await call(`/classes/enrollment-requests/${changed.id}`, t, 'PATCH', { status: 'accepted' }, 409);
  assert.equal((await call('/classes/enrollment-requests', t)).requests.find(r => r.id === changed.id).eligible_for_approval, false);
  await call(`/classes/enrollment-requests/${changed.id}`, t, 'PATCH', { status: 'rejected' });
  const profileChanged = (await call('/classes/join', p, 'POST', { code: alternative.classroom.code, departmentCode: 'BEED', yearLevel: 2, ...cor }, 202)).request;
  await pool.query('UPDATE users SET year_level=3 WHERE id=$1', [users.pending.id]);
  await call(`/classes/enrollment-requests/${profileChanged.id}`, t, 'PATCH', { status: 'accepted' }, 403);
  await call(`/classes/enrollment-requests/${profileChanged.id}`, t, 'PATCH', { status: 'rejected' });
  await call(`/classes/${own.classroom.id}/enrollment-settings`, t, 'PATCH', { departmentCode: 'BSIT', yearLevel: 1, enrollmentOpen: false });
  const unverified = users.new.token;
  await call('/classes/join', unverified, 'POST', { code: shared.code, departmentCode: 'BEED', yearLevel: 2, ...cor }, 403);
  const academicCor = { fileName: cor.corFileName, fileType: cor.corFileType, fileDataUrl: cor.corDataUrl };
  const academic = (await call('/classes/academic/verification-requests', unverified, 'POST', { departmentCode: 'BEED', yearLevel: 2 }, 201)).request;
  await call(`/classes/academic/verification-requests/${academic.id}/cor`, t, 'PATCH', { cor: academicCor }, 403);
  await call(`/classes/academic/verification-requests/${academic.id}/cor`, p, 'PATCH', { cor: academicCor }, 404);
  await call(`/classes/academic/verification-requests/${academic.id}/cor`, unverified, 'PATCH', {}, 400);
  await call(`/classes/academic/verification-requests/${academic.id}/cor`, unverified, 'PATCH', { cor: academicCor });
  const ownCatalog = await call('/classes/eligible',unverified);
  const ownAcademic = ownCatalog.verificationRequests.find(r=>r.id===academic.id);
  assert.equal(ownAcademic.cor_file_name,cor.corFileName);assert.equal(ownAcademic.cor_data_url,undefined,'Enrollment catalog exposes own document metadata, not COR bytes.');
  assert.ok(!(await call('/classes/eligible',p)).verificationRequests.some(r=>r.id===academic.id),'Another student cannot see this academic request.');
  await call(`/classes/academic/verification-requests/${academic.id}/cor`, unverified, 'PATCH', { cor: academicCor }, 409);
  assert.equal((await call(`/classes/documents/academic-cor/${academic.id}`, unverified)).document.dataUrl, cor.corDataUrl);
  for (const token of [t, m, p]) await call(`/classes/documents/academic-cor/${academic.id}`, token, 'GET', undefined, 403);
  await call(`/classes/documents/academic-cor/${academic.id}`, users.reviewer.token);
  const queue = (await call('/classes/academic/review', users.reviewer.token)).requests.find(r => r.id === academic.id);
  assert.equal(queue.cor_file_name, cor.corFileName); assert.equal(queue.cor_data_url, undefined);
  await call(`/classes/academic/review/${academic.id}`, users.reviewer.token, 'PATCH', { status: 'approved' });
  const approvedCatalog = await call('/classes/eligible',unverified);
  assert.equal(approvedCatalog.profile.department_code,'BEED');assert.equal(approvedCatalog.verificationRequests.find(r=>r.id===academic.id).status,'approved');
  assert.equal((await call('/classes/join/lookup', unverified, 'POST', { code: shared.code })).eligible, true);
  assert.equal((await call('/classes/enrollment-requests/mine', unverified)).requests.length, 0, 'Standalone academic COR creates no class request.');
  const directAcademic = (await call('/classes/academic/verification-requests', unverified, 'POST', { departmentCode: 'BEED', yearLevel: 2, cor: academicCor }, 201)).request;
  await call('/classes/join', unverified, 'POST', { code: own.classroom.code, departmentCode: 'BEED', yearLevel: 2, ...cor }, 403);
  assert.equal((await call(`/classes/documents/academic-cor/${directAcademic.id}`, unverified)).document.dataUrl, cor.corDataUrl, 'An ineligible class request must not delete independent academic COR evidence.');
  const total = (await pool.query('SELECT count(*)::int AS n FROM class_enrollment_requests WHERE student_id=ANY($1::int[])', [[users.student.id,users.pending.id]])).rows[0].n;
  assert.equal(total, 23, '380 mismatches and unmapped attempts must create no teacher requests.');
  console.log(`PASS: ${checks} HTTP checks; all 20 department/year combinations admitted with COR and teacher approval; all 380 mismatches blocked before COR; shared assignments, structured API denials, stale curriculum/approval, historical access, duplicate races, permissions, no sample seeding, independent academic COR privacy.`);
} finally {
  const ids = Object.values(users).map(u => u.id);
  if (ids.length) await pool.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2', [ids, `curriculum-%-${suffix}@example.invalid`]);
  if (subjectIds.length) { await cleanupSubjectHistory(subjectIds); await pool.query('DELETE FROM curriculum_subjects WHERE subject_id=ANY($1::int[])', [subjectIds]); await pool.query('DELETE FROM subjects WHERE id=ANY($1::int[])', [subjectIds]); }
  await new Promise(r => server.close(r)); await pool.end();
}
