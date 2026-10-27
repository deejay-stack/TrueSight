import { useEffect, useId, useState } from 'react';
import { Input } from './ui/Input';
import { lmsRequest } from '../services/lmsService';
export type AcademicSelection = { departmentCode: string; yearLevel: number };
export type AcademicCatalog = { departments: { code: string; name: string }[]; yearLevels: { id: number; label: string }[]; canReview?: boolean };

function SearchSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  const id = useId(); const [query, setQuery] = useState(''); const [open, setOpen] = useState(false); const [active, setActive] = useState(0);
  const matches = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const choose = (v: string) => { onChange(v); setOpen(false); setQuery(''); };
  return <div className="relative min-w-0 space-y-1" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id} className="text-sm font-medium">{label}</label>
    <Input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-options`} aria-autocomplete="list" aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
      value={open ? query : options.find(o => o.value === value)?.label ?? ''} placeholder={`Search ${label.toLowerCase()}`} onFocus={() => { setOpen(true); setQuery(''); }} onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
      onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(n => Math.max(0, Math.min(matches.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1)))); } if (e.key === 'Enter' && open) { e.preventDefault(); if (matches[active]) choose(matches[active].value); } if (e.key === 'Escape') setOpen(false); }} />
    {open && <div id={`${id}-options`} role="listbox" aria-label={label} className="absolute z-30 max-h-60 w-full overflow-auto rounded-xl border theme-border bg-[var(--app-surface)] p-1 shadow-lg">
      {matches.map((o, i) => <button id={`${id}-${i}`} key={o.value} type="button" role="option" aria-selected={value === o.value} onMouseDown={e => e.preventDefault()} onClick={() => choose(o.value)} className={`theme-ring block w-full rounded-lg p-2 text-left text-sm ${active === i ? 'bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)]' : ''}`}>{o.label}</button>)}
      {!matches.length && <p className="p-2 text-sm theme-muted">No valid options match. Choose an existing option.</p>}
    </div>}
  </div>;
}
export function AcademicSelectors({ value, onChange, catalog: supplied }: { value: AcademicSelection; onChange: (value: AcademicSelection) => void; catalog?: AcademicCatalog }) {
  const [loaded, setLoaded] = useState<AcademicCatalog | null>(null); const [error, setError] = useState('');
  useEffect(() => { let active = true; if (!supplied) lmsRequest<AcademicCatalog>('/academic/options').then(r => { if (active) setLoaded(r); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [supplied]);
  const catalog = supplied ?? loaded;
  if (!catalog) return <p className="text-sm theme-muted">{error || 'Loading academic options...'}</p>;
  return <div className="grid gap-3 sm:grid-cols-2">
    <SearchSelect label="Department" value={value.departmentCode} options={catalog.departments.map(d => ({ value: d.code, label: `${d.code} — ${d.name}` }))} onChange={departmentCode => onChange({ ...value, departmentCode })} />
    <SearchSelect label="Year Level" value={String(value.yearLevel || '')} options={catalog.yearLevels.map(y => ({ value: String(y.id), label: y.label }))} onChange={yearLevel => onChange({ ...value, yearLevel: Number(yearLevel) })} />
  </div>;
}
