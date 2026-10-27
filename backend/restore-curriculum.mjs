import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pool from './dist/config/db.js';
import { ensureCollegeSchema, academicSelection, semesterSelection } from './dist/services/CollegeEnrollment.js';

// Operator-only, explicit recovery of the verified manifest. Never run on application startup.
const input = process.argv[2];
const apply = process.argv.includes('--apply');
const db = await pool.connect();
try {
  if (!input) throw Error('Usage: node restore-curriculum.mjs MANIFEST.json [--apply]. Defaults to a dry run.');
  const manifest = JSON.parse(await readFile(input, 'utf8'));
  if (!Array.isArray(manifest.entries) || !Array.isArray(manifest.expectedExisting)) throw Error('Invalid recovery manifest.');
  await ensureCollegeSchema();
  await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await db.query("SELECT pg_advisory_xact_lock(hashtext('truesight-curriculum-recovery'))");
  const sources = new Map();
  for (const original of manifest.expectedExisting) {
    const row = (await db.query('SELECT * FROM subjects WHERE id=$1 FOR UPDATE', [original.id])).rows[0];
    if (!row || row.code !== original.code || row.name !== original.name || row.version !== original.version) throw Error(`Source subject ${original.id} changed since the recovery capture. Refusing to overwrite it.`);
    sources.set(row.id,row);
  }
  const classesBefore = (await db.query('SELECT id,name,code,subject_id FROM classes ORDER BY id')).rows;
  const membershipBefore = (await db.query('SELECT id,class_id,student_id FROM class_enrollments ORDER BY id')).rows;
  const results = [], seen = new Set();
  for (const entry of manifest.entries) {
    const scope = academicSelection(entry), semester = semesterSelection(entry.semester);
    if (!sources.has(entry.sourceSubjectId) || entry.transactionStatus !== 'committed' || seen.has(entry.code) || entry.code !== entry.code.trim().toUpperCase()) throw Error('Invalid, unverified or duplicate recovery entry.');
    seen.add(entry.code);
    const status = (await db.query('SELECT pg_xact_status($1::xid8) AS status',[String(entry.sourceTransactionId)])).rows[0].status;
    if (status !== 'committed') throw Error(`Recovery transaction ${entry.sourceTransactionId} is not confirmed committed.`);
    const origin = (await db.query('SELECT 1 FROM curriculum_subjects WHERE subject_id=$1 AND department_code=$2 AND year_level=$3 AND semester=$4', [entry.sourceSubjectId,scope.departmentCode,scope.yearLevel,semester])).rows[0];
    if (!origin) throw Error('The original department/year/semester association changed.');
    let subject = (await db.query('SELECT * FROM subjects WHERE code=$1 FOR UPDATE', [entry.code])).rows[0];
    const existed = Boolean(subject);
    if (subject && subject.name !== entry.name) throw Error(`Subject ${entry.code} now has a different name. Refusing to overwrite it.`);
    if (!subject && apply) subject = (await db.query('INSERT INTO subjects(code,name,active,updated_by,updated_at) VALUES($1,$2,$3,$4,$5) RETURNING *', [entry.code,entry.name,entry.active,entry.updatedBy,entry.sourceSavedAt])).rows[0];
    let assignment;
    if (subject) assignment = (await db.query('SELECT id FROM curriculum_subjects WHERE subject_id=$1 AND department_code=$2 AND year_level=$3 AND semester=$4', [subject.id,scope.departmentCode,scope.yearLevel,semester])).rows[0];
    if (subject && !assignment && apply) assignment = (await db.query('INSERT INTO curriculum_subjects(subject_id,department_code,year_level,semester,active,updated_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [subject.id,scope.departmentCode,scope.yearLevel,semester,entry.active,entry.updatedBy])).rows[0];
    results.push({ code:entry.code,name:entry.name,departmentCode:scope.departmentCode,yearLevel:scope.yearLevel,semester,subjectId:subject?.id ?? null,assignmentId:assignment?.id ?? null,result:existed?'preserved':apply?'restored':'would restore' });
  }
  assert.deepEqual((await db.query('SELECT id,name,code,subject_id FROM classes ORDER BY id')).rows,classesBefore);
  assert.deepEqual((await db.query('SELECT id,class_id,student_id FROM class_enrollments ORDER BY id')).rows,membershipBefore);
  if (apply) await db.query('COMMIT'); else await db.query('ROLLBACK');
  const report = { applied:apply,completedAt:new Date().toISOString(),preserved:results.filter(r=>r.result==='preserved').length,restored:results.filter(r=>r.result==='restored').length,entries:results };
  if (apply) await writeFile(path.resolve(path.dirname(input),'curriculum-recovery-result-2026-10-24.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ applied:apply,total:results.length,preserved:report.preserved,restored:report.restored,wouldRestore:results.filter(r=>r.result==='would restore').length }));
} catch (error) { await db.query('ROLLBACK'); console.error(error.message); process.exitCode=1; }
finally {db.release();await pool.end();}
