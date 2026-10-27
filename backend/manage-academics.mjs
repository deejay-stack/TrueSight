import pool from './dist/config/db.js';
import { academicSelection } from './dist/services/CollegeEnrollment.js';
// Run only by an authorized operator with database credentials after schema initialization.
// No application endpoint grants this permission. Never grants all teachers permission.
const [action, id, department, year, section = ''] = process.argv.slice(2);
try {
  if (!/^\d+$/.test(id ?? '') || !Number.isSafeInteger(Number(id))) throw Error('Provide a valid account ID.');
  let result;
  if (action === 'grant-curriculum' || action === 'revoke-curriculum') {
    result = await pool.query("UPDATE users SET can_manage_curriculum=$2 WHERE id=$1 AND role='teacher' RETURNING id,name,can_manage_curriculum", [Number(id), action === 'grant-curriculum']);
  } else if (action === 'grant-reviewer' || action === 'revoke-reviewer') {
    result = await pool.query("UPDATE users SET can_verify_academics=$2 WHERE id=$1 AND role='teacher' RETURNING id,name,can_verify_academics", [Number(id), action === 'grant-reviewer']);
  } else if (action === 'assign-student') {
    const choice = academicSelection({ departmentCode: department, yearLevel: Number(year) });
    if (section.length > 120) throw Error('Section must be at most 120 characters.');
    result = await pool.query("UPDATE users SET department_code=$2,year_level=$3,section=$4 WHERE id=$1 AND role='student' RETURNING id,name,department_code,year_level,section", [Number(id), choice.departmentCode, choice.yearLevel, section.trim() || null]);
  } else throw Error('Usage: node manage-academics.mjs grant-reviewer|revoke-reviewer|grant-curriculum|revoke-curriculum TEACHER_ID; or assign-student STUDENT_ID BSIT 1 "Section"');
  if (!result.rows.length) throw Error('No matching account with the required role.');
  console.log('Academic authorization/assignment saved:', result.rows[0]);
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await pool.end(); }
