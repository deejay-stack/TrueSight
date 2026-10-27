import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { RubricAssessment, RubricCriterion } from '../../../services/lmsService';

export function RubricScoringTable({ criteria, scores, onChange, assessment, enabled, generating, onGenerate }: {
  criteria: RubricCriterion[]; scores: Record<string, string>; onChange: (scores: Record<string, string>) => void;
  assessment: RubricAssessment | null; enabled: boolean; generating: boolean; onGenerate: () => void;
}) {
  const useSuggestions = () => onChange({ ...scores, ...Object.fromEntries((assessment?.criteria ?? []).filter(c => c.score !== null).map(c => [c.criterionId, String(c.score)])) });
  const pending = criteria.filter(c => scores[c.id] === undefined || scores[c.id].trim() === '').length;
  const total = Number(criteria.reduce((sum, c) => sum + (Number(scores[c.id]) || 0), 0).toFixed(2));
  const max = Number(criteria.reduce((sum, c) => sum + c.maxPoints, 0).toFixed(2));
  return <div className="space-y-3 rounded-xl border theme-border p-3">
    <h4 className="font-semibold">Rubric assessment and teacher approval</h4>
    {enabled && <>
      <p className="text-sm theme-muted">AI-assisted suggestions are provisional. Objective checks use saved content and teacher-configured standards; detection probability is never converted into a grade.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={generating} onClick={onGenerate}>{generating ? 'Assessing...' : 'Generate suggestions from saved analysis'}</Button>
        <Button type="button" size="sm" variant="outline" disabled={!assessment?.criteria.some(c => c.score !== null)} onClick={useSuggestions}>Accept / restore available suggestions</Button></div>
      {assessment && <p className="text-xs theme-muted">{assessment.limitations} Saved analysis: submission {assessment.analysisReference.submissionId}, version {assessment.analysisReference.submittedVersion}. Generated {new Date(assessment.generatedAt).toLocaleString()}.</p>}
    </>}
    <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left text-sm">
      <thead><tr><th className="p-2">Criterion</th><th className="p-2">Maximum</th><th className="p-2">AI Suggestion</th><th className="p-2">Teacher's Final Score</th></tr></thead>
      <tbody>{criteria.map(c => {
        const suggestion = assessment?.criteria.find(s => s.criterionId === c.id);
        return <tr key={c.id} className="border-t theme-border align-top">
          <td className="max-w-sm p-2 break-words"><p className="font-medium">{c.title}</p><p className="whitespace-pre-wrap theme-muted">{c.description}</p>{c.guidance && <p className="mt-1 whitespace-pre-wrap theme-muted">Teacher guidance: {c.guidance}</p>}</td>
          <td className="p-2">{c.maxPoints}</td>
          <td className="max-w-sm p-2">{suggestion?.score !== null && suggestion?.score !== undefined ? <p className="font-semibold">{suggestion.score}/{c.maxPoints}</p> : <p>Requires Teacher Evaluation</p>}
            <p className="mt-1 text-xs theme-muted">{suggestion?.explanation ?? (enabled && c.aiEnabled ? 'Run analysis or generate suggestions from saved analysis.' : 'Teacher-only criterion.')}</p>
            {Boolean(suggestion?.evidence.length) && <ul className="mt-1 space-y-1 text-xs theme-muted">{suggestion!.evidence.map(e => <li key={e.requirement}>{e.met ? 'Met' : 'Not met'}: {e.requirement} — {e.observed}</li>)}</ul>}
          </td>
          <td className="w-36 p-2"><Input aria-label={`${c.title} teacher final points`} type="number" min="0" max={c.maxPoints} step="0.01" value={scores[c.id] ?? ''} onChange={e => onChange({ ...scores, [c.id]: e.target.value })} /></td>
        </tr>;
      })}</tbody>
      <tfoot><tr className="border-t theme-border font-semibold"><td className="p-2">TOTAL</td><td className="p-2">{max}</td><td className="p-2">{assessment?.suggestedTotal !== null && assessment?.suggestedTotal !== undefined ? `${assessment.suggestedTotal}/${max} (${assessment.suggestedPercentage}%)` : enabled ? `Incomplete${assessment ? `: subtotal ${assessment.partialTotal}` : ''}` : 'Teacher only'}</td><td className="p-2">{total}/{max}{pending ? ` (${pending} unscored)` : ` (${Number((total / max * 100).toFixed(2))}%)`}</td></tr></tfoot>
    </table></div>
    {pending > 0 && <p className="text-sm theme-muted">This is an incomplete assessment. Enter the remaining teacher scores before approving the official grade.</p>}
    <p className="text-xs theme-muted">Accepting suggestions fills only supported criteria. Teacher-only scores remain editable. Nothing is published until you approve the official grade.</p>
  </div>;
}
