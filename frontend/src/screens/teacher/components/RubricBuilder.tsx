import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { lmsRequest, type AssessmentRequirements, type RubricCriterion } from '../../../services/lmsService';
import type { ClassActivity } from '../../../services/classService';

const blankRow = (id: string): RubricCriterion => ({ id, title: '', description: '', maxPoints: 0, aiEnabled: false });
const complete = (c: RubricCriterion) => Boolean(c.title.trim() && c.maxPoints > 0);
const textAreaClass = 'theme-ring w-full rounded-xl border theme-border bg-[var(--app-surface)] p-2 text-sm text-[var(--app-text)]';

export function RubricBuilder({ value, onChange, disabled = false, aiScoringEnabled = false, onAiScoringChange }: {
  value: RubricCriterion[]; onChange: (value: RubricCriterion[]) => void; disabled?: boolean;
  aiScoringEnabled?: boolean; onAiScoringChange?: (enabled: boolean) => void;
}) {
  const [initialRows] = useState(() => Array.from({ length: 5 }, () => blankRow(crypto.randomUUID())));
  const [trailingId, setTrailingId] = useState(() => crypto.randomUUID());
  const savedRows = value.length ? value : initialRows;
  const rows = complete(savedRows[savedRows.length - 1]) && savedRows.length < 100 ? [...savedRows, blankRow(trailingId)] : savedRows;
  const commit = (next: RubricCriterion[]) => { setTrailingId(crypto.randomUUID()); onChange(next); };
  const update = (id: string, patch: Partial<RubricCriterion>) => commit(rows.map(c => c.id === id ? { ...c, ...patch } : c));
  const requirement = (c: RubricCriterion, patch: Partial<AssessmentRequirements>) => update(c.id, { assessment: { ...c.assessment, ...patch } });
  const move = (index: number, offset: number) => {
    const next = [...rows]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; commit(next);
  };
  const total = Number(rows.reduce((sum, c) => sum + (Number.isFinite(c.maxPoints) ? c.maxPoints : 0), 0).toFixed(2));
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border theme-border p-3">
    <legend className="px-1 font-semibold">Rubric and Grading Criteria</legend>
    <p className="text-xs theme-muted">Edit cells directly. Tab moves between cells; Enter advances from a name or points cell. Unused blank rows are ignored; completing the last row adds another.</p>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[690px] text-left text-sm" onKeyDown={event => {
        if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement) || !event.target.hasAttribute('data-rubric-cell')) return;
        event.preventDefault();
        const cells = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-rubric-cell]'));
        cells[cells.indexOf(event.target) + 1]?.focus();
      }}>
        <thead><tr><th className="p-2">Criterion</th><th className="p-2">Description / Evaluation Standard</th><th className="w-28 p-2">Max Points</th><th className="p-2">AI Assistance</th><th className="p-2"><span className="sr-only">Row controls</span></th></tr></thead>
        <tbody>{rows.map((c, i) => <tr key={c.id} className="border-t theme-border align-top">
          <td className="min-w-36 p-2"><Input data-rubric-cell aria-label={`Criterion ${i + 1} title`} maxLength={255} value={c.title} onChange={e => update(c.id, { title: e.target.value })} /></td>
          <td className="min-w-48 p-2"><textarea data-rubric-cell aria-label={`Criterion ${i + 1} description`} maxLength={10000} rows={2} value={c.description} onChange={e => update(c.id, { description: e.target.value })} className={textAreaClass} /></td>
          <td className="p-2"><Input data-rubric-cell aria-label={`Criterion ${i + 1} maximum points`} type="number" min="0.01" max="10000" step="0.01" value={c.maxPoints || ''} onChange={e => update(c.id, { maxPoints: Number(e.target.value) })} /></td>
          <td className="min-w-44 space-y-2 p-2">
            <label className="flex items-center gap-2"><input aria-label={`Criterion ${i + 1} AI assistance`} type="checkbox" checked={c.aiEnabled === true} onChange={e => update(c.id, { aiEnabled: e.target.checked })} />{c.aiEnabled ? 'Enabled' : 'Teacher only'}</label>
            {c.aiEnabled && <details><summary className="cursor-pointer text-xs">Evaluation guidance and checks</summary>
              <div className="mt-2 space-y-2">
                <label className="block text-xs">Teacher guidance<textarea aria-label={`Criterion ${i + 1} guidance`} maxLength={10000} className={textAreaClass} value={c.guidance ?? ''} onChange={e => update(c.id, { guidance: e.target.value })} /></label>
                <label className="block text-xs">Minimum words<Input aria-label={`Criterion ${i + 1} minimum words`} type="number" min={1} max={100000} step={1} value={c.assessment?.minimumWords ?? ''} onChange={e => requirement(c, { minimumWords: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                <label className="block text-xs">Minimum paragraphs<Input aria-label={`Criterion ${i + 1} minimum paragraphs`} type="number" min={1} max={1000} step={1} value={c.assessment?.minimumParagraphs ?? ''} onChange={e => requirement(c, { minimumParagraphs: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                <label className="block text-xs">Required phrases (one per line)<textarea aria-label={`Criterion ${i + 1} required phrases`} rows={3} className={textAreaClass} value={(c.assessment?.requiredPhrases ?? []).join('\n')} onChange={e => requirement(c, { requiredPhrases: e.target.value.split('\n') })} onBlur={() => requirement(c, { requiredPhrases: (c.assessment?.requiredPhrases ?? []).map(p => p.trim()).filter(Boolean) })} /></label>
              </div>
            </details>}
          </td>
          <td className="space-y-1 p-2"><button type="button" className="theme-ring block text-xs" disabled={disabled || i === 0} aria-label={`Move criterion ${i + 1} up`} onClick={() => move(i, -1)}>↑</button><button type="button" className="theme-ring block text-xs" disabled={disabled || i === rows.length - 1} aria-label={`Move criterion ${i + 1} down`} onClick={() => move(i, 1)}>↓</button><button type="button" className="theme-ring block text-xs theme-muted" aria-label={`Remove criterion ${i + 1}`} onClick={() => commit(rows.filter(row => row.id !== c.id))}>Remove</button></td>
        </tr>)}</tbody>
        <tfoot><tr className="border-t theme-border font-semibold"><td className="p-2" colSpan={2}>TOTAL</td><td className="p-2" aria-live="polite">{total}</td><td colSpan={2} /></tr></tfoot>
      </table>
    </div>
    <div className="space-y-2 border-t theme-border pt-3 text-sm">
      <h4 className="font-semibold">AI-Assisted Scoring Settings</h4>
      <label className="flex items-center gap-2"><input type="checkbox" aria-label="Enable AI-assisted scoring" checked={aiScoringEnabled} disabled={disabled || !onAiScoringChange} onChange={e => onAiScoringChange?.(e.target.checked)} />Generate automatic suggestions after analysis</label>
      <p className="text-xs theme-muted">Mode: {aiScoringEnabled ? 'Assisted suggestions' : 'Teacher-only grading'}. Teacher review and approval are always required.</p>
      <p className="text-xs theme-muted">For text and documents, explicit word counts, paragraph counts, and required phrases are checked locally. Each configured requirement earns an equal share of its criterion points. Free-text guidance is for teacher review; content quality, clarity, correctness, and originality require teacher evaluation unless covered by explicit measurable standards. Detection probability is never a grade.</p>
    </div>
  </fieldset>;
}

export function ActivityRubricEditor({ activity, onSaved }: { activity: ClassActivity; onSaved: () => void }) {
  const [criteria, setCriteria] = useState(activity.rubric ?? []);
  const [maxScore, setMaxScore] = useState(activity.maxScore);
  const [enabled, setEnabled] = useState(activity.aiScoringEnabled === true);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await lmsRequest(`/activities/${activity.id}/rubric`, { rubric: criteria, maxScore, aiScoringEnabled: enabled }); toast.success('Rubric saved.'); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save rubric.'); }
    finally { setSaving(false); }
  };
  return <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Edit rubric</summary>
    <p className="my-2 theme-muted">Rubrics lock once any grades have been recorded.</p>
    <RubricBuilder value={criteria} onChange={setCriteria} disabled={saving} aiScoringEnabled={enabled} onAiScoringChange={setEnabled} />
    {!criteria.some(c => c.title.trim()) && <label>Activity points<Input type="number" min="0.01" max="10000" step="0.01" value={maxScore} onChange={e => setMaxScore(Number(e.target.value))} /></label>}
    <Button type="button" size="sm" className="mt-2" disabled={saving} onClick={() => void save()}>{saving ? 'Saving...' : 'Save rubric'}</Button>
  </details>;
}
