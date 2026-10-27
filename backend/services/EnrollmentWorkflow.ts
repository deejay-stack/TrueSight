import pool from '../config/db.js';
import { academicSelection, curriculumJoin, curriculumColumns, requireSubjectEligibility, subjectEligibility, semesterSelection } from './CollegeEnrollment.js';
import { invalid } from './LmsGrading.js';

// Shared projection for student tracking and the assigned teacher's queue.
export const enrollmentColumns = `cer.id,cer.class_id,cer.student_id,cer.status,cer.declared_department,cer.declared_year,cer.declared_section,cer.academic_request_id,cer.requested_subject_id,cer.requested_semester,
  cer.cor_file_name,cer.cor_file_type,cer.cor_file_size,(NULLIF(cer.cor_data_url,'') IS NOT NULL) AS cor_submitted,cer.rejection_note,cer.submitted_at,cer.reviewed_at,cer.reviewed_by,
  c.name AS class_name,c.code AS class_code,c.department_code AS class_department,c.year_level AS class_year,c.enrollment_open,${curriculumColumns},requested_subject.code AS requested_subject_code,requested_subject.name AS requested_subject_name,
  s.name AS student_name,s.email AS student_email,s.profile_image_url AS student_profile_image_url,
  s.department_code AS official_department,s.year_level AS official_year,s.section AS official_section,
  t.name AS teacher_name,t.profile_image_url AS teacher_profile_image_url`;
export const enrollmentJoins = `FROM class_enrollment_requests cer JOIN classes c ON c.id=cer.class_id JOIN users s ON s.id=cer.student_id JOIN users t ON t.id=c.teacher_id ${curriculumJoin} LEFT JOIN subjects requested_subject ON requested_subject.id=cer.requested_subject_id`;
export function projectEnrollment(row: any) {
  const hasCor = row.cor_submitted === true || Boolean(row.cor_data_url);
  let reason = !row.declared_department || !row.declared_year ? 'This older request needs a new department/year declaration.' :
    subjectEligibility({ department_code: row.official_department, year_level: row.official_year }, { ...row, department_code: row.class_department, year_level: row.class_year }, { departmentCode: row.declared_department, yearLevel: Number(row.declared_year) }).message;
  if (!reason && row.declared_section && row.declared_section !== row.official_section) reason = 'Section confirmation is awaiting authorized academic verification.';
  if (!reason && (!row.requested_subject_id || row.requested_subject_id !== row.subject_id)) reason = 'The requested subject is missing or the class subject changed. Reject this request so the student can submit a new eligible request.';
  if (!reason && row.requested_semester !== row.semester) reason = 'The class semester changed after this request. Reject it so the student can submit a new eligible request.';
  if (!reason && !hasCor) reason = 'A valid COR must be supplied before admission.';
  const verificationPending = !row.official_department || !row.official_year || Boolean(row.declared_section && row.declared_section !== row.official_section);
  const { cor_data_url, ...safe } = row;
  return { ...safe, cor_submitted: hasCor, eligible_for_approval: !reason && row.status === 'pending', eligibility_message: reason,
    verification_status: row.status === 'accepted' ? 'Enrolled' : row.status === 'rejected' ? 'Rejected' : reason && reason !== 'Section confirmation is awaiting authorized academic verification.' ? 'Enrollment Restricted' : verificationPending ? 'Pending Academic Verification' : 'Pending Teacher Approval' };
}
export async function enrollmentRecord(db: Pick<typeof pool, 'query'>, id: number) {
  return projectEnrollment((await db.query(`SELECT ${enrollmentColumns} ${enrollmentJoins} WHERE cer.id=$1`, [id])).rows[0]);
}

export async function prepareEnrollment(db: Pick<typeof pool, 'query'>, classId: number, studentId: number, body: any) {
  const selection = academicSelection(body);
  if (body.section !== undefined && typeof body.section !== 'string') invalid('Section must be text.');
  const section = String(body.section ?? '').trim(); if (section.length > 120) invalid('Section may contain at most 120 characters.');
  // Same user lock as standalone academic verification; prevents duplicate pending snapshots.
  const classroom = (await db.query('SELECT department_code,year_level,enrollment_open,semester FROM classes WHERE id=$1 FOR SHARE', [classId])).rows[0];
  const profile = (await db.query('SELECT department_code,year_level,section FROM users WHERE id=$1 FOR UPDATE', [studentId])).rows[0];
  if (!profile || !classroom) invalid('Student or class not found.', 404);
  if (body.semester !== undefined && semesterSelection(body.semester) !== classroom.semester) throw Object.assign(new Error('The selected semester does not match this class. Select the class semester or verify another code.'), { statusCode:403,eligibility:{ eligible:false,code:'SEMESTER_MISMATCH',requiredSemester:classroom.semester } });
  await requireSubjectEligibility(db, classId, studentId, selection);
  let academicId: number | null = null;
  const requestedSection = section || profile.section || null;
  if (!profile.department_code || !profile.year_level || requestedSection !== profile.section) {
    const pending = (await db.query("SELECT * FROM academic_verification_requests WHERE student_id=$1 AND status='pending'", [studentId])).rows[0];
    if (pending) {
      if (pending.department_code !== selection.departmentCode || Number(pending.year_level) !== selection.yearLevel || pending.section !== requestedSection) invalid('Your pending academic request has different information. Complete that review before submitting a different declaration.', 409);
      academicId = pending.id;
    } else academicId = (await db.query(`INSERT INTO academic_verification_requests(student_id,department_code,year_level,section,original_department,original_year,original_section)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [studentId, selection.departmentCode, selection.yearLevel, requestedSection, profile.department_code, profile.year_level, profile.section])).rows[0].id;
  }
  return { ...selection, section: requestedSection, academicId };
}

export async function enrollmentNotification(db: Pick<typeof pool, 'query'>, userId: number, role: 'teacher' | 'student', classId: number, requestId: number, title: string, message: string) {
  await db.query(`INSERT INTO notifications(user_id,receiver_role,type,severity,title,message,class_id,dedupe_key)
    VALUES($1,$2,$3,'info',$4,$5,$6,$7) ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [userId, role, role === 'teacher' ? 'enrollment_request' : 'enrollment_review', title, message, classId, `${role}:enrollment:${requestId}`]);
}
