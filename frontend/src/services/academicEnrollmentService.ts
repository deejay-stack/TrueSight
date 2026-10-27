import { lmsRequest } from './lmsService';
export type AcademicClassRecipient = { classId:number;classCode:string;className:string;teacherName:string;semester:number;teacherStatus?:'pending'|'accepted'|'rejected';reviewNote?:string|null };
export type AcademicEnrollmentIntent = {
  id:number;academic_request_id:number;class_id:number;semester:number;status:string;
  department_code:string;year_level:number;section:string|null;cor_file_name:string;created_at:string;
  student_name:string;student_email:string;official_department:string|null;official_year:number|null;
  class_name:string;class_code:string;subject_code:string;subject_name:string;
  teacher_status:'pending'|'accepted'|'rejected';review_note:string|null;
  eligible_for_approval:boolean;can_accept:boolean;eligibility_message:string|null;awaiting_verification:boolean;
  will_verify_academics?:boolean;
};
export const fetchAcademicEnrollmentIntents = async () => (await lmsRequest<{intents:AcademicEnrollmentIntent[]}>('/academic/enrollment-intents')).intents;
export const sendAcademicCorToTeacher = async (requestId:number,code:string,semester:number) =>
  (await lmsRequest<{recipient:AcademicClassRecipient}>(`/academic/verification-requests/${requestId}/class-intent`,{code,semester},'POST')).recipient;
export const reviewAcademicCor = (id:number,status:'accepted'|'rejected',note:string) =>
  lmsRequest<{enrolled:boolean;enrollmentRequestId:number|null;message:string}>(`/academic/enrollment-intents/${id}`,{status,note});
