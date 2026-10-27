import express from 'express';
import pool from '../config/db.js';
import { academicSelection, curriculumJoin, semesterSelection } from '../services/CollegeEnrollment.js';
import { invalid } from '../services/LmsGrading.js';

const router = express.Router();
const failure = (res, error) => res.status(error.statusCode ?? (error.code === '23505' ? 409 : 500)).json({ message: error.statusCode ? error.message : error.code === '23505' ? 'A subject code or curriculum assignment already exists. Reload and use the existing subject.' : 'Unable to save or load the curriculum.' });
async function catalogData(db: Pick<typeof pool, 'query'>, canManage: boolean) {
  const subjects = (await db.query('SELECT id,code,name,active,version FROM subjects ORDER BY code')).rows;
  const assignments = (await db.query('SELECT id,subject_id,department_code,year_level,semester,active,version FROM curriculum_subjects ORDER BY department_code,year_level,semester,subject_id')).rows;
  const issues = canManage ? (await db.query(`SELECT c.id,c.name,c.department_code,c.year_level,c.semester,c.subject_id FROM classes c ${curriculumJoin}
    WHERE c.subject_id IS NULL OR subject.active IS NOT TRUE OR curriculum.active IS NOT TRUE ORDER BY c.name`)).rows : [];
  return { subjects, assignments, issues, canManage };
}
router.get('/curriculum', async (req, res) => {
  try {
    if (req.user.role !== 'teacher') invalid('Only school personnel can view curriculum configuration.', 403);
    const allowed = (await pool.query('SELECT can_manage_curriculum FROM users WHERE id=$1', [req.user.id])).rows[0]?.can_manage_curriculum === true;
    res.set('Cache-Control', 'no-store').json(await catalogData(pool, allowed));
  } catch (error) { failure(res, error); }
});
router.get('/curriculum/history', async (req, res) => {
  try {
    const permission = (await pool.query("SELECT can_manage_curriculum FROM users WHERE id=$1 AND role='teacher'", [req.user.id])).rows[0];
    if (!permission?.can_manage_curriculum) invalid('Curriculum history requires designated curriculum-management permission.', 403);
    const subjectId = req.query.subjectId === undefined ? null : Number(req.query.subjectId);
    if (subjectId !== null && (!Number.isSafeInteger(subjectId) || subjectId < 1)) invalid('Invalid subject identifier.');
    const history = (await pool.query(`SELECT * FROM curriculum_change_history WHERE $1::int IS NULL OR
      (entity_table='subjects' AND record_id=$1) OR (entity_table='curriculum_subjects' AND (after_data->>'subject_id')::int=$1)
      ORDER BY id DESC LIMIT 250`, [subjectId])).rows;
    res.set('Cache-Control','no-store').json({ history });
  } catch (error) { failure(res, error); }
});

// Save the selected department/year table as one transaction. Missing rows are never deleted.
router.post('/curriculum', async (req, res) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const permission = (await db.query("SELECT can_manage_curriculum FROM users WHERE id=$1 AND role='teacher' FOR SHARE", [req.user.id])).rows[0];
    if (!permission?.can_manage_curriculum) invalid('Curriculum changes require designated curriculum-management permission.', 403);
    const scope = academicSelection(req.body);
    const semester = semesterSelection(req.body.semester);
    if (!Array.isArray(req.body.rows) || req.body.rows.length > 250) invalid('Provide up to 250 subject rows.');
    const seen = new Set();
    // Consistent subject lock order, including shared subjects in other department/year tables.
    const ids = req.body.rows.filter(r => r?.subjectId != null).map(r => Number(r.subjectId));
    if (ids.some(id => !Number.isSafeInteger(id) || id < 1)) invalid('Invalid subject identifier.');
    await db.query('SELECT id FROM subjects WHERE id=ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
    for (const row of req.body.rows) {
      if (!row || typeof row.code !== 'string' || typeof row.name !== 'string' || typeof row.active !== 'boolean') invalid('Each subject requires a code, name and assignment status.');
      const code = row.code.trim().toUpperCase(), name = row.name.trim();
      if (!code || code.length > 40 || !name || name.length > 200) invalid('Subject codes require 1–40 characters and names require 1–200 characters.');
      if (seen.has(row.subjectId ? `id:${row.subjectId}` : `code:${code}`)) invalid('Duplicate subject rows are not allowed.');
      seen.add(row.subjectId ? `id:${row.subjectId}` : `code:${code}`);
      let subject;
      if (row.subjectId != null) {
        subject = (await db.query('SELECT * FROM subjects WHERE id=$1', [row.subjectId])).rows[0];
        if (!subject || subject.version !== row.subjectVersion) invalid('A subject changed since you loaded it. Reload the curriculum before saving.', 409);
        if (subject.code !== code || subject.name !== name) {
          if (row.editExisting !== true) invalid('This is an existing saved subject. Use Add subject for a new entry, or explicitly choose Edit existing subject to change this record.', 409);
          subject = (await db.query('UPDATE subjects SET code=$2,name=$3,version=version+1,updated_by=$4,updated_at=NOW() WHERE id=$1 RETURNING *', [subject.id, code, name, req.user.id])).rows[0];
        }
      } else subject = (await db.query('INSERT INTO subjects(code,name,updated_by) VALUES($1,$2,$3) RETURNING *', [code, name, req.user.id])).rows[0];
      const existing = (await db.query('SELECT * FROM curriculum_subjects WHERE subject_id=$1 AND department_code=$2 AND year_level=$3 AND semester=$4 FOR UPDATE', [subject.id, scope.departmentCode, scope.yearLevel, semester])).rows[0];
      if (existing) {
        if (existing.version !== row.assignmentVersion) invalid('A curriculum assignment changed. Reload before saving.', 409);
        if (existing.active !== row.active) await db.query('UPDATE curriculum_subjects SET active=$2,version=version+1,updated_by=$3,updated_at=NOW() WHERE id=$1', [existing.id, row.active, req.user.id]);
      } else {
        if (row.assignmentVersion != null) invalid('The curriculum assignment changed. Reload before saving.', 409);
        await db.query('INSERT INTO curriculum_subjects(subject_id,department_code,year_level,semester,active,updated_by) VALUES($1,$2,$3,$4,$5,$6)', [subject.id, scope.departmentCode, scope.yearLevel, semester, row.active, req.user.id]);
      }
    }
    const catalog = await catalogData(db, true);
    await db.query('COMMIT');
    res.set('Cache-Control', 'no-store').json({ message: 'Curriculum saved. Existing enrollments are preserved.', catalog });
  } catch (error) { await db.query('ROLLBACK'); failure(res, error); } finally { db.release(); }
});
export default router;
