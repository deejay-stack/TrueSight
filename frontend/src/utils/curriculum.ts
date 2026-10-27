import type { AcademicSelection } from '../components/AcademicSelectors';

export const SEMESTERS = [{ id: 1, label: 'First Semester' }, { id: 2, label: 'Second Semester' }] as const;
export const semesterLabel = (semester: number) => SEMESTERS.find(s => s.id === semester)?.label ?? 'Semester not assigned';
export type CurriculumSubject = { id: number; code: string; name: string; active: boolean; version: number };
export type CurriculumAssignment = { id: number; subject_id: number; department_code: string; year_level: number; semester: number; active: boolean; version: number };
export type CurriculumCatalog = { canManage: boolean; subjects: CurriculumSubject[]; assignments: CurriculumAssignment[]; issues: { id: number; name: string; department_code: string | null; year_level: number | null; semester: number }[] };

export function assignedSubjects(catalog: CurriculumCatalog | null, selection: AcademicSelection, semester: number) {
  return catalog?.subjects.filter(s => s.active && catalog.assignments.some(a => a.subject_id === s.id && a.active && a.department_code === selection.departmentCode && a.year_level === selection.yearLevel && a.semester === semester)) ?? [];
}
