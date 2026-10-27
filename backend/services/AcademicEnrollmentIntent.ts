import pool from '../config/db.js';
import { academicSelection,collegeEligibility,requireClassSubject,requireSubjectEligibility,semesterSelection,subjectEligibility } from './CollegeEnrollment.js';
import { invalid } from './LmsGrading.js';
import { validateCorUpload } from './CorUpload.js';
import { enrollmentNotification } from './EnrollmentWorkflow.js';

export async function validateClassCorSelection(db:Pick<typeof pool,'query'>,body:any) {
  if(typeof body.code!=='string'||!body.code.trim())invalid('Verify a class code before uploading a class COR.');
  const selection=academicSelection(body),semester=semesterSelection(body.semester);
  const classroom=(await db.query('SELECT * FROM classes WHERE UPPER(code)=UPPER($1) FOR SHARE',[body.code.trim()])).rows[0];
  if(!classroom)invalid('Class not found for the provided code.',404);
  const reason=collegeEligibility({department_code:selection.departmentCode,year_level:selection.yearLevel},classroom);
  if(reason)invalid(reason,403);
  if(semester!==classroom.semester)invalid('The selected semester does not match this class. COR upload is blocked.',403);
  await requireClassSubject(db,classroom.subject_id,selection,semester);
  return selection;
}

export function requireOfficialDeclarationMatch(profile:any,selection:{departmentCode:string;yearLevel:number}) {
  if((profile.department_code&&profile.department_code!==selection.departmentCode)||(profile.year_level&&profile.year_level!==selection.yearLevel))
    invalid('The selected department or year does not match your official academic record. Correct the information before uploading a class COR.',403);
}

// This routes documentary verification to a selected class owner. It creates no class approval request or membership.
export async function linkAcademicEnrollmentIntent(db: Pick<typeof pool,'query'>,studentId: number,requestId: number,body: any) {
  if (typeof body.code !== 'string' || !body.code.trim()) invalid('Enter the class code to send this saved COR to its teacher.');
  const semester=semesterSelection(body.semester);
  const classroom=(await db.query('SELECT * FROM classes WHERE UPPER(code)=UPPER($1) FOR SHARE',[body.code.trim()])).rows[0];
  if (!classroom) invalid('Class not found for the provided code.',404);
  const request=(await db.query('SELECT * FROM academic_verification_requests WHERE id=$1 AND student_id=$2 FOR SHARE',[requestId,studentId])).rows[0];
  if (!request) invalid('Academic verification request not found.',404);
  if (request.status!=='pending') invalid('This academic request has already been reviewed. Submit an eligible class enrollment request instead.',409);
  if (!request.cor_data_url) invalid('Save a supporting COR before sending it to the class teacher.');
  const reason=collegeEligibility({department_code:request.department_code,year_level:request.year_level},classroom);
  if (reason) invalid(reason,403);
  if (semester!==classroom.semester) invalid('The selected semester does not match this class.',403);
  await requireClassSubject(db,classroom.subject_id,{departmentCode:request.department_code,yearLevel:request.year_level},semester);
  const existing=(await db.query('SELECT subject_id,semester,teacher_status FROM academic_enrollment_intents WHERE academic_request_id=$1 AND class_id=$2',[request.id,classroom.id])).rows[0];
  if(existing?.teacher_status==='rejected') invalid('The class teacher rejected this submission. Contact the teacher before requesting enrollment again.',409);
  if(existing&&(existing.subject_id!==classroom.subject_id||existing.semester!==semester)) invalid('The class subject or semester changed after this COR was sent. Resolve the academic request before routing it again.',409);
  const linked=existing?null:(await db.query(`INSERT INTO academic_enrollment_intents(academic_request_id,class_id,subject_id,semester) VALUES($1,$2,$3,$4)
    ON CONFLICT(academic_request_id,class_id) DO NOTHING RETURNING id`,[request.id,classroom.id,classroom.subject_id,semester])).rows[0];
  if (linked) await db.query(`INSERT INTO notifications(user_id,receiver_role,type,severity,title,message,class_id,dedupe_key)
    VALUES($1,'teacher','enrollment_request','info','COR enrollment request',$2,$3,$4)
    ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,[classroom.teacher_id,`A student submitted a COR for ${classroom.name}. Review and accept or reject it in Enrollment Requests.`,classroom.id,`academic-intent:${linked.id}`]);
  const teacher=(await db.query('SELECT name FROM users WHERE id=$1',[classroom.teacher_id])).rows[0];
  return {classId:classroom.id,classCode:classroom.code,className:classroom.name,teacherName:teacher.name,semester};
}

export const ownAcademicIntents = `(SELECT COALESCE(json_agg(json_build_object('classId',c.id,'classCode',c.code,'className',c.name,'teacherName',t.name,'semester',i.semester,'teacherStatus',i.teacher_status,'reviewNote',i.review_note)), '[]'::json)
  FROM academic_enrollment_intents i JOIN classes c ON c.id=i.class_id JOIN users t ON t.id=c.teacher_id WHERE i.academic_request_id=r.id)`;

export function academicIntentReviewState(row: any) {
  const selection={departmentCode:row.department_code,yearLevel:Number(row.year_level)};
  const classroom={department_code:row.class_department,year_level:row.class_year,enrollment_open:row.enrollment_open,subject_id:row.current_subject_id,curriculum_active:row.curriculum_active};
  const configurationReason=row.subject_id!==row.current_subject_id||row.semester!==row.current_semester
    ? 'The class subject or semester changed. Reject this submission and request a new one.'
    : row.status==='rejected'?'The academic verification request was rejected.'
    : subjectEligibility({department_code:row.department_code,year_level:row.year_level},classroom,selection).message;
  const officialReason=subjectEligibility({department_code:row.official_department,year_level:row.official_year},classroom,selection).message
    || (row.section&&row.section!==row.official_section?'Section confirmation is awaiting authorized academic verification.':null);
  const canVerify=canVerifyFromClassCor(row,{department_code:row.official_department,year_level:row.official_year,section:row.official_section});
  const ready=!configurationReason&&(!officialReason||canVerify)&&row.teacher_status!=='rejected';
  return {...row,eligible_for_approval:ready,can_accept:ready,
    eligibility_message:configurationReason||(!canVerify?officialReason:null),awaiting_verification:false,will_verify_academics:ready&&canVerify};
}

function canVerifyFromClassCor(request:any,profile:any) {
  return request.status==='pending'
    &&profile.department_code===request.original_department&&profile.year_level===request.original_year&&profile.section===request.original_section
    &&(!profile.department_code||profile.department_code===request.department_code)
    &&(!profile.year_level||profile.year_level===request.year_level);
}

// Acceptance is the assigned teacher's documentary verification and class decision.
// It cannot overwrite a conflicting official department/year or a changed snapshot.
export async function reviewAcademicEnrollmentIntent(db: Pick<typeof pool,'query'>,teacherId:number,intentId:number,body:any) {
  if(!['accepted','rejected'].includes(body.status))invalid('Select accepted or rejected.');
  const note=String(body.note??'').trim();if(note.length>5000)invalid('Review note is too long.');
  const intent=(await db.query(`SELECT i.* FROM academic_enrollment_intents i JOIN classes c ON c.id=i.class_id
    WHERE i.id=$1 AND c.teacher_id=$2 FOR UPDATE OF i`,[intentId,teacherId])).rows[0];
  if(!intent)invalid('Submission not found in your classes.',404);
  // Serialize approvals for this class before inserting membership and updating its counter.
  const classroom=(await db.query('SELECT * FROM classes WHERE id=$1 FOR UPDATE',[intent.class_id])).rows[0];
  if(classroom.teacher_id!==teacherId)invalid('Submission not found in your classes.',404);
  const request=(await db.query('SELECT * FROM academic_verification_requests WHERE id=$1 FOR UPDATE',[intent.academic_request_id])).rows[0];
  const profile=(await db.query('SELECT department_code,year_level,section FROM users WHERE id=$1 FOR UPDATE',[request.student_id])).rows[0];
  if(intent.teacher_status==='rejected'||intent.enrollment_request_id)invalid('This submission has already been reviewed.',409);
  if((await db.query('SELECT 1 FROM class_enrollments WHERE class_id=$1 AND student_id=$2',[intent.class_id,request.student_id])).rows.length)invalid('The student is already enrolled in this class.',409);
  if((await db.query("SELECT 1 FROM class_enrollment_requests WHERE class_id=$1 AND student_id=$2 AND status='pending'",[intent.class_id,request.student_id])).rows.length)invalid('Review the existing class enrollment request instead.',409);
  let enrollmentId:number|null=null;
  if(body.status==='accepted') {
    if(request.status==='rejected')invalid('The academic verification request was rejected.',409);
    if(intent.subject_id!==classroom.subject_id||intent.semester!==classroom.semester)invalid('The class subject or semester changed. Reject this submission and request a new one.',409);
    const reason=collegeEligibility({department_code:request.department_code,year_level:request.year_level},classroom);
    if(reason)invalid(reason,403);
    const selection={departmentCode:request.department_code,yearLevel:Number(request.year_level)};
    await requireClassSubject(db,classroom.subject_id,selection,intent.semester);
    const cor=await validateCorUpload({fileName:request.cor_file_name,fileType:request.cor_file_type,fileSize:request.cor_file_size,fileDataUrl:request.cor_data_url});
    if(canVerifyFromClassCor(request,profile)) {
      await db.query('UPDATE users SET department_code=$2,year_level=$3,section=$4 WHERE id=$1',[request.student_id,request.department_code,request.year_level,request.section]);
      await db.query("UPDATE academic_verification_requests SET status='approved',note=$2,reviewed_by=$3,reviewed_at=NOW() WHERE id=$1",[request.id,note||intent.review_note||'Academic information verified against the COR during class enrollment approval.',teacherId]);
      Object.assign(profile,{department_code:request.department_code,year_level:request.year_level,section:request.section});
    }
    await requireSubjectEligibility(db,classroom.id,request.student_id,selection);
    if(request.section&&request.section!==profile.section)invalid('The official section changed. Resolve the academic record before enrollment.',409);
      const saved=(await db.query(`INSERT INTO class_enrollment_requests(class_id,student_id,status,cor_file_name,cor_file_type,cor_file_size,cor_data_url,
        declared_department,declared_year,declared_section,academic_request_id,requested_subject_id,requested_semester,reviewed_by,reviewed_at)
        VALUES($1,$2,'accepted',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) RETURNING id`,
        [classroom.id,request.student_id,cor.fileName,cor.fileType,cor.fileSize,cor.fileDataUrl,selection.departmentCode,selection.yearLevel,request.section||profile.section,request.id,intent.subject_id,intent.semester,teacherId])).rows[0];
      enrollmentId=saved.id;
      const membership=await db.query('INSERT INTO class_enrollments(class_id,student_id) VALUES($1,$2) ON CONFLICT(class_id,student_id) DO NOTHING RETURNING id',[classroom.id,request.student_id]);
      if(membership.rows.length)await db.query('UPDATE classes SET student_count=student_count+1 WHERE id=$1',[classroom.id]);
      await enrollmentNotification(db,request.student_id,'student',classroom.id,saved.id,'Enrollment Approved','Your enrollment was approved. Your class is now available.');
  }
  await db.query('UPDATE academic_enrollment_intents SET teacher_status=$2,review_note=$3,reviewed_by=$4,reviewed_at=NOW(),enrollment_request_id=$5 WHERE id=$1',[intent.id,body.status,note||null,teacherId,enrollmentId]);
  if(!enrollmentId)await db.query(`INSERT INTO notifications(user_id,receiver_role,type,severity,title,message,class_id,dedupe_key)
    VALUES($1,'student','enrollment_review','info',$2,$3,$4,$5) ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [request.student_id,'Enrollment Request Rejected',`Your class request was rejected. ${note||'Contact the class teacher for details.'}`,classroom.id,`academic-intent-review:${intent.id}:rejected`]);
  return {enrolled:Boolean(enrollmentId),enrollmentRequestId:enrollmentId,message:enrollmentId?'COR accepted. The student is officially enrolled and now has class access.':'Class request rejected. The academic profile and COR were preserved.'};
}
