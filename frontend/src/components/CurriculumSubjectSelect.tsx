import { useEffect, useId, useState } from 'react';
import { lmsRequest } from '../services/lmsService';
import type { AcademicSelection } from './AcademicSelectors';
import { Button } from './ui/Button';
import { semesterLabel, assignedSubjects, type CurriculumCatalog } from '../utils/curriculum';
export type { CurriculumSubject, CurriculumAssignment, CurriculumCatalog } from '../utils/curriculum';
export function CurriculumSubjectSelect({ selection, semester = 1, value, onChange }: { selection: AcademicSelection; semester?: number; value: string; onChange: (id: string) => void }) {
  const id = useId();
  const [catalog, setCatalog] = useState<CurriculumCatalog | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const requestKey = `${selection.departmentCode}/${selection.yearLevel}/${semester}/${refresh}`;
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    let active = true;
    let generation = 0;
    const load = () => {
      const current = ++generation;
      void lmsRequest<CurriculumCatalog>('/curriculum').then(r => { if (active && current === generation) { setCatalog(r); setError(''); } }).catch(e => { if (active && current === generation) setError(e.message); }).finally(() => { if (active && current === generation) setLoadedKey(requestKey); });
    };
    load();
    window.addEventListener('focus', load);
    return () => { active = false; window.removeEventListener('focus', load); };
  }, [requestKey]);
  const subjects = assignedSubjects(catalog, selection, semester);
  return <div className="space-y-1">
    <label htmlFor={id} className="text-sm font-medium">Official curriculum subject</label>
    <select id={id} disabled={loading} className="theme-ring w-full rounded-lg border theme-border bg-[var(--app-surface)] p-2 text-sm" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Select an assigned subject</option>
      {value && !subjects.some(s => String(s.id) === value) && <option value={value}>Current subject needs curriculum review</option>}
      {subjects.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
    </select>
    <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm theme-muted">{loading ? 'Loading subjects...' : `${subjects.length} active subject${subjects.length === 1 ? '' : 's'} for ${selection.departmentCode || 'the selected department'} / Year ${selection.yearLevel || '—'} / ${semesterLabel(semester)}`}</p><Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setRefresh(n => n + 1)}>Refresh subjects</Button></div>
    {error && <p role="alert" className="text-sm">{error}</p>}
    {catalog && !loading && !subjects.length && <p className="text-sm theme-muted">No official subjects are configured for this department, year and semester. Add or assign them on the Subjects page before opening enrollment.</p>}
  </div>;
}
