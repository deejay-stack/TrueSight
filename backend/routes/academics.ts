import express from 'express';
import pool from '../config/db.js';
import { academicSelection, DEPARTMENTS, YEAR_LEVELS } from '../services/CollegeEnrollment.js';
import { invalid } from '../services/LmsGrading.js';
import { validateCorUpload } from '../services/CorUpload.js';
import { academicIntentReviewState,linkAcademicEnrollmentIntent,requireOfficialDeclarationMatch,reviewAcademicEnrollmentIntent,validateClassCorSelection } from '../services/AcademicEnrollmentIntent.js';
const router = express.Router();
const failure = (res, e) => res.status(e.statusCode ?? 500).json({ message: e.statusCode ? e.message : 'Unable to process academic verification.' });
const reviewer = async user => {
  const row = (await pool.query('SELECT can_verify_academics FROM users WHERE id=$1 AND role=$2', [user.id, 'teacher'])).rows[0];
  return row?.can_verify_academics === true;
};
router.get('/academic/options', async (req, res) => {
  const manager = (await pool.query("SELECT can_manage_curriculum FROM users WHERE id=$1 AND role='teacher'", [req.user.id])).rows[0];
  res.json({ departments: DEPARTMENTS.map(([code, name]) => ({ code, name })), yearLevels: YEAR_LEVELS, canReview: await reviewer(req.user), canManageCurriculum: manager?.can_manage_curriculum === true });
});
router.get('/academic/profile', async (req, res) => {
  try {
    const profile = (await pool.query('SELECT id,name,department_code,year_level,section FROM users WHERE id=$1', [req.user.id])).rows[0];
    const requests = (await pool.query('SELECT id,department_code,year_level,section,status,note,created_at,reviewed_at,cor_file_name FROM academic_verification_requests WHERE student_id=$1 ORDER BY created_at DESC', [req.user.id])).rows;
    res.set('Cache-Control', 'no-store').json({ profile, requests });
  } catch (e) { failure(res, e); }
});
router.post('/academic/verification-requests', async (req, res) => {
  const client = await pool.connect();
  try {
    if (req.user.role !== 'student') invalid('Only students can request academic verification.', 403);
    const selection = academicSelection(req.body);
    const section = String(req.body.section ?? '').trim();
    if (section.length > 120) invalid('Section may contain at most 120 characters.');
    await client.query('BEGIN');
    const forClass=req.body.forClassEnrollment===true||req.body.code!==undefined;
    if(forClass){await validateClassCorSelection(client,req.body);await client.query("SELECT id FROM academic_verification_requests WHERE student_id=$1 AND status='pending' FOR UPDATE",[req.user.id]);}
    const current = (await client.query('SELECT department_code,year_level,section FROM users WHERE id=$1 FOR UPDATE', [req.user.id])).rows[0];
    if(forClass)requireOfficialDeclarationMatch(current,selection);
    const cor = req.body.cor ? await validateCorUpload(req.body.cor) : null;
    if(forClass&&!cor)invalid('Upload a valid COR for teacher enrollment review.');
    const saved = await client.query(`INSERT INTO academic_verification_requests(student_id,department_code,year_level,section,original_department,original_year,original_section,cor_file_name,cor_file_type,cor_file_size,cor_data_url)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,status`, [req.user.id, selection.departmentCode, selection.yearLevel, section || null, current.department_code, current.year_level, current.section, cor?.fileName, cor?.fileType, cor?.fileSize, cor?.fileDataUrl]);
    const recipient=forClass?await linkAcademicEnrollmentIntent(client,Number(req.user.id),saved.rows[0].id,req.body):null;
    await client.query('COMMIT'); res.status(201).json({ request: saved.rows[0],recipient });
  } catch (e) { await client.query('ROLLBACK'); if (e.code === '23505') return res.status(409).json({ message: 'An academic verification request is already pending.' }); failure(res, e); }
  finally { client.release(); }
});
router.patch('/academic/verification-requests/:id/cor', async (req, res) => {
  const db = await pool.connect();
  try {
    if (req.user.role !== 'student') invalid('Only students can attach their academic COR.', 403);
    if (!/^\d+$/.test(String(req.params.id))) invalid('Invalid verification request ID.');
    await db.query('BEGIN');
    const forClass=req.body.forClassEnrollment===true||req.body.code!==undefined;
    const selection=forClass?await validateClassCorSelection(db,req.body):null;
    const request = (await db.query('SELECT * FROM academic_verification_requests WHERE id=$1 AND student_id=$2 FOR UPDATE', [req.params.id, req.user.id])).rows[0];
    if (!request) invalid('Academic verification request not found.', 404);
    if (request.status !== 'pending' || request.cor_file_name) invalid('This request is already reviewed or already has a saved COR. Its original document is preserved.', 409);
    if(selection){
      if(request.department_code!==selection.departmentCode||request.year_level!==selection.yearLevel||(request.section||'')!==String(req.body.section??'').trim())invalid('The saved academic declaration does not match this enrollment submission.',409);
      const profile=(await db.query('SELECT department_code,year_level FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];requireOfficialDeclarationMatch(profile,selection);
    }
    const cor = await validateCorUpload(req.body.cor);
    await db.query('UPDATE academic_verification_requests SET cor_file_name=$2,cor_file_type=$3,cor_file_size=$4,cor_data_url=$5 WHERE id=$1', [request.id, cor.fileName, cor.fileType, cor.fileSize, cor.fileDataUrl]);
    const recipient=forClass?await linkAcademicEnrollmentIntent(db,Number(req.user.id),request.id,req.body):null;
    await db.query('COMMIT'); res.json({ message: 'Supporting academic COR saved.',recipient });
  } catch (e) { await db.query('ROLLBACK'); failure(res, e); } finally { db.release(); }
});
router.post('/academic/verification-requests/:id/class-intent',async(req,res)=>{
  const db=await pool.connect();
  try {
    if(req.user.role!=='student') invalid('Only students can route their own academic COR.',403);
    if(!/^\d+$/.test(String(req.params.id))) invalid('Invalid academic request ID.');
    await db.query('BEGIN');
    const recipient=await linkAcademicEnrollmentIntent(db,Number(req.user.id),Number(req.params.id),req.body);
    await db.query('COMMIT');res.status(200).json({recipient,message:'Saved COR sent to the class teacher. Official academic verification is still required before class enrollment.'});
  }catch(e){await db.query('ROLLBACK');failure(res,e);}finally{db.release();}
});
router.get('/academic/enrollment-intents',async(req,res)=>{
  try {
    if(req.user.role!=='teacher') invalid('Only class teachers can view these submissions.',403);
    const intents=(await pool.query(`SELECT i.id,i.academic_request_id,i.class_id,i.subject_id,i.semester,i.teacher_status,i.review_note,i.reviewed_at,r.status,r.department_code,r.year_level,r.section,r.cor_file_name,r.created_at,r.original_department,r.original_year,r.original_section,
      u.name AS student_name,u.email AS student_email,u.department_code AS official_department,u.year_level AS official_year,u.section AS official_section,
      c.name AS class_name,c.code AS class_code,c.department_code AS class_department,c.year_level AS class_year,c.subject_id AS current_subject_id,c.semester AS current_semester,c.enrollment_open,
      (current_subject.active=TRUE AND assignment.active=TRUE) AS curriculum_active,s.code AS subject_code,s.name AS subject_name
      FROM academic_enrollment_intents i JOIN academic_verification_requests r ON r.id=i.academic_request_id JOIN users u ON u.id=r.student_id
      JOIN classes c ON c.id=i.class_id JOIN subjects s ON s.id=i.subject_id
      LEFT JOIN subjects current_subject ON current_subject.id=c.subject_id
      LEFT JOIN curriculum_subjects assignment ON assignment.subject_id=c.subject_id AND assignment.department_code=c.department_code AND assignment.year_level=c.year_level AND assignment.semester=c.semester
      WHERE c.teacher_id=$1 AND NOT EXISTS(SELECT 1 FROM class_enrollment_requests e WHERE e.class_id=c.id AND e.student_id=r.student_id AND e.submitted_at>=i.created_at)
      ORDER BY (r.status='pending') DESC,r.created_at DESC LIMIT 100`,[req.user.id])).rows;
    res.set('Cache-Control','no-store').json({intents:intents.map(academicIntentReviewState)});
  }catch(e){failure(res,e);}
});
router.patch('/academic/enrollment-intents/:id',async(req,res)=>{
  const db=await pool.connect();
  try {
    if(req.user.role!=='teacher')invalid('Only class teachers can review these submissions.',403);
    if(!/^\d+$/.test(String(req.params.id)))invalid('Invalid submission ID.');
    await db.query('BEGIN');
    const result=await reviewAcademicEnrollmentIntent(db,Number(req.user.id),Number(req.params.id),req.body);
    await db.query('COMMIT');res.json(result);
  }catch(e){await db.query('ROLLBACK');failure(res,e);}finally{db.release();}
});
router.get('/academic/review', async (req, res) => {
  try {
    if (!await reviewer(req.user)) invalid('Academic verification requires a designated reviewer permission.', 403);
    const result = await pool.query(`SELECT r.id,r.student_id,r.department_code,r.year_level,r.section,r.status,r.note,r.created_at,r.cor_file_name, (SELECT COALESCE(json_agg(json_build_object('id',e.id,'className',c.name,'corFileName',e.cor_file_name)), '[]'::json) FROM class_enrollment_requests e JOIN classes c ON c.id=e.class_id WHERE e.academic_request_id=r.id) AS enrollment_requests,u.name AS student_name,u.email AS student_email,u.department_code AS official_department,u.year_level AS official_year
      FROM academic_verification_requests r JOIN users u ON u.id=r.student_id ORDER BY (r.status='pending') DESC,r.created_at DESC LIMIT 100`);
    res.set('Cache-Control', 'no-store').json({ requests: result.rows });
  } catch (e) { failure(res, e); }
});
router.patch('/academic/review/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!/^\d+$/.test(String(req.params.id))) invalid('Invalid verification request ID.');
    const permission = (await client.query("SELECT can_verify_academics FROM users WHERE id=$1 AND role='teacher' FOR SHARE", [req.user.id])).rows[0];
    if (!permission?.can_verify_academics) invalid('Academic verification requires a designated reviewer permission.', 403);
    if (!['approved', 'rejected'].includes(req.body.status)) invalid('Select approve or reject.');
    const note = String(req.body.note ?? '').trim(); if (note.length > 5000) invalid('Review note is too long.');
    const request = (await client.query('SELECT * FROM academic_verification_requests WHERE id=$1 FOR UPDATE', [req.params.id])).rows[0];
    if (!request) invalid('Verification request not found.', 404);
    if (request.status !== 'pending') invalid('This request has already been reviewed.', 409);
    if (req.body.status === 'approved') {
      const student = (await client.query('SELECT department_code,year_level,section FROM users WHERE id=$1 FOR UPDATE', [request.student_id])).rows[0];
      if (student.department_code !== request.original_department || student.year_level !== request.original_year || student.section !== request.original_section) invalid('The official record changed after this request. Reject it and ask the student to request a new review.', 409);
      await client.query('UPDATE users SET department_code=$2,year_level=$3,section=$4 WHERE id=$1', [request.student_id, request.department_code, request.year_level, request.section]);
    }
    await client.query('UPDATE academic_verification_requests SET status=$2,note=$3,reviewed_by=$4,reviewed_at=NOW() WHERE id=$1', [request.id, req.body.status, note || null, req.user.id]);
    await client.query('COMMIT'); res.json({ message: 'Academic verification reviewed.' });
  } catch (e) { await client.query('ROLLBACK'); failure(res, e); } finally { client.release(); }
});
export default router;
