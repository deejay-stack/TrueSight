import { academicSelection, curriculumColumns, curriculumJoin, requireClassSubject, semesterSelection, DEPARTMENTS, YEAR_LEVELS } from '../services/CollegeEnrollment.js';
import express from 'express';
import type { Request, Response } from 'express';
import pool from '../config/db.js';
import { ownAcademicIntents } from '../services/AcademicEnrollmentIntent.js';
import { assessSubmission, compute, gradeLevel, invalid, percentage, points, publicRubric, round, rubric, scoringEnabled } from '../services/LmsGrading.js';

const router = express.Router();
const fail = (res: Response, error: any) => res.status(error.statusCode ?? 500).json({ message: error.statusCode ? error.message : 'Unable to save or load classroom data.' });
const recordId = (value: unknown) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647) invalid('Invalid record id.');
  return n;
};

router.get('/eligible', async (req, res) => {
  try {
    if (req.user.role !== 'student') invalid('Only students can view eligible subjects.', 403);
    const profile = (await pool.query('SELECT id,name,grade_level,department_code,year_level,section FROM users WHERE id=$1', [req.user.id])).rows[0];
    const result = await pool.query(`SELECT c.*,${curriculumColumns},u.name AS teacher_name FROM classes c JOIN users u ON u.id=c.teacher_id ${curriculumJoin}
      WHERE c.department_code=$1 AND c.year_level=$2 AND c.enrollment_open AND subject.active=TRUE AND curriculum.active=TRUE
      AND NOT EXISTS (SELECT 1 FROM class_enrollments e WHERE e.class_id=c.id AND e.student_id=$3)
      AND NOT EXISTS (SELECT 1 FROM class_enrollment_requests r WHERE r.class_id=c.id AND r.student_id=$3 AND r.status='pending') ORDER BY c.name`, [profile.department_code,profile.year_level,req.user.id]);
    const subjects = (await pool.query(`SELECT s.id,s.code,s.name,a.semester FROM subjects s JOIN curriculum_subjects a ON a.subject_id=s.id
      WHERE a.department_code=$1 AND a.year_level=$2 AND a.active AND s.active ORDER BY a.semester,s.code`, [profile.department_code, profile.year_level])).rows;
    const verificationRequests = (await pool.query(`SELECT r.id,r.status,r.department_code,r.year_level,r.section,r.cor_file_name,r.note,${ownAcademicIntents} AS class_intents FROM academic_verification_requests r WHERE r.student_id=$1 ORDER BY r.created_at DESC LIMIT 20`, [req.user.id])).rows;
    res.set('Cache-Control','no-store').json({ profile, subjects, classes: result.rows, verificationRequests, departments: DEPARTMENTS.map(([code,name])=>({code,name})), yearLevels: YEAR_LEVELS });
  } catch(e) { fail(res,e); }
});

router.patch('/:classId/enrollment-settings', async (req, res) => {
  const db = await pool.connect();
  try {
    if (req.user.role !== 'teacher') invalid('Only teachers can configure their classes.', 403);
    recordId(req.params.classId);
    const selection = academicSelection(req.body);
    if (typeof req.body.enrollmentOpen !== 'boolean') invalid('Specify whether enrollment is open.');
    await db.query('BEGIN');
    const classroom = (await db.query('SELECT * FROM classes WHERE id=$1 AND teacher_id=$2 FOR UPDATE', [req.params.classId, req.user.id])).rows[0];
    if (!classroom) invalid('Class not found in your classes.', 404);
    const subjectId = req.body.subjectId === undefined ? classroom.subject_id : req.body.subjectId;
    const semester = semesterSelection(req.body.semester === undefined ? classroom.semester : req.body.semester);
    const changed = subjectId !== classroom.subject_id || selection.departmentCode !== classroom.department_code || selection.yearLevel !== classroom.year_level || semester !== classroom.semester;
    if (req.body.enrollmentOpen || (changed && subjectId != null)) await requireClassSubject(db, subjectId, selection, semester);
    const subject = subjectId !== classroom.subject_id && subjectId != null ? (await db.query('SELECT code,name FROM subjects WHERE id=$1', [subjectId])).rows[0] : null;
    const name = subject ? `${subject.code} - ${subject.name}` : classroom.name;
    const result = await db.query(`UPDATE classes SET department_code=$3, enrollment_open=$4, year_level=$5,subject_id=$6,semester=$7,name=$8 WHERE id=$1 AND teacher_id=$2 RETURNING *`, [req.params.classId, req.user.id, selection.departmentCode, req.body.enrollmentOpen, selection.yearLevel, subjectId, semester, name]);
    await db.query('COMMIT');
    res.json({ class: result.rows[0] });
  } catch (e) { await db.query('ROLLBACK'); fail(res, e); } finally { db.release(); }
});

router.patch('/activities/:activityId/rubric', async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.user.role !== 'teacher') invalid('Only teachers can edit rubrics.', 403);
    recordId(req.params.activityId);
    const criteria = rubric(req.body.rubric);
    await client.query('BEGIN');
    const result = await client.query(`SELECT a.* FROM activities a JOIN classes c ON c.id=a.class_id WHERE a.id=$1 AND c.teacher_id=$2 FOR UPDATE OF a`, [req.params.activityId, req.user.id]);
    if (!result.rows.length) invalid('Activity not found in your classes.', 404);
    const graded = await client.query(`SELECT 1 FROM submissions WHERE activity_id=$1 AND (evaluated_at IS NOT NULL OR teacher_score IS NOT NULL OR teacher_grade IS NOT NULL OR computed_score IS NOT NULL) LIMIT 1`, [req.params.activityId]);
    const history = await client.query('SELECT 1 FROM submission_grade_history WHERE activity_id=$1 LIMIT 1', [req.params.activityId]);
    if (graded.rows.length || history.rows.length) invalid('This rubric is locked because grades have been recorded. Create another activity to use a different rubric.', 409);
    const max = criteria.length ? round(criteria.reduce((s, c) => s + c.maxPoints, 0)) : points(req.body.maxScore ?? result.rows[0].max_score);
    if (!max) invalid('Maximum score must be greater than zero.');
    const enabled = scoringEnabled(req.body.aiScoringEnabled ?? result.rows[0].ai_scoring_enabled, criteria);
    const saved = await client.query('UPDATE activities SET rubric=$2, max_score=$3, ai_scoring_enabled=$4 WHERE id=$1 RETURNING *', [req.params.activityId, JSON.stringify(criteria), max, enabled]);
    await client.query('UPDATE submissions SET ai_assessment=NULL WHERE activity_id=$1', [req.params.activityId]);
    await client.query('COMMIT');
    res.json({ activity: saved.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); fail(res, e); } finally { client.release(); }
});

export async function saveEvaluation(req: Request, res: Response) {
  const client = await pool.connect();
  try {
    if (req.user.role !== 'teacher') invalid('Only teachers can evaluate submissions.', 403);
    recordId(req.params.submissionId);
    await client.query('BEGIN');
    // Lock the activity before its submission, matching rubric edits and resubmissions.
    const activity = await client.query(`SELECT a.* FROM activities a JOIN submissions s ON s.activity_id=a.id JOIN classes c ON c.id=a.class_id WHERE s.id=$1 AND c.teacher_id=$2 FOR UPDATE OF a`, [req.params.submissionId, req.user.id]);
    if (!activity.rows.length) invalid('Submission not found in your classes.', 404);
    const current = (await client.query('SELECT * FROM submissions WHERE id=$1 FOR UPDATE', [req.params.submissionId])).rows[0];
    if (!current) invalid('Submission no longer exists.', 409);
    if (req.body.submittedVersion !== undefined && req.body.submittedVersion !== Number(current.submitted_version)) invalid('This student has resubmitted the activity. Reload and review the current submission before grading.', 409);
    const a = activity.rows[0];
    if (req.body.approve === false || (a.ai_scoring_enabled && req.body.approve !== true)) invalid('Review the criterion scores and explicitly approve the official grade. Suggestions are never published automatically.');
    const criteria = rubric(a.rubric);
    const max = Number(a.max_score);
    let computed = current.computed_score === null ? null : Number(current.computed_score);
    let scores = current.rubric_scores;
    let overridden = current.score_overridden;
    let score = current.teacher_score === null ? null : Number(current.teacher_score);
    const body = req.body;
    if (body.override !== undefined && typeof body.override !== 'boolean') invalid('Invalid override setting.');
    if (body.restoreComputed !== undefined && typeof body.restoreComputed !== 'boolean') invalid('Invalid restore setting.');
    if (criteria.length) {
      if (body.rubricScores !== undefined) { const calculation = compute(criteria, body.rubricScores); computed = calculation.total; scores = calculation.scores; }
      if (computed === null) invalid('Score every rubric criterion before saving.');
      if (body.restoreComputed === true || body.override === false) overridden = false;
      else if (body.override === true) overridden = true;
      // Legacy clients must explicitly request an override rather than silently changing rubric grades.
      if (overridden && body.score !== undefined) score = points(body.score, max);
      if (!overridden) score = computed;
      if (overridden && score === null) invalid('An adjusted final score is required.');
    } else if (body.score !== undefined) {
      score = body.score === null || body.score === '' ? null : points(body.score, max, true);
    }
    const text = (key: string, existing: string | null, limit: number) => {
      if (!Object.hasOwn(body, key)) return existing;
      const value = String(body[key] ?? '').trim();
      if (value.length > limit) invalid(`${key} is too long.`);
      return value || null;
    };
    const grade = text('grade', current.teacher_grade, 80);
    const comments = text('comments', current.teacher_comments, 20000);
    const remarks = text('remarks', current.teacher_remarks, 120);
    const note = text('adjustmentNote', current.adjustment_note, 10000);
    await client.query("SELECT set_config('truesight.actor_id', $1, true)", [String(req.user.id)]);
    const updated = await client.query(`UPDATE submissions SET teacher_comments=$2, teacher_remarks=$3, teacher_grade=$4, teacher_score=$5,
      evaluated_by=$6, evaluated_at=NOW(), updated_at=NOW(), rubric_scores=$7, computed_score=$8, score_overridden=$9, adjustment_note=$10, grade_approved=TRUE
      WHERE id=$1 RETURNING *`, [current.id, comments, remarks, grade, score, req.user.id, JSON.stringify(scores), computed, overridden, overridden ? note : null]);
    await client.query('COMMIT');
    res.json({ message: 'Evaluation saved successfully.', submission: updated.rows[0] });
  } catch (e) { await client.query('ROLLBACK'); fail(res, e); } finally { client.release(); }
}

router.post('/submissions/:submissionId/assessment', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') invalid('Only teachers can generate grading suggestions.', 403);
    recordId(req.params.submissionId);
    const result = await pool.query(`SELECT s.*, a.rubric, a.ai_scoring_enabled, a.submission_type FROM submissions s
      JOIN activities a ON a.id=s.activity_id JOIN classes c ON c.id=a.class_id WHERE s.id=$1 AND c.teacher_id=$2`, [req.params.submissionId, req.user.id]);
    const current = result.rows[0];
    if (!current) invalid('Submission not found in your classes.', 404);
    const assessment = await assessSubmission(current, current.analysis_details ?? {});
    const saved = await pool.query(`UPDATE submissions s SET ai_assessment=$2 WHERE s.id=$1 AND s.submitted_version=$3
      AND s.analysis_details IS NOT DISTINCT FROM $4::jsonb AND EXISTS (SELECT 1 FROM activities a WHERE a.id=s.activity_id AND a.rubric=$5::jsonb AND a.ai_scoring_enabled=$6)
      RETURNING id`, [current.id, JSON.stringify(assessment), current.submitted_version, current.analysis_details === null ? null : JSON.stringify(current.analysis_details), JSON.stringify(current.rubric), current.ai_scoring_enabled]);
    if (!saved.rows.length) invalid('The submission, rubric, or analysis changed. Reload before generating suggestions.', 409);
    res.json({ assessment });
  } catch (e) { fail(res, e); }
});

router.get('/activities/:activityId/rating', async (req, res) => {
  try {
    if (req.user.role !== 'student') invalid('Only students can export their own rating.', 403);
    recordId(req.params.activityId);
    const result = await pool.query(`SELECT s.*, a.title, a.rubric, a.max_score, c.name AS subject,
      u.name AS student_name, u.grade_level, u.department_code, u.year_level, u.section, t.name AS teacher_name
      FROM submissions s JOIN activities a ON a.id=s.activity_id JOIN classes c ON c.id=a.class_id
      JOIN users u ON u.id=s.student_id JOIN users t ON t.id=c.teacher_id
      WHERE a.id=$1 AND s.student_id=$2 AND s.evaluated_at IS NOT NULL AND s.teacher_score IS NOT NULL AND s.grade_approved
      AND EXISTS (SELECT 1 FROM class_enrollments ce WHERE ce.class_id=c.id AND ce.student_id=$2)`, [req.params.activityId, req.user.id]);
    const row = result.rows[0];
    if (!row) invalid('No approved activity score is available.', 404);
    const report = {
      studentName: row.student_name, studentId: String(row.student_id), gradeLevel: row.year_level ? YEAR_LEVELS[Number(row.year_level)-1].label : null, departmentCode: row.department_code, yearLevel: row.year_level, section: row.section,
      subject: row.subject, activity: row.title, teacherName: row.teacher_name, submittedAt: row.submitted_at,
      criteria: publicRubric(row.rubric).map((c) => ({ ...c, earned: row.rubric_scores[c.id] ?? null })),
      computedScore: row.computed_score === null ? null : Number(row.computed_score), maxScore: Number(row.max_score),
      finalScore: Number(row.teacher_score), percentage: percentage(Number(row.teacher_score), Number(row.max_score)),
      rating: row.teacher_grade, feedback: row.teacher_comments, remarks: row.teacher_remarks,
      overridden: row.score_overridden, adjustmentNote: row.adjustment_note, gradedAt: row.evaluated_at, status: 'Graded', exportedAt: new Date().toISOString(),
    };
    res.set('Cache-Control', 'no-store');
    res.json({ report });
  } catch (e) { fail(res, e); }
});

export default router;
