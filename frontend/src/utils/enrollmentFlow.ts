import type { AcademicCatalog, AcademicSelection } from '../components/AcademicSelectors';
import type { ClassJoinLookup } from '../services/classService';
import { semesterLabel } from './curriculum';
import type { AcademicClassRecipient } from '../services/academicEnrollmentService';

export type AcademicVerificationRequest = { id: number; status: string; department_code: string; year_level: number; section: string | null; cor_file_name: string | null; note?: string | null; class_intents?:AcademicClassRecipient[] };
export type EnrollmentCatalog = AcademicCatalog & {
  profile: { department_code: string | null; year_level: number | null; section: string | null };
  verificationRequests: AcademicVerificationRequest[];
  subjects: { id: number; code: string; name: string; semester: number }[];
  classes: { id: number; subject_id: number; name: string; code: string; department_code: string; year_level: number; semester: number; teacher_name: string }[];
};
export type EnrollmentFlow = { mode: 'blocked' | 'academic-request' | 'academic-attachment' | 'academic-pending' | 'class-request'; canUpload: boolean; message: string; pending: AcademicVerificationRequest | null };

// One gate drives both the file picker and submission action. The backend repeats all class checks.
export function enrollmentFlow({ catalog, selection, section, semester, code, lookup }: {
  catalog: EnrollmentCatalog | null; selection: AcademicSelection; section: string; semester: number; code: string; lookup: ClassJoinLookup | null;
}): EnrollmentFlow {
  const pending = catalog?.verificationRequests?.find(r => r.status === 'pending') ?? null;
  const blocked = (message: string): EnrollmentFlow => ({ mode: 'blocked', canUpload: false, message, pending });
  if (!catalog) return blocked('Loading your official academic information. Refresh academic information if it cannot be loaded.');
  const profile = catalog.profile;
  if (lookup?.enrollment&&lookup.classroom.code.toUpperCase()===code.trim().toUpperCase())return blocked('You are officially enrolled in this class. Open it from your enrolled classes.');
  if (!catalog.departments.some(d => d.code === selection.departmentCode) || ![1,2,3,4].includes(selection.yearLevel) || ![1,2].includes(semester)) return blocked('Select your department, year level and semester below.');
  if (section.trim().length > 120) return blocked('Section may contain at most 120 characters.');
  if ((profile.department_code&&profile.department_code!==selection.departmentCode)||(profile.year_level&&profile.year_level!==selection.yearLevel))return blocked('Confirm the department and year shown in your official profile. Request corrections through Settings if needed.');
  if (!lookup || lookup.classroom.code.toUpperCase() !== code.trim().toUpperCase()) return blocked('Enter the class code and choose Verify Code. COR upload stays disabled until the subject matches your department, year level and semester.');
  if (lookup.request?.status === 'pending') return blocked('Your enrollment request and COR are already saved and awaiting review.');
  if (lookup.classroom.enrollmentOpen===false)return blocked('This class is closed to new enrollment. COR upload is blocked.');
  if (lookup.classroom.departmentCode !== selection.departmentCode || lookup.classroom.yearLevel !== selection.yearLevel) return blocked(`This subject is assigned to ${lookup.classroom.departmentCode || 'an unassigned department'} / Year ${lookup.classroom.yearLevel || 'unassigned'}. You selected ${selection.departmentCode} / Year ${selection.yearLevel}. Correct the information or enter a matching class code before uploading a COR.`);
  if ((lookup.classroom.semester ?? 1) !== semester) return blocked(`This class belongs to ${semesterLabel(lookup.classroom.semester ?? 1)}. Select that semester or enter a different class code before uploading a COR.`);
  if(!lookup.classroom.subjectId||lookup.classroom.curriculumActive!==true)return blocked('This class has no active official subject assignment for its department, year level and semester. COR upload is blocked until authorized staff configure it.');
  if (!profile.department_code || !profile.year_level) {
    if (pending && (pending.department_code !== selection.departmentCode || pending.year_level !== selection.yearLevel || (pending.section || '') !== section.trim())) return blocked(`A verification request is already pending for ${pending.department_code} / Year ${pending.year_level} / Section ${pending.section || 'not assigned'}. Use those details to attach its COR, or resolve it through Settings.`);
    if(pending?.cor_file_name)return {mode:'academic-pending',canUpload:false,pending,message:'Your COR is saved. The assigned teacher will review it. Accepting the COR verifies the matching academic information and officially enrolls you in the class.'};
    return { mode: pending ? 'academic-attachment' : 'academic-request',canUpload:true,pending,message:'The subject matches your selected department, year level and semester. Upload your COR for teacher review. Teacher acceptance verifies the academic information and officially enrolls you.' };
  }
  if (!lookup.eligible) return blocked(lookup.eligibilityMessage || 'This class is not eligible for enrollment.');
  if (pending && section.trim() && section.trim() !== profile.section && (pending.department_code !== selection.departmentCode || pending.year_level !== selection.yearLevel || (pending.section || '') !== section.trim())) return blocked('Your section differs from the pending academic verification request. Resolve that request through Settings first.');
  return { mode:'class-request',canUpload:true,pending,message:'Your verified profile and this class match the selected department, year and semester. Upload your COR and submit it for teacher review.' };
}
