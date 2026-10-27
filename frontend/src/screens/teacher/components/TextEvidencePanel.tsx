import { useState } from "react";
import { Card, CardContent } from "../../../components/ui/Card";
import type { SubmissionAnalysisDetails } from "../../../services/classService";

type Passage = { sentenceNumber: number; start: number; end: number; text: string; impactPercentagePoints: number; maskedAiProbability: number };
type Explanation = {
  status: string; analyzedText: string; sentences: Passage[]; summary: string;
  evaluatedTokens: number; evaluatedSentences: number; availableSentences: number; truncated: boolean;
  limitations: string[]; baselineAiProbability: number;
};

const parseTextExplanation = (value: unknown, baseline: unknown): Explanation | null => {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof baseline !== 'number' || !Number.isFinite(baseline) || baseline < 0 || baseline > 1) return null;
  if (data.baselineAiProbability !== undefined && (typeof data.baselineAiProbability !== 'number' || Math.abs(data.baselineAiProbability - baseline) > 1e-7)) return null;
  if (data.status !== "completed" || data.method !== "sentence_occlusion" || typeof data.analyzedText !== "string" || !Array.isArray(data.sentences)) return null;
  const text = data.analyzedText;
  let previousEnd = 0;
  const sentences: Passage[] = [];
  for (const item of data.sentences) {
    if (!item || typeof item !== "object") return null;
    const passage = item as Passage;
    if (passage.sentenceNumber !== sentences.length + 1 || !Number.isInteger(passage.start) || !Number.isInteger(passage.end) || passage.start < previousEnd || passage.end <= passage.start || passage.end > text.length ||
      text.slice(passage.start, passage.end) !== passage.text || !Number.isFinite(passage.impactPercentagePoints) || !Number.isFinite(passage.maskedAiProbability) || passage.maskedAiProbability < 0 || passage.maskedAiProbability > 1 || Math.abs((baseline - passage.maskedAiProbability) * 100 - passage.impactPercentagePoints) > 0.0001) return null;
    sentences.push(passage);
    previousEnd = passage.end;
  }
  return {
    status: "completed", analyzedText: text, sentences, baselineAiProbability: baseline, summary: typeof data.summary === "string" ? data.summary : "",
    evaluatedTokens: Number(data.evaluatedTokens), evaluatedSentences: sentences.length, availableSentences: Number(data.availableSentences),
    truncated: data.truncated === true, limitations: Array.isArray(data.limitations) ? data.limitations.map(String) : [],
  };
};

const impactClass = (impact: number) => impact >= 10 ? "heatmap-impact-strong" : impact >= 5 ? "heatmap-impact-moderate" : impact >= 0.01 ? "heatmap-impact-positive" : impact <= -0.01 ? "heatmap-impact-negative" : "heatmap-impact-neutral";
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
const influenceLevel = (impact: number) => impact >= 10 ? 'Strong positive influence' : impact >= 5 ? 'Moderate positive influence' : impact >= 0.01 ? 'Weak positive influence' : impact <= -0.01 ? 'Negative influence' : 'Neutral influence';

function OcclusionEvidencePanel({ details }: { details: SubmissionAnalysisDetails | null }) {
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  if (details?.detectorType !== "text") return null;
  const probabilities = details.probabilities as Record<string, unknown> | undefined;
  const explanation = details.analysisStatus === 'completed' ? parseTextExplanation(details.textExplanation, probabilities?.ai) : null;
  if (!explanation) return (
    <Card className="theme-card"><CardContent className="space-y-2 p-5">
      <h3 className="text-lg font-semibold text-[var(--app-text)]">Sentence highlights & heatmap</h3>
      <p className="text-sm theme-muted">Sentence evidence is unavailable for this saved result. Run Analyze submission again to generate it with the local text model.</p>
    </CardContent></Card>
  );
  const ranked = [...explanation.sentences].sort((a, b) => b.impactPercentagePoints - a.impactPercentagePoints);
  const strongest = [...ranked].sort((a, b) => Math.abs(b.impactPercentagePoints) - Math.abs(a.impactPercentagePoints));
  const selected = explanation.sentences.find((entry) => entry.sentenceNumber === selectedNumber) ?? ranked[0];
  const segments = explanation.sentences.map((entry, index) => ({
    before: explanation.analyzedText.slice(index === 0 ? 0 : explanation.sentences[index - 1].end, entry.start),
    entry,
  }));

  return (
    <Card className="theme-card">
      <CardContent className="space-y-4 p-5">
        <div>
          <h3 className="text-lg font-semibold text-[var(--app-text)]">Sentence highlights & heatmap</h3>
          <p className="mt-1 text-sm theme-muted">{explanation.summary}</p>
          <p className="mt-2 text-sm text-[var(--app-text)]">Sentence highlights represent the AI detector's measured response to individual passages. They do not independently prove authorship or academic misconduct. Select a highlighted passage to inspect its effect.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs" aria-label="Heatmap legend">
          <span className="heatmap-impact-strong rounded px-2 py-1">Strong positive: +10 pp or more</span>
          <span className="heatmap-impact-moderate rounded px-2 py-1">Moderate positive: +5 to &lt;10 pp</span>
          <span className="heatmap-impact-positive rounded px-2 py-1">Weak positive: +0.01 to &lt;5 pp</span>
          <span className="heatmap-impact-negative rounded px-2 py-1">Lowered AI score: −0.01 pp or less</span>
          <span className="heatmap-impact-neutral rounded px-2 py-1">Little measured change</span>
        </div>
        <p className="text-xs theme-muted">pp = percentage points. These colors are display ranges, not classification thresholds. Unhighlighted text was not assessed for sentence impact.</p>
        <p className="text-sm text-[var(--app-text)]">
          Context: {explanation.evaluatedTokens} tokens (512 maximum). Passages assessed: {explanation.evaluatedSentences} of {explanation.availableSentences} in this context.
          {explanation.truncated && " The submission exceeds the model context; only the evaluated excerpt is shown below."}
          {explanation.evaluatedSentences < explanation.availableSentences && " Sentence analysis is capped at the first 16 passages to limit processing time."}
        </p>
        <div className="rounded-xl border theme-border bg-[var(--app-surface)] p-4 text-sm leading-8 whitespace-pre-wrap break-words text-[var(--app-text)]" aria-label="Sentence impact heatmap">
          {segments.map(({ before, entry }) => <span key={entry.sentenceNumber}>
            {before}<button type="button" onClick={() => setSelectedNumber(entry.sentenceNumber)}
              aria-pressed={selected?.sentenceNumber === entry.sentenceNumber}
              aria-label={`Passage ${entry.sentenceNumber}: ${signed(entry.impactPercentagePoints)} percentage points of AI-score support`}
              title={`Passage ${entry.sentenceNumber}: ${signed(entry.impactPercentagePoints)} percentage points`}
              className={`theme-ring heatmap-passage ${impactClass(entry.impactPercentagePoints)}`}>{entry.text}</button>
          </span>)}
          {explanation.analyzedText.slice(explanation.sentences.at(-1)?.end ?? 0)}
        </div>
        {selected && <div aria-live="polite" className="rounded-xl border theme-border bg-[var(--app-surface)] p-4 text-sm text-[var(--app-text)]">
          <p className="font-semibold">Passage {selected.sentenceNumber}: {signed(selected.impactPercentagePoints)} percentage points</p>
          <p className="mt-1">Influence level: {influenceLevel(selected.impactPercentagePoints)}</p>
          <blockquote className="mt-2 whitespace-pre-wrap border-l-2 theme-border pl-3">{selected.text}</blockquote>
          <p className="mt-2">Baseline AI model score: {(explanation.baselineAiProbability * 100).toFixed(4)}%. With this passage masked: {(selected.maskedAiProbability * 100).toFixed(4)}%. Difference (baseline − masked): {signed(selected.impactPercentagePoints)} percentage points.
            {selected.impactPercentagePoints >= 0.01 ? " Its presence supported a higher AI score." : selected.impactPercentagePoints <= -0.01 ? " Its presence lowered the AI score; this does not establish human authorship." : " Masking it made little measurable difference."}</p>
        </div>}
        <div className="space-y-2">
          <h4 className="font-semibold text-[var(--app-text)]">Passages ranked by absolute measured influence</h4>
          {strongest.length === 0 ? <p className="text-sm theme-muted">No assessed passage increased the AI score by at least 0.01 percentage points. This does not change the document verdict.</p> :
            strongest.map((entry) => <button key={entry.sentenceNumber} type="button" onClick={() => setSelectedNumber(entry.sentenceNumber)} className="theme-ring block w-full rounded-xl border theme-border bg-[var(--app-surface)] p-3 text-left text-sm text-[var(--app-text)]">
              <span className="font-semibold">Passage {entry.sentenceNumber} · {signed(entry.impactPercentagePoints)} pp</span>
              <span className="mt-1 block">{entry.text}</span>
            </button>)}
        </div>
        <ul className="list-disc space-y-1 pl-5 text-xs theme-muted">{explanation.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </CardContent>
    </Card>
  );
}

export function TextEvidencePanel({ details }: { details: SubmissionAnalysisDetails | null }) {
  if (details?.detectorType !== "text") return null;
  return <details className="rounded-xl border theme-border bg-[var(--app-surface)] p-4">
    <summary className="cursor-pointer text-sm font-semibold">Advanced evidence: sentence occlusion</summary>
    <div className="mt-4"><OcclusionEvidencePanel details={details} /></div>
  </details>;
}
