import { useId } from 'react';

import { SEMESTERS } from '../utils/curriculum';
export function SemesterSelect({ value, onChange }: { value: number; onChange: (semester: number) => void }) {
  const id = useId();
  return <div className="space-y-1">
    <label htmlFor={id} className="text-sm font-medium">Semester</label>
    <select id={id} value={value} onChange={e => onChange(Number(e.target.value))} className="theme-ring w-full rounded-lg border theme-border bg-[var(--app-surface)] p-2 text-sm">
      {SEMESTERS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  </div>;
}
