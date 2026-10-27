import { fixtureSubject, cleanupCurriculumFixtures } from './curriculum-fixture.mjs';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import auth from '../dist/routes/auth.js';
import classes from '../dist/routes/classes.js';
import pool from '../dist/config/db.js';
import { DEPARTMENTS, collegeEligibility, ensureCollegeSchema } from '../dist/services/CollegeEnrollment.js';

const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/auth', auth); app.use('/classes', classes);
const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`; const suffix = Date.now(); const ids = []; let checks = 0;
async function call(route, token, method = 'GET', body, expected = 200) {
  const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `token=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await res.json(); assert.equal(res.status, expected, `${method} ${route}: ${JSON.stringify(data)}`); checks++; return data;
}
try {
  const users = {};
  for (const [name, role] of [['student', 'student'], ['second', 'student'], ['reviewer', 'teacher'], ['teacher', 'teacher']]) {
    const credentials = { name, email: `college-${name}-${suffix}@example.invalid`, password: `Test-${suffix}!`, role };
    const signup = await call('/auth/signup', null, 'POST', credentials, 201); ids.push(signup.user.id);
    users[name] = { id: signup.user.id, token: (await call('/auth/login', null, 'POST', credentials)).token };
  }
  const s = users.student.token, t = users.teacher.token, r = users.reviewer.token;
  const options = await call('/classes/academic/options', s); assert.equal(options.departments.length, 5); assert.equal(options.yearLevels.length, 4); assert.equal(options.canReview, false);
  await call('/classes/academic/profile', null, 'GET', undefined, 401);
  await call('/classes/academic/review', s, 'GET', undefined, 403); await call('/classes/academic/review', t, 'GET', undefined, 403);
  for (const departmentCode of ['INVALID', '', 'BSIT<script>']) await call('/classes/academic/verification-requests', s, 'POST', { departmentCode, yearLevel: 1 }, 400);
  for (const yearLevel of [0, 5, 1.1, '4th', null]) await call('/classes/academic/verification-requests', s, 'POST', { departmentCode: 'BSIT', yearLevel }, 400);
  const classroom = (await call('/classes', t, 'POST', { name: 'College subject', description: 'Temporary college enrollment fixture', code: `CG${suffix}`, subjectId: await fixtureSubject('BSIT',4), departmentCode: 'BSIT', yearLevel: 4 }, 201)).class;
  const lookup = await call('/classes/join/lookup', s, 'POST', { code: classroom.code }); assert.equal(lookup.eligible, false); assert.match(lookup.eligibilityMessage, /verification required/i);
  assert.deepEqual(Object.keys(lookup.class).sort(), ['semester','subject_id','subject_code','subject_name','code','department_code','enrollment_open','id','name','teacher_name','year_level'].sort());
  await call('/classes/join/lookup', s, 'POST', { code: 'DOESNOTEXIST' }, 404);
  const verification = (await call('/classes/academic/verification-requests', s, 'POST', { departmentCode: 'BSIT', yearLevel: 4, section: 'Rizal' }, 201)).request;
  assert.equal((await call('/classes/academic/profile', s)).profile.department_code, null);
  await call('/classes/academic/verification-requests', s, 'POST', { departmentCode: 'BSIT', yearLevel: 4 }, 409);
  for (const token of [s, t, users.second.token]) await call(`/classes/academic/review/${verification.id}`, token, 'PATCH', { status: 'approved' }, 403);
  // Fixture-only grant; no real account permissions are changed.
  await pool.query('UPDATE users SET can_verify_academics=TRUE WHERE id=$1', [users.reviewer.id]);
  assert.equal((await call('/classes/academic/options', r)).canReview, true);
  assert.ok((await call('/classes/academic/review', r)).requests.some(v => v.id === verification.id));
  assert.equal((await call('/classes/academic/profile', users.second.token)).requests.length, 0);
  await call(`/classes/academic/review/${verification.id}`, r, 'PATCH', { status: 'approved', note: 'Fixture official record checked.' });
  await call(`/classes/academic/review/${verification.id}`, r, 'PATCH', { status: 'approved' }, 409);
  const profile = (await call('/classes/academic/profile', s)).profile; assert.equal(profile.department_code, 'BSIT'); assert.equal(profile.year_level, 4); assert.equal(profile.section, 'Rizal');
  assert.equal((await call('/classes/join/lookup', s, 'POST', { code: classroom.code })).eligible, true);
  const correction = (await call('/classes/academic/verification-requests', s, 'POST', { departmentCode: 'BSHM', yearLevel: 2 }, 201)).request;
  await call(`/classes/academic/review/${correction.id}`, r, 'PATCH', { status: 'rejected', note: 'Does not match official registration.' });
  assert.equal((await call('/classes/academic/profile', s)).profile.department_code, 'BSIT');
  const stale = (await call('/classes/academic/verification-requests', s, 'POST', { departmentCode: 'BSIT', yearLevel: 3 }, 201)).request;
  await pool.query('UPDATE users SET year_level=2 WHERE id=$1', [users.student.id]);
  await call(`/classes/academic/review/${stale.id}`, r, 'PATCH', { status: 'approved' }, 409);
  await call(`/classes/academic/review/${stale.id}`, r, 'PATCH', { status: 'rejected' });
  // All 20 valid combinations; every department/year mismatch is rejected.
  for (const [department] of DEPARTMENTS) for (let year = 1; year <= 4; year++) {
    const official = { department_code: department, year_level: year };
    assert.equal(collegeEligibility(official, { ...official, enrollment_open: true }, { departmentCode: department, yearLevel: year }), null);
    for (const [otherDepartment] of DEPARTMENTS) for (let otherYear = 1; otherYear <= 4; otherYear++) if (department !== otherDepartment || year !== otherYear) assert.ok(collegeEligibility(official, { department_code: otherDepartment, year_level: otherYear, enrollment_open: true }));
  }
  await pool.query("UPDATE users SET grade_level='4rth year',year_level=NULL WHERE id=$1", [users.student.id]);
  await pool.query("UPDATE users SET grade_level='7mkjlkj',year_level=NULL WHERE id=$1", [users.second.id]);
  await ensureCollegeSchema(); await ensureCollegeSchema();
  assert.equal((await pool.query('SELECT year_level FROM users WHERE id=$1', [users.student.id])).rows[0].year_level, 4);
  assert.equal((await pool.query('SELECT year_level FROM users WHERE id=$1', [users.second.id])).rows[0].year_level, null);
  assert.equal((await pool.query('SELECT grade_level FROM users WHERE id=$1', [users.student.id])).rows[0].grade_level, '4rth year');
  console.log(`PASS: ${checks} college HTTP assertions, all 20 department/year combinations, 380 mismatches, protected verification, stale approval, safe idempotent legacy normalization, code metadata privacy.`);
} finally {
  if (ids.length) await pool.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2', [ids, `college-%-${suffix}@example.invalid`]);
  await new Promise(r => server.close(r)); await cleanupCurriculumFixtures(); await pool.end();
}
