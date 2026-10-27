import type { ClassSubmission } from "../../../services/classService";
import { Card, CardContent } from "../../../components/ui/Card";

export function AnalysisSummary({ submission }: { submission: ClassSubmission }) {
  const details = submission.analysisDetails;
  const completed = details?.analysisStatus === "completed" && typeof submission.isAIGenerated === "boolean";

  const percent = (number: number | null) => typeof number === "number" && Number.isFinite(number) ? `${number.toFixed(2)}%` : "Unavailable";
  const detector = typeof details?.detectorType === "string" ? details.detectorType : submission.submissionType === "code" ? "code" : submission.submissionType === "image" ? "image" : "text";
  return <Card className="theme-card"><CardContent className="space-y-4 p-5">
    <div><p className="design-eyebrow">TRUESIGHT AI ANALYSIS</p><h3 className="mt-2 text-xl font-semibold">{typeof details?.decisionLabel === "string" ? details.decisionLabel : "Analysis unavailable or not run yet"}</h3></div>
    <div className="grid grid-cols-2 gap-3 text-sm">
      {[["AI model score", submission.aiProbability], ["Human model score", submission.humanProbability]].map(([label, value]) => <div key={String(label)} className="rounded-xl border theme-border p-3"><p className="text-xs theme-muted">{label}</p><p className="mt-1 font-semibold">{completed ? percent(typeof value === 'number' ? value : null) : 'Unavailable'}</p>{completed && typeof value === 'number' && <div role="meter" aria-label={String(label)} aria-valuenow={Number(value.toFixed(2))} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--app-border)]"><div className={details?.decisionTone === 'ai' ? 'h-full bg-rose-500' : details?.decisionTone === 'human' ? 'h-full bg-teal-500' : 'h-full bg-amber-500'} style={{ width: `${value}%` }} /></div>}</div>)}
    </div>
    <p className="text-xs theme-muted">These are uncalibrated model scores, not verified authorship probabilities or confidence that the result is correct.</p>
    <p className="text-sm theme-muted">Detector: {typeof details?.modelName === 'string' ? details.modelName : 'Not recorded'}</p>
    {detector === "code" && <p className="text-sm theme-muted">Fine-grained code explanation is unavailable for this detector. The CodeT5-tokenized BiLSTM provides an overall probability; reliable function or line attribution has not been established.</p>}
    {detector === "image" && <p className="text-sm theme-muted">EfficientNetV2L provides whole-image probabilities. Region-level explanations are unavailable; no image regions are marked as AI-generated.</p>}
    {typeof details?.message === "string" && <p className="text-sm theme-muted">{details.message}</p>}
    <details className="text-xs theme-muted"><summary className="cursor-pointer font-semibold">Advanced details</summary><dl className="mt-3 space-y-2">
      <div><dt>Returned classification</dt><dd>{typeof details?.predictedLabel === "string" ? details.predictedLabel : completed ? String(submission.isAIGenerated ? "AI" : "HUMAN") : "Unavailable"}</dd></div>
      <div><dt>Exact AI probability (0–1)</dt><dd>{details?.probabilities && typeof details.probabilities === "object" ? String((details.probabilities as Record<string, unknown>).ai ?? "Unavailable") : "Not recorded"}</dd></div>
      <div><dt>Document decision threshold (0–1)</dt><dd>{typeof details?.threshold === "number" ? details.threshold : "Not recorded"}</dd></div>
      <div><dt>Largest class score (uncalibrated)</dt><dd>{percent(submission.confidenceScore)}</dd></div>
      <div><dt>Analysis ID</dt><dd className="break-all">{String(details?.analysisId ?? "Legacy record: ID not recorded")}</dd></div>
      <div><dt>Model version</dt><dd className="break-all">{String(details?.modelVersion ?? "Not recorded")}</dd></div>
      <div><dt>Analysis status</dt><dd>{String(details?.analysisStatus ?? "Not run")}</dd></div>
      <div><dt>Submission type</dt><dd>{submission.submissionType}</dd></div>
      <div><dt>Record last updated</dt><dd>{submission.updatedAt ? new Date(submission.updatedAt).toLocaleString() : "Not recorded"} (may include later edits)</dd></div>
    </dl></details>
    <p className="text-xs theme-muted">AI detection results are estimates and may contain false positives or false negatives. They should not be used alone as proof of authorship or academic misconduct.</p>
  </CardContent></Card>;
}
