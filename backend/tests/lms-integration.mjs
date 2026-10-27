import { fixtureSubject, cleanupCurriculumFixtures } from './curriculum-fixture.mjs';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from '../dist/routes/auth.js';
import classRoutes from '../dist/routes/classes.js';
import pool from '../dist/config/db.js';
import { rubric, compute, eligibility } from '../dist/services/LmsGrading.js';

const app = express(); app.use(express.json({ limit: '8mb' })); app.use(cookieParser());
app.use('/api/auth', authRoutes); app.use('/api/classes', classRoutes);
const server = app.listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/api`;
const suffix = Date.now(); const users = []; const activities = [];
let assertions = 0;
async function call(route, token, method = 'GET', body, expected = 200) {
  const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Cookie: `token=${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`); assertions++;
  return data;
}
const cor = { departmentCode: 'BSIT', yearLevel: 1, corFileName: 'fixture.png', corFileType: 'image/png', corFileSize: 68, corDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=' };
const criteria = [
  { id: 'content', title: 'Content Accuracy', description: 'Explain and support your ideas.', maxPoints: 30 },
  { id: 'delivery', title: 'Delivery', description: 'Communicate clearly. '.repeat(250).trim(), maxPoints: 70 },
];
const definition = { title: 'Oral Presentation', description: 'Present your work', instructor: 'LMS regression teacher', submissionType: 'essay', dueDate: '2099-01-01', maxScore: 999 };
try {
  assert.deepEqual(compute(criteria, { content: 27, delivery: 63 }).total, 90);
  for (const invalid of [-1, 31, '', null, true, 'Infinity', 'NaN', 0.001]) assert.throws(() => compute(criteria, { content: invalid, delivery: 63 }));
  assert.throws(() => compute(criteria, { content: 20 }));
  assert.throws(() => compute(criteria, { content: 20, delivery: 63, extra: 1 }));
  for (const invalid of [[{ ...criteria[0], title: '' }], [{ ...criteria[0], maxPoints: 0 }], [criteria[0], criteria[0]]]) assert.throws(() => rubric(invalid));
  for (let level = 1; level <= 12; level++) {
    assert.equal(eligibility(`Grade ${level}`, `Grade ${level}`), null);
    assert.ok(eligibility(`Grade ${level}`, `Grade ${level + 1}`));
  }
  const tokens = {}; const ids = {};
  for (const [name, role] of [['teacher', 'teacher'], ['student', 'student'], ['otherTeacher', 'teacher'], ['otherStudent', 'student']]) {
    const body = { name: `LMS test ${name}`, email: `lms-test-${name}-${suffix}@example.invalid`, password: `Test-${suffix}!`, role };
    const signup = await call('/auth/signup', null, 'POST', body, 201);
    users.push(signup.user.id); ids[name] = signup.user.id;
    tokens[name] = (await call('/auth/login', null, 'POST', body)).token;
  }
  const createClass = async (gradeLevel, title = gradeLevel) => (await call('/classes', tokens.teacher, 'POST', { name: title, code: `LM${suffix}${activities.length}${title.replace(/\W/g, '')}`.slice(0, 20), description: 'Temporary LMS test fixture', ...(gradeLevel ? { subjectId: await fixtureSubject('BSIT', gradeLevel === 'Grade 7' ? 1 : 2), departmentCode: 'BSIT', yearLevel: gradeLevel === 'Grade 7' ? 1 : 2 } : {}) }, 201)).class;
  const classroom = await createClass('Grade 7', 'Seven');
  const eight = await createClass('Grade 8', 'Eight');
  const unassigned = await createClass(null, 'Unknown');
  assert.equal((await call('/classes/eligible', tokens.student)).classes.length, 0);
  await call('/classes/join/lookup', tokens.student, 'POST', { code: classroom.code });
  await call('/classes/join', tokens.student, 'POST', { code: classroom.code, ...cor }, 403);
  // Only an operator assigns official student records, never a self-service request.
  await pool.query('UPDATE users SET department_code=$2,year_level=1,grade_level=$3,section=$4 WHERE id=$1', [ids.student, 'BSIT', 'Grade 7', 'Rizal']);
  await call('/auth/me', tokens.student, 'PATCH', { grade_level: 'Grade 8', gradeLevel: 'Grade 8', section: 'Fake' }, 400);
  assert.equal((await pool.query('SELECT grade_level FROM users WHERE id=$1', [ids.student])).rows[0].grade_level, 'Grade 7');
  const eligible = await call('/classes/eligible', tokens.student);
  assert.ok(eligible.classes.some(c => c.id === classroom.id));
  assert.ok(!eligible.classes.some(c => c.id === eight.id || c.id === unassigned.id));
  assert.equal(eligible.departments.length, 5); assert.equal(eligible.yearLevels.length, 4);
  await call('/classes/join/lookup', tokens.student, 'POST', { code: classroom.code });
  await call('/classes/join/lookup', tokens.student, 'POST', { code: classroom.code });
  await call('/classes/join', tokens.student, 'POST', { code: eight.code, ...cor, yearLevel: 2 }, 403);
  await call('/classes/join', tokens.student, 'POST', { code: classroom.code, ...cor, yearLevel: undefined }, 400);
  await call('/classes/join/lookup', tokens.student, 'POST', { code: eight.code });
  await call('/classes/join', tokens.student, 'POST', { code: eight.code, ...cor }, 403);
  await call('/classes/join', tokens.student, 'POST', { code: unassigned.code, ...cor }, 403);
  await call(`/classes/${classroom.id}/enrollment-settings`, tokens.otherTeacher, 'PATCH', { departmentCode: 'BSIT', yearLevel: 1, enrollmentOpen: false }, 404);
  await call(`/classes/${classroom.id}/enrollment-settings`, tokens.student, 'PATCH', { departmentCode: 'BSIT', yearLevel: 1, enrollmentOpen: true }, 403);
  await call(`/classes/${classroom.id}/enrollment-settings`, tokens.teacher, 'PATCH', { departmentCode: '', yearLevel: 0, enrollmentOpen: true }, 400);
  await call(`/classes/${classroom.id}/enrollment-settings`, tokens.teacher, 'PATCH', { departmentCode: 'BSIT', yearLevel: 1, enrollmentOpen: false });
  await call('/classes/join', tokens.student, 'POST', { code: classroom.code, ...cor }, 403);
  await call(`/classes/${classroom.id}/enrollment-settings`, tokens.teacher, 'PATCH', { departmentCode: 'BSIT', yearLevel: 1, enrollmentOpen: true });
  await call('/classes/join/lookup', tokens.student, 'POST', { code: classroom.code, selectedGradeLevel: 'Grade 7' });
  const pending = (await call('/classes/join', tokens.student, 'POST', { code: classroom.code, ...cor }, 202)).request;
  await call('/classes/join', tokens.student, 'POST', { code: classroom.code, ...cor }, 409);
  await pool.query('UPDATE users SET year_level=$2 WHERE id=$1', [ids.student, 2]);
  await call(`/classes/enrollment-requests/${pending.id}`, tokens.teacher, 'PATCH', { status: 'accepted' }, 403);
  assert.equal((await pool.query('SELECT status FROM class_enrollment_requests WHERE id=$1', [pending.id])).rows[0].status, 'pending');
  await pool.query('UPDATE users SET year_level=$2 WHERE id=$1', [ids.student, 1]);
  await call(`/classes/enrollment-requests/${pending.id}`, tokens.teacher, 'PATCH', { status: 'accepted' });
  await call('/classes/join', tokens.student, 'POST', { code: classroom.code, ...cor }, 409);
  assert.ok(!(await call('/classes/eligible', tokens.student)).classes.some(c => c.id === classroom.id));
  console.log('PASS: official grade filtering, manipulated API requests, unavailable classes, duplicate requests and enrollments, transactional approval revalidation, existing role permissions');

  const activity = (await call(`/classes/${classroom.id}/activities`, tokens.teacher, 'POST', { ...definition, rubric: criteria }, 201)).activity;
  activities.push(activity.id);
  assert.equal(Number(activity.max_score), 100);
  assert.deepEqual(activity.rubric, criteria);
  for (const invalid of [[{ ...criteria[0], maxPoints: -1 }], [{ ...criteria[0], maxPoints: 0 }]]) await call(`/classes/${classroom.id}/activities`, tokens.teacher, 'POST', { ...definition, rubric: invalid }, 400);
  await call(`/classes/activities/${activity.id}/rubric`, tokens.otherTeacher, 'PATCH', { rubric: criteria }, 404);
  const reordered = [criteria[1], { ...criteria[0], description: 'Updated criterion' }];
  await call(`/classes/activities/${activity.id}/rubric`, tokens.teacher, 'PATCH', { rubric: reordered });
  assert.equal((await call(`/classes/activities/${activity.id}`, tokens.student)).activity.rubric[0].id, 'delivery');
  await call(`/classes/activities/${activity.id}/rubric`, tokens.teacher, 'PATCH', { rubric: [criteria[0]] });
  await call(`/classes/activities/${activity.id}/rubric`, tokens.teacher, 'PATCH', { rubric: criteria });
  const submission = (await call(`/classes/activities/${activity.id}/submissions`, tokens.student, 'POST', { contentText: 'My original presentation text.' })).submission;
  const route = `/classes/submissions/${submission.id}/evaluation`;
  await call(`/classes/submissions/${submission.id}/assessment`, tokens.student, 'POST', {}, 403);
  await call(`/classes/submissions/${submission.id}/assessment`, tokens.otherTeacher, 'POST', {}, 404);
  const noAssistance = (await call(`/classes/submissions/${submission.id}/assessment`, tokens.teacher, 'POST', {})).assessment;
  assert.equal(noAssistance.status, 'disabled'); assert.equal(noAssistance.suggestedTotal, null);
  const privateDetail = await call(`/classes/activities/${activity.id}`, tokens.student);
  assert.equal(privateDetail.submission.ai_assessment, undefined);
  await call(`/classes/activities/${activity.id}/rating`, tokens.student, 'GET', undefined, 404);
  await call(route, tokens.student, 'PATCH', { score: 100 }, 403);
  await call(route, tokens.otherTeacher, 'PATCH', { score: 100 }, 404);
  await call(route, tokens.teacher, 'PATCH', { rubricScores: { content: 31, delivery: 60 } }, 400);
  await call(route, tokens.teacher, 'PATCH', { rubricScores: { content: 27 } }, 400);
  await call(route, tokens.teacher, 'PATCH', { rubricScores: { content: 27, delivery: 63 }, comments: 'Excellent presentation.' });
  let saved = (await call(`/classes/submissions/${submission.id}`, tokens.teacher)).submission;
  assert.equal(Number(saved.computed_score), 90); assert.equal(Number(saved.teacher_score), 90);
  assert.equal(saved.score_overridden, false);
  await call(`/classes/activities/${activity.id}/rubric`, tokens.teacher, 'PATCH', { rubric: [criteria[0]] }, 409);
  await call(route, tokens.teacher, 'PATCH', { override: true, score: 101 }, 400);
  await call(route, tokens.teacher, 'PATCH', { override: true, score: 93, grade: 'Excellent', adjustmentNote: 'Exceptional participation.' });
  saved = (await call(`/classes/submissions/${submission.id}`, tokens.teacher)).submission;
  assert.equal(Number(saved.computed_score), 90); assert.equal(Number(saved.teacher_score), 93); assert.equal(saved.score_overridden, true);
  let report = (await call(`/classes/activities/${activity.id}/rating?studentId=${ids.otherStudent}&score=100`, tokens.student)).report;
  assert.equal(report.studentId, String(ids.student)); assert.equal(report.finalScore, 93); assert.equal(report.percentage, 93);
  assert.equal(report.studentName, 'LMS test student'); assert.equal(report.gradeLevel, '1st Year'); assert.equal(report.section, 'Rizal');
  assert.equal(report.criteria[1].description, criteria[1].description); assert.equal(report.criteria[0].earned, 27);
  await call(`/classes/activities/${activity.id}/rating`, tokens.otherStudent, 'GET', undefined, 404);
  await call(`/classes/activities/${activity.id}/rating`, null, 'GET', undefined, 401);
  await call(route, tokens.teacher, 'PATCH', { rubricScores: { content: 28, delivery: 63 } });
  report = (await call(`/classes/activities/${activity.id}/rating`, tokens.student)).report;
  assert.equal(report.computedScore, 91); assert.equal(report.finalScore, 93); assert.equal(report.adjustmentNote, 'Exceptional participation.');
  await call(route, tokens.teacher, 'PATCH', { restoreComputed: true, grade: '' });
  report = (await call(`/classes/activities/${activity.id}/rating`, tokens.student)).report;
  assert.equal(report.finalScore, 91); assert.equal(report.overridden, false); assert.equal(report.adjustmentNote, null);
  const audit = await pool.query('SELECT * FROM submission_grade_history WHERE submission_id=$1 ORDER BY id', [submission.id]);
  assert.ok(audit.rows.length >= 4); assert.equal(audit.rows[1].previous_grade.score, 90); assert.equal(audit.rows[1].saved_grade.score, 93); assert.equal(audit.rows[1].changed_by, ids.teacher);
  console.log('PASS: rubric creation/edit/removal/reordering, derived maximum, authorized criterion grading, validation, override persistence, recalculation and restoration, audit history, authenticated current reports and long descriptions');

  const assistedCriteria = [{ ...criteria[0], aiEnabled: true, guidance: 'Private teacher guidance', assessment: { minimumWords: 5 } }, { ...criteria[1], aiEnabled: true }];
  const assisted = (await call(`/classes/${classroom.id}/activities`, tokens.teacher, 'POST', { ...definition, aiScoringEnabled: true, rubric: [...assistedCriteria, { id: 'empty-row', title: '', description: '', maxPoints: 0 }] }, 201)).activity;
  activities.push(assisted.id);
  assert.equal(assisted.rubric.length, 2); assert.equal(Number(assisted.max_score), 100);
  const assistedSubmission = (await call(`/classes/activities/${assisted.id}/submissions`, tokens.student, 'POST', { contentText: 'My original submission requires teacher review.' })).submission;
  const assistedRoute = `/classes/submissions/${assistedSubmission.id}/evaluation`;
  const unavailable = (await call(`/classes/submissions/${assistedSubmission.id}/assessment`, tokens.teacher, 'POST', {})).assessment;
  assert.equal(unavailable.status, 'analysis_unavailable'); assert.equal(unavailable.suggestedTotal, null);
  const ownAssisted = await call(`/classes/activities/${assisted.id}`, tokens.student);
  assert.equal(ownAssisted.activity.rubric[0].guidance, undefined); assert.equal(ownAssisted.activity.rubric[0].assessment, undefined);
  assert.equal(ownAssisted.activity.ai_scoring_enabled, undefined); assert.equal(ownAssisted.submission.ai_assessment, undefined);
  await call(assistedRoute, tokens.teacher, 'PATCH', { rubricScores: { content: 25, delivery: 60 } }, 400);
  await call(assistedRoute, tokens.teacher, 'PATCH', { approve: false, rubricScores: { content: 25, delivery: 60 } }, 400);
  await call(assistedRoute, tokens.teacher, 'PATCH', { approve: true, rubricScores: { content: 25 } }, 400);
  await pool.query("UPDATE submissions SET teacher_score=88,teacher_comments='PRIVATE DRAFT',evaluated_at=NOW(),grade_approved=FALSE WHERE id=$1", [assistedSubmission.id]);
  await call(`/classes/activities/${assisted.id}/rating`, tokens.student, 'GET', undefined, 404);
  const privateGrade = await call(`/classes/activities/${assisted.id}`, tokens.student);
  assert.equal(privateGrade.submission.teacher_score, null); assert.equal(privateGrade.submission.teacher_comments, null); assert.equal(privateGrade.submission.evaluated_at, null);
  const privateList = (await call(`/classes/${classroom.id}/activities`, tokens.student)).activities.find(a => a.id === assisted.id);
  assert.equal(privateList.teacher_score, null); assert.equal(privateList.teacher_comments, null);
  await call(assistedRoute, tokens.teacher, 'PATCH', { approve: true, rubricScores: { content: 25, delivery: 60 }, comments: 'Official feedback', grade: 'Approved' });
  const approved = (await call(`/classes/activities/${assisted.id}/rating`, tokens.student)).report;
  assert.equal(approved.finalScore, 85); assert.equal(approved.criteria[0].earned, 25); assert.equal(approved.criteria[0].guidance, undefined);
  const suggestionBefore = (await call(`/classes/submissions/${assistedSubmission.id}`, tokens.teacher)).submission.ai_assessment;
  await call(assistedRoute, tokens.teacher, 'PATCH', { approve: true, rubricScores: { content: 26, delivery: 60 } });
  assert.deepEqual((await call(`/classes/submissions/${assistedSubmission.id}`, tokens.teacher)).submission.ai_assessment, suggestionBefore);
  console.log('PASS: blank-row persistence, AI settings privacy, unavailable evidence, mandatory teacher approval, complete criterion validation, unpublished grade protection on all student routes, preserved AI suggestions');


  const legacy = (await call(`/classes/${classroom.id}/activities`, tokens.teacher, 'POST', { ...definition, maxScore: 50 }, 201)).activity;
  activities.push(legacy.id);
  const legacySubmission = (await call(`/classes/activities/${legacy.id}/submissions`, tokens.student, 'POST', { contentText: 'Legacy workflow.' })).submission;
  const roundedLegacy = await call(`/classes/submissions/${legacySubmission.id}/evaluation`, tokens.teacher, 'PATCH', { score: 40.555 });
  assert.equal(Number(roundedLegacy.submission.teacher_score), 40.56);
  await call(`/classes/submissions/${legacySubmission.id}/evaluation`, tokens.teacher, 'PATCH', { score: 40, grade: 'Pass', comments: 'Good work' });
  const legacyReport = (await call(`/classes/activities/${legacy.id}/rating`, tokens.student)).report;
  assert.equal(legacyReport.finalScore, 40); assert.equal(legacyReport.percentage, 80); assert.deepEqual(legacyReport.criteria, []);
  const [, racingGrade] = await Promise.all([
    call(`/classes/activities/${activity.id}/submissions`, tokens.student, 'POST', { contentText: 'Revised presentation.' }),
    fetch(`${base}${route}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: `token=${tokens.teacher}` }, body: JSON.stringify({ submittedVersion: 1, rubricScores: { content: 27, delivery: 63 } }) }),
  ]);
  assert.ok([200, 409].includes(racingGrade.status), await racingGrade.text());
  await call(`/classes/activities/${activity.id}/rating`, tokens.student, 'GET', undefined, 404);
  saved = (await call(`/classes/submissions/${submission.id}`, tokens.teacher)).submission;
  assert.equal(saved.computed_score, null); assert.equal(saved.teacher_score, null); assert.deepEqual(saved.rubric_scores, {});
  await call(route, tokens.teacher, 'PATCH', { submittedVersion: 1, rubricScores: { content: 30, delivery: 70 } }, 409);
  assert.equal((await pool.query('SELECT saved_grade FROM submission_grade_history WHERE submission_id=$1 ORDER BY id DESC LIMIT 1', [submission.id])).rows[0].saved_grade.version, 2);
  await call(`/classes/activities/${activity.id}/rubric`, tokens.teacher, 'PATCH', { rubric: [] }, 409);
  await pool.query('UPDATE users SET year_level=$2 WHERE id=$1', [ids.student, 2]);
  assert.ok((await call('/classes/enrolled', tokens.student)).classes.some(c => c.id === classroom.id));
  await call(`/classes/activities/${legacy.id}`, tokens.student);
  assert.equal((await call(`/classes/activities/${legacy.id}/rating`, tokens.student)).report.finalScore, 40);
  await call(`/classes/enrollment-requests/${pending.id}`, tokens.teacher, 'PATCH', { status: 'accepted' }, 409);
  console.log(`PASS: legacy grading and reports, resubmission clears current grading with preserved audit, historical enrollment and grades remain accessible (${assertions} HTTP assertions)`);
} finally {
  if (users.length) {
    await pool.query('DELETE FROM submission_grade_history WHERE student_id=ANY($1::int[])', [users]);
    await pool.query('DELETE FROM users WHERE id=ANY($1::int[]) AND email LIKE $2', [users, `lms-test-%-${suffix}@example.invalid`]);
  }
  await new Promise(r => server.close(r)); await cleanupCurriculumFixtures(); await pool.end();
}
