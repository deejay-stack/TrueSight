import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Gauge,
  Image,
  Layers,
  ListChecks,
  ListTodo,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { Card, CardContent } from "../../../components/ui/Card";
import type {
  ClassSubmission,
  SubmissionAnalysisDetails,
} from "../services/teacherClassroomService";

type MultiLevelAIDetectionPanelProps = {
  submission: ClassSubmission;
  details: SubmissionAnalysisDetails | null;
  imagePreviewUrl?: string | null;
  imagePreviewName?: string | null;
  imagePreviewLoading?: boolean;
};

type ScoreCard = {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  tone?: string;
  description?: string;
};

type TimelineStep = {
  label: string;
  status: string;
  detail: string;
};

type ReviewChecklistItem = {
  label: string;
  status: string;
};

type ClassProbability = {
  label: string;
  probability: number;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const getCardTone = (tone?: string): string => {
  if (tone === "risk") return "border-rose-500/35 bg-rose-500/10";
  if (tone === "warning") return "border-amber-500/35 bg-amber-500/10";
  if (tone === "calm") return "border-emerald-500/35 bg-emerald-500/10";
  return "theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)]";
};

const getStepTone = (status: string): string => {
  if (status === "complete") return "bg-emerald-500";
  if (status === "fallback") return "bg-amber-500";
  return "bg-rose-500";
};

const clampPercent = (value: number): number => Math.min(Math.max(value, 0), 100);

type ProbabilityTone = "human" | "suspicious" | "ai";

const getProbabilityTone = (score: number): ProbabilityTone => {
  const clamped = clampPercent(score);
  if (clamped >= 70) return "ai";
  if (clamped >= 40) return "suspicious";
  return "human";
};

const getVerdictTone = (prediction: string, aiProbability?: number | null): ProbabilityTone => {
  if (prediction === "Possibly AI-Generated" || prediction === "AI-likely" || prediction === "AI-generated" || prediction === "Likely AI-generated") return "ai";
  if (prediction === "Possibly Human-Created" || prediction === "Human-likely" || prediction === "Human" || prediction === "Likely human-created") return "human";
  if (prediction === "Inconclusive" || prediction.startsWith("Below AI threshold") || prediction === "Needs Review") return "suspicious";
  if (typeof aiProbability === "number") return getProbabilityTone(aiProbability);
  return "suspicious";
};

const getVerdictLabel = (prediction: string): string => {
  if (prediction === "AI-generated") return "AI-generated";
  if (prediction === "Human") return "Human-created";
  if (prediction === "Needs Review") return "Suspicious / Unsure";
  return prediction;
};

const getToneBadgeClass = (tone: ProbabilityTone): string => {
  if (tone === "ai") return "bg-[var(--heatmap-ai-bg)] text-[var(--heatmap-ai-text)]";
  if (tone === "suspicious") {
    return "bg-[var(--heatmap-suspicious-bg)] text-[var(--heatmap-suspicious-text)]";
  }
  return "bg-[var(--heatmap-human-bg)] text-[var(--heatmap-human-text)]";
};

const getToneBarClass = (tone: ProbabilityTone): string => {
  if (tone === "ai") return "bg-red-500";
  if (tone === "suspicious") return "bg-orange-500";
  return "bg-emerald-500";
};

const parseScoreCards = (value: unknown): ScoreCard[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;

      const candidate = item as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id : null;
      const label = typeof candidate.label === "string" ? candidate.label : null;
      const numericValue = asNumber(candidate.value);
      const value =
        numericValue !== null
          ? numericValue
          : typeof candidate.value === "string"
            ? candidate.value
            : null;

      if (!id || !label || value === null) return null;

      const card: ScoreCard = {
        id,
        label,
        value,
        unit: typeof candidate.unit === "string" ? candidate.unit : "",
        tone: typeof candidate.tone === "string" ? candidate.tone : "neutral",
      };

      if (typeof candidate.description === "string") {
        card.description = candidate.description;
      }

      return card;
    })
    .filter((item): item is ScoreCard => item !== null);
};

const parseTimeline = (value: unknown): TimelineStep[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;

      const candidate = item as Record<string, unknown>;
      const label = typeof candidate.label === "string" ? candidate.label : null;
      const status = typeof candidate.status === "string" ? candidate.status : null;
      const detail = typeof candidate.detail === "string" ? candidate.detail : null;

      if (!label || !status || !detail) return null;

      return { label, status, detail };
    })
    .filter((item): item is TimelineStep => item !== null);
};

const parseChecklist = (value: unknown): ReviewChecklistItem[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;

      const candidate = item as Record<string, unknown>;
      const label = typeof candidate.label === "string" ? candidate.label : null;
      const status = typeof candidate.status === "string" ? candidate.status : null;

      if (!label || !status) return null;

      return { label, status };
    })
    .filter((item): item is ReviewChecklistItem => item !== null);
};

const parseClassProbabilities = (value: unknown): ClassProbability[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;

      const candidate = item as Record<string, unknown>;
      const label = typeof candidate.label === "string" ? candidate.label : null;
      const probability = asNumber(candidate.probability);

      if (!label || probability === null) return null;

      return { label, probability };
    })
    .filter((item): item is ClassProbability => item !== null)
    .sort((left, right) => right.probability - left.probability);
};

const formatScoreCardValue = (card: ScoreCard): string => {
  if (typeof card.value === "number") {
    return `${card.value.toFixed(card.unit === "%" ? 2 : 0)}${card.unit ?? ""}`;
  }

  return `${card.value}${card.unit ?? ""}`;
};

export function MultiLevelAIDetectionPanel({
  submission,
  details,
  imagePreviewUrl = null,
  imagePreviewName = null,
  imagePreviewLoading = false,
}: MultiLevelAIDetectionPanelProps) {
  const [activeView, setActiveView] = useState<
    "overview" | "evidence" | "tokens" | "checklist"
  >("overview");

  const confidenceScore =
    submission.confidenceScore ?? asNumber(details?.confidenceScore);
  const writingConsistencyScore = asNumber(details?.writingConsistencyScore);
  const humanRevisionLikelihood = asNumber(details?.humanRevisionLikelihood);
  const detectorType =
    typeof details?.detectorType === "string" ? details.detectorType : "text";
  const provider = typeof details?.provider === "string" ? details.provider : "Detector";
  const riskBand = typeof details?.riskBand === "string" ? details.riskBand : null;
  const integrationStatus =
    typeof details?.integrationStatus === "object" && details.integrationStatus !== null
      ? (details.integrationStatus as Record<string, unknown>)
      : null;
  const finalPrediction =
    typeof details?.decisionLabel === "string"
      ? details.decisionLabel
      : typeof details?.verdict === "string"
        ? details.verdict
        : "No verdict yet";
  const finalTone = getVerdictTone(finalPrediction, submission.aiProbability);
  const analysisMessage =
    typeof details?.message === "string" ? details.message : null;
  const threshold = asNumber(details?.threshold);
  const humanConfidentMax = asNumber(details?.humanConfidentMax);
  const aiConfidentMin = asNumber(details?.aiConfidentMin);

  const scoreCards = parseScoreCards(details?.scoreCards);
  const timeline = parseTimeline(details?.analysisTimeline);
  const checklist = parseChecklist(details?.reviewChecklist);
  const classProbabilities = parseClassProbabilities(details?.classProbabilities);
  const imageProfile =
    typeof details?.imageProfile === "object" && details.imageProfile !== null
      ? (details.imageProfile as Record<string, unknown>)
      : null;
  const isImageAnalysis = detectorType === "image" || submission.submissionType === "image";

  const fallbackScoreCards: ScoreCard[] = [];
  const recordedCards = [
    ["aiProbability", "AI model score", submission.aiProbability],
    ["confidenceScore", "Largest class score", confidenceScore],
    ["writingConsistencyScore", "Writing consistency", writingConsistencyScore],
    ["humanRevisionLikelihood", "Human revision signs", humanRevisionLikelihood],
  ] as const;
  for (const [id, label, value] of recordedCards) {
    if (typeof value === "number" && Number.isFinite(value)) fallbackScoreCards.push({ id, label, value, unit: "%" });
  }
  const analysisFailed = details?.analysisStatus === "failed";
  const visibleScoreCards = analysisFailed ? [] : scoreCards.length > 0 ? scoreCards : fallbackScoreCards;
  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    ...(isImageAnalysis ? [
      { id: 'evidence', label: 'Classes', icon: Layers },
      { id: 'tokens', label: 'Profile', icon: Image },
    ] as const : []),
    { id: "checklist", label: "Review", icon: ListTodo },
  ] as const;

  return (
    <Card className="theme-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--app-text)]">
              Interactive AI Analysis
            </h3>
            <p className="text-sm theme-muted">
              {provider} report with evidence, status, and teacher review steps.
            </p>
            <p className="text-xs theme-muted">
              Detector: {detectorType} · Model: {typeof details?.modelName === "string" ? details.modelName : provider}
            </p>
            {analysisFailed && <p className="text-sm theme-muted">AI detection temporarily unavailable. Your submission is preserved.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {riskBand && (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--app-accent)_16%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--app-accent)]">
                {riskBand}
              </span>
            )}
            <span
              className={[
                "rounded-full px-3 py-1 text-xs font-semibold",
                getToneBadgeClass(finalTone),
              ].join(" ")}
            >
              {finalPrediction}
            </span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleScoreCards.map((card) => (
            <div
              key={card.id}
              className={["rounded-xl border p-3", getCardTone(card.tone)].join(" ")}
            >
              <p className="text-xs theme-muted">{card.label}</p>
              <p className="mt-1 break-words text-lg font-bold text-[var(--app-text)]">
                {formatScoreCardValue(card)}
              </p>
              {card.description && (
                <p className="mt-1 text-xs theme-muted">{card.description}</p>
              )}
            </div>
          ))}
        </div>

        {isImageAnalysis && (
          <div className="rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--app-text)]">
                  Image Detection Preview
                </p>
                <p className="text-xs theme-muted">
                  Uploaded image and model verdict for teacher review.
                </p>
              </div>
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-bold",
                  getToneBadgeClass(finalTone),
                ].join(" ")}
              >
                {getVerdictLabel(finalPrediction)}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(220px,420px)_1fr] lg:items-center">
              <div className="overflow-hidden rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-bg)_88%,black)]">
                {imagePreviewLoading ? (
                  <div className="flex aspect-video items-center justify-center text-sm theme-muted">
                    Loading image preview...
                  </div>
                ) : imagePreviewUrl ? (
                  <img
                    src={imagePreviewUrl}
                    alt={imagePreviewName ?? submission.fileName ?? "Analyzed image"}
                    className="max-h-[360px] w-full object-contain"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center p-5 text-center text-sm theme-muted">
                    Image preview is unavailable, but the model result is shown below.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wide theme-muted">Verdict</p>
                  <p className="text-2xl font-bold text-[var(--app-text)]">
                    {getVerdictLabel(finalPrediction)}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-3">
                    <p className="text-xs theme-muted">Largest class score</p>
                    <p className="text-lg font-bold text-[var(--app-text)]">
                      {typeof confidenceScore === "number"
                        ? `${confidenceScore.toFixed(2)}%`
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-3">
                    <p className="text-xs theme-muted">AI model score</p>
                    <p className="text-lg font-bold text-[var(--app-text)]">
                      {typeof submission.aiProbability === "number"
                        ? `${submission.aiProbability.toFixed(2)}%`
                        : "N/A"}
                    </p>
                  </div>
                </div>
                {analysisMessage && (
                  <p className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-3 text-sm theme-muted">
                    {analysisMessage}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_80%,transparent)] p-2">
          {tabs.filter((tab) => !(detectorType === "text" && details?.textExplanation && (tab.id === "evidence" || tab.id === "tokens"))).map((tab) => {
            const Icon = tab.icon;
            const selected = activeView === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveView(tab.id)}
                className={[
                  "inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition",
                  selected
                    ? "bg-[var(--app-accent)] text-[var(--app-on-accent)]"
                    : "text-[var(--app-muted)] hover:bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] hover:text-[var(--app-text)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeView === "overview" && (
          <>
            <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[var(--app-accent)]" />
                  <p className="text-sm font-semibold text-[var(--app-text)]">
                    Current Verdict
                  </p>
                </div>
                <p className="mt-2 text-lg font-semibold text-[var(--app-text)]">
                  {getVerdictLabel(finalPrediction)}
                </p>
                {analysisMessage && (
                  <p className="mt-2 text-sm theme-muted">{analysisMessage}</p>
                )}
                <details className="mt-2 text-xs theme-muted"><summary className="cursor-pointer">Advanced decision details</summary>
                {threshold !== null && (
                  <p className="mt-2 text-xs theme-muted">
                    Threshold: {(threshold * 100).toFixed(detectorType === "text" ? 8 : 2)}%
                    {humanConfidentMax !== null && aiConfidentMin !== null && humanConfidentMax < aiConfidentMin
                      ? ` | Review band: ${(humanConfidentMax * 100).toFixed(0)}%-${(aiConfidentMin * 100).toFixed(0)}%`
                      : ""}
                  </p>
                )}
                </details>
                {integrationStatus && (
                  <p className="mt-2 text-sm theme-muted">
                    {String(integrationStatus.message ?? "Integration status unavailable.")}
                  </p>
                )}
              </div>

              <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-[var(--app-accent)]" />
                  <p className="text-sm font-semibold text-[var(--app-text)]">
                    Processing Timeline
                  </p>
                </div>
                {timeline.length === 0 ? (
                  <p className="mt-2 text-sm theme-muted">
                    No processing timeline was returned.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {timeline.map((step) => (
                      <div key={`${step.label}-${step.status}`} className="flex gap-3">
                        <span
                          className={[
                            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                            getStepTone(step.status),
                          ].join(" ")}
                        />
                        <div>
                          <p className="text-sm font-medium text-[var(--app-text)]">
                            {step.label}
                          </p>
                          <details className="text-xs theme-muted"><summary>Technical details</summary>{step.detail}</details>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-[var(--app-accent)]" />
                  <p className="text-xs theme-muted">Interpretation</p>
                </div>
                <p className="mt-1 text-sm text-[var(--app-text)]">
                  These model scores are not calibrated authorship probabilities. A large score does not establish that this prediction is correct.
                </p>
              </div>
              <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                <div className="flex items-center gap-2">
                  {humanRevisionLikelihood !== null && humanRevisionLikelihood >= 55 ? (
                    <UserRoundCheck className="h-4 w-4 text-[var(--status-success)]" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-[var(--status-warning)]" />
                  )}
                  <p className="text-xs theme-muted">Review Hint</p>
                </div>
                <p className="mt-1 text-sm text-[var(--app-text)]">
                  {detectorType === "image"
                    ? "Image results should be reviewed alongside the uploaded image and assignment context."
                    : humanRevisionLikelihood !== null && humanRevisionLikelihood >= 55
                      ? "Higher human-revision likelihood suggests manual editing signs are present."
                      : "Review drafts, sources, and the student's explanation. This model does not measure revision history."}
                </p>
              </div>
            </div>
          </>
        )}

        {activeView === "evidence" && isImageAnalysis && <div className="rounded-xl border theme-border p-4">
          <div className="mb-3 flex items-center gap-2"><ListChecks className="h-4 w-4" /><h4 className="font-semibold">Image class probability evidence</h4></div>
          {!classProbabilities.length ? <p className="text-sm theme-muted">Image class probabilities are unavailable.</p> : <div className="grid gap-3 sm:grid-cols-2">{classProbabilities.map(entry => <div key={entry.label} className="rounded-lg border theme-border p-3"><p className="text-sm">{entry.label}: {entry.probability.toFixed(2)}%</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_18%,transparent)]"><div className={`h-full ${getToneBarClass(getProbabilityTone(entry.probability))}`} style={{ width: `${clampPercent(entry.probability)}%` }} /></div></div>)}</div>}
        </div>}
        {activeView === "tokens" && isImageAnalysis && <div className="rounded-xl border theme-border p-4">
          <div className="mb-3 flex items-center gap-2"><Image className="h-4 w-4" /><h4 className="font-semibold">Image technical profile</h4></div>
          {!imageProfile ? <p className="text-sm theme-muted">Image metadata was unavailable for this run.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(imageProfile).map(([key, value]) => <div key={key} className="rounded-lg border theme-border p-3"><p className="text-xs uppercase tracking-wide theme-muted">{key}</p><p className="mt-1 break-words text-sm font-semibold">{typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}</p></div>)}</div>}
        </div>}

        {activeView === "checklist" && (
          <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-[var(--app-accent)]" />
              <p className="text-sm font-semibold text-[var(--app-text)]">
                Teacher review checklist
              </p>
            </div>
            {checklist.length === 0 ? (
              <p className="text-sm theme-muted">No review checklist was returned.</p>
            ) : (
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div
                    key={`${item.label}-${item.status}`}
                    className="flex items-start justify-between gap-3 rounded-lg border theme-border p-3"
                  >
                    <span className="text-sm text-[var(--app-text)]">{item.label}</span>
                    <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--app-accent)_16%,transparent)] px-2 py-1 text-xs font-semibold text-[var(--app-accent)]">
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
