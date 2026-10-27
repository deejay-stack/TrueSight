import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { AcademicSelectors, type AcademicSelection } from '../../../components/AcademicSelectors';
import { lmsRequest } from '../../../services/lmsService';
import type { TeacherClass } from '../../../services/classService';
import { CurriculumSubjectSelect } from '../../../components/CurriculumSubjectSelect';
import { SemesterSelect } from '../../../components/SemesterSelect';

export function ClassEnrollmentSettings({ classroom, onSaved }: { classroom: TeacherClass; onSaved: () => void }) {
  const [selection, setSelection] = useState<AcademicSelection>({ departmentCode: classroom.departmentCode ?? '', yearLevel: classroom.yearLevel ?? 0 });
  const [open, setOpen] = useState(classroom.enrollmentOpen !== false);
  const [subjectId, setSubjectId] = useState(classroom.subjectId ? String(classroom.subjectId) : '');
  const [semester, setSemester] = useState(classroom.semester ?? 1);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await lmsRequest(`/${classroom.id}/enrollment-settings`, { ...selection, semester, subjectId: subjectId ? Number(subjectId) : null, enrollmentOpen: open }); toast.success('Enrollment settings saved.'); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save settings.'); }
    finally { setSaving(false); }
  };
  return <div className="order-1 space-y-2 rounded-xl border theme-border p-4 text-sm">
    <h4 className="font-semibold">Subject enrollment</h4>
    <AcademicSelectors value={selection} onChange={value => { setSelection(value); setSubjectId(''); }} />
    <SemesterSelect value={semester} onChange={value => { setSemester(value); setSubjectId(''); }} />
    <CurriculumSubjectSelect selection={selection} semester={semester} value={subjectId} onChange={setSubjectId} />
    <label className="flex items-center gap-2"><input type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} />Open to new enrollment</label>
    <p className="theme-muted">Students must have the same verified department and year level. Existing enrollments are preserved.</p>
    <Button size="sm" disabled={saving || !selection.departmentCode || !selection.yearLevel || (open && !subjectId)} onClick={() => void save()}>{saving ? 'Saving...' : 'Save enrollment settings'}</Button>
  </div>;
}
