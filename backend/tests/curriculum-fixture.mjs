import pool from '../dist/config/db.js';
import { ensureCollegeSchema } from '../dist/services/CollegeEnrollment.js';
const subjects = [];
let initialized = false;
// Synthetic test-only data, never installed as an institution curriculum.
export async function fixtureSubject(department = 'BSIT', year = 1) {
  if (!initialized) { await ensureCollegeSchema(); initialized = true; }
  const subject = (await pool.query('INSERT INTO subjects(code,name) VALUES($1,$2) RETURNING id', [`TEST-${Date.now()}-${subjects.length}-${Math.random().toString(36).slice(2,8)}`.toUpperCase(), 'Synthetic regression subject'])).rows[0];
  subjects.push(subject.id);
  await pool.query('INSERT INTO curriculum_subjects(subject_id,department_code,year_level) VALUES($1,$2,$3)', [subject.id, department, year]);
  return subject.id;
}
export async function cleanupCurriculumFixtures() {
  if (!subjects.length) return;
  await cleanupSubjectHistory(subjects);
  await pool.query('DELETE FROM curriculum_subjects WHERE subject_id=ANY($1::int[])', [subjects]);
  await pool.query('DELETE FROM subjects WHERE id=ANY($1::int[])', [subjects]);
}
export async function cleanupSubjectHistory(ids) {
  if (!ids.length) return;
  await pool.query(`DELETE FROM curriculum_change_history WHERE (entity_table='subjects' AND record_id=ANY($1::int[]))
    OR (entity_table='curriculum_subjects' AND (after_data->>'subject_id')::int=ANY($1::int[]))`, [ids]);
}
