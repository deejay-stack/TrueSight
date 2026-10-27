import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { AcademicSelectors, type AcademicSelection } from '../../../components/AcademicSelectors';
import { SemesterSelect } from '../../../components/SemesterSelect';
import { semesterLabel } from '../../../utils/curriculum';
import type { EnrollmentCatalog } from '../../../utils/enrollmentFlow';

type Props = {
  catalog: EnrollmentCatalog | null; error: string; busy?: boolean;
  semester: number; onSemesterChange: (value: number) => void;
  selection: AcademicSelection; onSelectionChange: (value: AcademicSelection) => void;
  onSelect: (code: string) => void; onOpenSettings: () => void; onRefresh: () => void;
};
export function EligibleSubjects({ catalog: data,error,busy=false,semester,onSemesterChange,selection,onSelectionChange,onSelect,onOpenSettings,onRefresh }: Props) {
  const [query,setQuery] = useState('');
  const verified = Boolean(data?.profile.department_code && data.profile.year_level);
  const matches = Boolean(verified && selection.departmentCode === data?.profile.department_code && selection.yearLevel === data?.profile.year_level);
  const subjects = data?.subjects.filter(s => s.semester === semester) ?? [];
  return <div className="space-y-3 rounded-xl border theme-border p-3 text-sm">
    <p>Official department: {data?.profile.department_code || 'Not assigned'} / Year: {data?.profile.year_level || 'Not assigned'} / Section: {data?.profile.section || 'Not assigned'}</p>
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onRefresh}>Refresh academic information</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={onOpenSettings}>Academic profile settings</Button></div>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={busy} className="min-w-0 space-y-3">
      <AcademicSelectors value={selection} onChange={onSelectionChange} catalog={data ?? undefined} />
      <SemesterSelect value={semester} onChange={onSemesterChange} />
      {verified && selection.departmentCode && selection.yearLevel > 0 && !matches && <p role="status">Confirm the department and year shown in your official profile. Corrections remain available through Settings.</p>}
      <h3 className="font-semibold">Available Subjects for Your Department and Year Level</h3>
      <p className="theme-muted">{semesterLabel(semester)}</p>
      <Input aria-label="Search eligible subjects" placeholder="Search subjects or teachers" value={query} onChange={e => setQuery(e.target.value)} />
      {!data ? <p>Loading eligible subjects...</p> : !verified ? <p className="theme-muted">Select the academic information shown on your COR, then verify a matching class code. COR upload is enabled only when the department, year and semester match. Teacher acceptance verifies the information and enrolls you.</p> : subjects.filter(s => `${s.code} ${s.name} ${data.classes.filter(c => c.subject_id === s.id && c.semester === semester).map(c => c.teacher_name).join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(s => <div key={`${s.id}-${s.semester}`} className="space-y-2 border-t theme-border pt-2">
        <p className="font-semibold">{s.code} - {s.name}</p><p className="theme-muted">{data.profile.department_code} / Year {data.profile.year_level} / {semesterLabel(s.semester)}</p>
        {data.classes.filter(c => c.subject_id === s.id && c.semester === semester).map(c => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2"><p>{c.name} / {c.teacher_name}</p><Button type="button" size="sm" variant="outline" disabled={!matches} onClick={() => onSelect(c.code)}>Select subject</Button></div>)}
        {!data.classes.some(c => c.subject_id === s.id && c.semester === semester) && <p className="theme-muted">No open class available to request. Existing enrolled classes and pending requests remain in their lists.</p>}
      </div>)}
      {verified && !subjects.length && <p className="theme-muted">No active subjects are configured for your verified department/year in this semester. Contact designated academic staff.</p>}
    </fieldset>
  </div>;
}
