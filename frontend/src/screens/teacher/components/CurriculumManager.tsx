import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AcademicSelectors, type AcademicSelection } from '../../../components/AcademicSelectors';
import type { CurriculumCatalog } from '../../../components/CurriculumSubjectSelect';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { lmsRequest } from '../../../services/lmsService';
import { SemesterSelect } from '../../../components/SemesterSelect';
import { SEMESTERS, semesterLabel } from '../../../utils/curriculum';

type Row = { subjectId?: number; code: string; name: string; active: boolean; subjectVersion?: number; assignmentVersion?: number; editExisting?: boolean };
function rowsFor(catalog: CurriculumCatalog, scope: AcademicSelection, semester: number): Row[] {
  return catalog.assignments.filter(a => a.department_code === scope.departmentCode && a.year_level === scope.yearLevel && a.semester === semester).flatMap(a => {
    const s = catalog.subjects.find(s => s.id === a.subject_id);
    return s ? [{ subjectId: s.id, code: s.code, name: s.name, active: a.active, subjectVersion: s.version, assignmentVersion: a.version }] : [];
  });
}
export function CurriculumManager() {
  const [catalog, setCatalog] = useState<CurriculumCatalog | null>(null);
  const [scope, setScope] = useState<AcademicSelection>({ departmentCode: 'BSIT', yearLevel: 1 });
  const [semester, setSemester] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState('');
  const [existing, setExisting] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [reloadCount, setReloadCount] = useState(0);
  const [savedMessage, setSavedMessage] = useState('');
  const newSubjectCodeRef = useRef<HTMLInputElement>(null);
  const focusNewSubject = useRef(false);
  useEffect(() => {
    if (focusNewSubject.current && newSubjectCodeRef.current) {
      newSubjectCodeRef.current.focus();
      newSubjectCodeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      focusNewSubject.current = false;
    }
  }, [rows.length]);
  useEffect(() => {
    let active = true;
    lmsRequest<CurriculumCatalog>('/curriculum').then(data => {
      if (active) { setCatalog(data); setRows(rowsFor(data, { departmentCode: 'BSIT', yearLevel: 1 }, 1)); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [reloadCount]);
  if (!catalog) return <section className="theme-card space-y-3 rounded-xl border theme-border p-4 text-sm">
    {error ? <><p role="alert">{error}</p><Button variant="outline" onClick={() => { setError(''); setReloadCount(n => n + 1); }}>Retry loading subjects</Button></> : <p role="status">Loading official subjects...</p>}
  </section>;
  const changeScope = (next: AcademicSelection) => {
    if (dirty) { setError('Save your current changes before selecting another department, year or semester.'); return; }
    setScope(next); setRows(rowsFor(catalog, next, semester)); setExisting(''); setQuery(''); setError(''); setSavedMessage('');
  };
  const changeSemester = (next: number) => {
    if (dirty) { setError('Save your current changes before selecting another semester.'); return; }
    setSemester(next); setRows(rowsFor(catalog, scope, next)); setExisting(''); setQuery(''); setError(''); setSavedMessage('');
  };
  const edit = (index: number, patch: Partial<Row>) => { setRows(old => old.map((row, i) => i === index ? { ...row, ...patch } : row)); setDirty(true); setSavedMessage(''); };
  const addSubject = () => {
    focusNewSubject.current = true;
    setRows(old => [...old, { code: '', name: '', active: true }]); setQuery(''); setDirty(true); setSavedMessage(''); setError('');
  };
  const reload = async () => {
    setBusy(true);
    try {
      const data = await lmsRequest<CurriculumCatalog>('/curriculum');
      setCatalog(data); setRows(rowsFor(data, scope, semester)); setDirty(false); setError(''); setSavedMessage(''); setExisting('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to refresh subjects.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (rows.some(row => !row.code.trim() || !row.name.trim())) {
      setError('Enter a subject code and name for every row before saving.'); return;
    }
    setBusy(true); setError('');
    try {
      const result = await lmsRequest<{ catalog?: CurriculumCatalog }>('/curriculum', { ...scope, semester, rows }, 'POST');
      const data = result.catalog ?? await lmsRequest<CurriculumCatalog>('/curriculum');
      setCatalog(data); setRows(rowsFor(data, scope, semester)); setDirty(false); setQuery('');
      const message = `Subjects saved for ${scope.departmentCode} / Year ${scope.yearLevel} / ${semesterLabel(semester)}.`;
      setSavedMessage(message); toast.success(message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save curriculum.'); }
    finally { setBusy(false); }
  };
  return <section className="theme-card space-y-4 rounded-xl border theme-border p-4" aria-label="Official curriculum management">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-semibold">Department and Year-Level Subject Catalog</h2>
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || !catalog.canManage} title={!catalog.canManage ? 'Designated curriculum permission is required to add subjects.' : undefined} onClick={addSubject}>Add subject</Button>
        <Button type="button" variant="outline" disabled={busy || !catalog.canManage || !dirty} onClick={() => void save()}>{busy ? 'Saving...' : 'Save changes'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void reload()}>{dirty ? 'Reload catalog (discard unsaved changes)' : 'Refresh catalog'}</Button>
      </div>
    </div>
    <p role="status" className="text-sm">{catalog.canManage ? 'You can add subjects and edit official curriculum assignments.' : 'View only. Ask designated curriculum staff to add or correct subjects. Ordinary teacher accounts cannot edit the official curriculum.'}</p>
    <p className="text-sm theme-muted">Configure the actual school curriculum. Subject names and codes are shared wherever the same subject is assigned. Deactivating an assignment blocks new requests and approvals; existing enrollments stay available.</p>
    <p className="text-sm font-medium">To enter another subject, choose Add subject. Saved subjects are read-only until you choose Edit existing subject; editing changes that saved subject everywhere it is assigned.</p>
    {savedMessage && !dirty && <p role="status" className="rounded-lg border theme-border p-3 text-sm font-medium">{savedMessage} You can switch year levels or refresh the catalog to view the saved records.</p>}
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <AcademicSelectors value={scope} onChange={changeScope} />
      <SemesterSelect value={semester} onChange={changeSemester} />
      <p role="status" className="text-sm theme-muted">{rows.filter(row => row.assignmentVersion !== undefined).length} saved / {rows.filter(row => row.assignmentVersion === undefined).length} new unsaved subject assignments for {scope.departmentCode} / Year {scope.yearLevel} / {semesterLabel(semester)}</p>
      <Input aria-label="Search curriculum subjects" placeholder="Search subject name or code" value={query} onChange={e => setQuery(e.target.value)} />
      {error && <p role="alert" className="text-sm">{error}</p>}
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
        <thead><tr><th className="p-2">Subject code</th><th className="p-2">Subject name</th><th className="p-2">Assignment status</th><th className="p-2">Record</th></tr></thead>
        <tbody>{rows.map((row, index) => (!row.subjectId || row.editExisting || `${row.code} ${row.name}`.toLowerCase().includes(query.toLowerCase())) && <tr key={index} className="border-t theme-border">
          <td className="p-2">{catalog.canManage && (!row.subjectId || row.editExisting) ? <Input ref={index === rows.length - 1 ? newSubjectCodeRef : undefined} aria-label={`Subject code row ${index + 1}`} maxLength={40} value={row.code} onChange={e => edit(index, { code: e.target.value })} /> : row.code}</td>
          <td className="p-2">{catalog.canManage && (!row.subjectId || row.editExisting) ? <Input aria-label={`Subject name row ${index + 1}`} maxLength={200} value={row.name} onChange={e => edit(index, { name: e.target.value })} /> : row.name}</td>
          <td className="p-2">{catalog.canManage ? <select aria-label={`Assignment status row ${index + 1}`} className="rounded-lg border theme-border bg-[var(--app-surface)] p-2" value={row.active ? 'active' : 'inactive'} onChange={e => edit(index, { active: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select> : row.active ? 'Active' : 'Inactive'}</td>
          <td className="p-2">{!row.subjectId ? <span className="text-xs font-semibold">New subject (unsaved)</span> : row.editExisting ? <span className="text-xs font-semibold">Editing saved subject</span> : <div className="space-y-1"><p className="text-xs theme-muted">{row.assignmentVersion === undefined ? 'New assignment (unsaved)' : 'Saved subject'}</p>{catalog.canManage && <Button type="button" size="sm" variant="outline" onClick={() => setRows(old => old.map((r,i) => i === index ? { ...r,editExisting:true } : r))}>Edit existing subject</Button>}</div>}</td>
        </tr>)}</tbody>
      </table></div>
      {!rows.length && <p className="text-sm theme-muted">{catalog.canManage ? 'No subjects assigned. Add actual subjects or explicitly assign an existing subject below.' : 'No official subjects are assigned to this department and year yet.'}</p>}
      {catalog.canManage && <div className="flex flex-wrap gap-2">
        <select aria-label="Existing subject to assign" className="min-w-0 max-w-full rounded-lg border theme-border bg-[var(--app-surface)] p-2 text-sm" value={existing} onChange={e => setExisting(e.target.value)}><option value="">Assign existing subject (shared curriculum)</option>{catalog.subjects.filter(s => s.active && !rows.some(row => row.subjectId === s.id)).map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}</select>
        <Button variant="outline" disabled={!existing} onClick={() => { const s = catalog.subjects.find(s => s.id === Number(existing)); if (s) { setRows(old => [...old, { subjectId: s.id, code: s.code, name: s.name, active: true, subjectVersion: s.version }]); setDirty(true); setQuery(''); setExisting(''); } }}>Assign subject</Button>
        {dirty && <Button variant="outline" onClick={() => { setRows(rowsFor(catalog, scope, semester)); setDirty(false); setError(''); }}>Discard unsaved changes</Button>}
      </div>}
    </fieldset>
    <details><summary className="cursor-pointer font-semibold">Complete configured curriculum</summary><div className="mt-3 space-y-3 text-sm">{['BSIT','BSHM','BSCRIM','BSED','BEED'].flatMap(department => [1,2,3,4].map(year => <div key={`${department}-${year}`} className="border-t theme-border pt-2"><h3 className="font-semibold">{department} / Year {year}</h3>{SEMESTERS.map(term => <div key={term.id} className="mt-2"><h4 className="font-medium">{term.label}</h4>{catalog.assignments.filter(a => a.department_code === department && a.year_level === year && a.semester === term.id).map(a => { const s = catalog.subjects.find(s => s.id === a.subject_id); return <p key={a.id}>{s?.code} - {s?.name} ({a.active ? 'Active' : 'Inactive'})</p>; })}</div>)}</div>))}</div></details>
    {catalog.canManage && <details><summary className="cursor-pointer font-semibold">Classes requiring curriculum configuration ({catalog.issues.length})</summary><p className="my-2 text-sm theme-muted">The class owner must select an official subject in Subject enrollment settings after its curriculum assignment is configured. No legacy mapping is guessed.</p>{catalog.issues.map(c => <p key={c.id} className="text-sm">{c.name} (class #{c.id}) — {c.department_code || 'Department missing'} / Year {c.year_level || 'missing'} / {semesterLabel(c.semester)}</p>)}</details>}
  </section>;
}
