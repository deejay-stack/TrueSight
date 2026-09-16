import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  FileText,
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
  SuspiciousSentence,
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

type HighlightedToken = {
  token: string;
  aiProbability: number;
};

type HeatmapSegment = {
  text: string;
  score: number | null;
  title?: string;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
};

const deriveConfidenceLevel = (confidenceScore: number | null): string => {
  if (confidenceScore === null) return "Unavailable";
  if (confidenceScore >= 85) return "Very High";
  if (confidenceScore >= 72) return "High";
  if (confidenceScore >= 60) return "Moderate";
  return "Low";
};

const getConfidenceTone = (level: string): string => {
  const normalized = level.toLowerCase();

  if (normalized.includes("very high") || normalized === "high") {
    return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200";
  }

  if (normalized === "moderate") return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  if (normalized === "low") return "bg-rose-500/15 text-rose-800 dark:text-rose-200";

  return "bg-[color-mix(in_srgb,var(--app-muted)_20%,transparent)] text-[var(--app-text)]";
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

const getHeatmapClassName = (score: number): string => {
  const tone = getProbabilityTone(score);
  if (tone === "ai") return "heatmap-token heatmap-token-ai";
  if (tone === "suspicious") return "heatmap-token heatmap-token-suspicious";
  return "heatmap-token heatmap-token-human";
};

const getHeatmapLevel = (score: number): string => {
  const tone = getProbabilityTone(score);
  if (tone === "ai") return "AI-generated";
  if (tone === "suspicious") return "Suspicious / Unsure";
  return "Human-created";
};

const getVerdictTone = (prediction: string, aiProbability?: number | null): ProbabilityTone => {
  if (prediction === "AI-generated" || prediction === "Likely AI-generated") return "ai";
  if (prediction === "Human" || prediction === "Likely human-created") return "human";
  if (prediction === "Needs Review") return "suspicious";
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

const normalizeTokenForSearch = (token: string): string =>
  token
    .replace(/^Ġ/, " ")
    .replace(/^▁/, " ")
    .replace(/<\/?[^>]+>/g, "")
    .trim();

const buildTokenHeatmapSegments = (
  sourceText: string,
  tokens: HighlightedToken[],
): HeatmapSegment[] => {
  if (tokens.length === 0) {
    return sourceText ? [{ text: sourceText, score: null }] : [];
  }

  if (!sourceText.trim()) {
    return tokens.map((entry, index) => ({
      text: `${entry.token}${index < tokens.length - 1 ? " " : ""}`,
      score: entry.aiProbability,
      title: `${entry.aiProbability.toFixed(2)}% AI probability`,
    }));
  }

  const segments: HeatmapSegment[] = [];
  const loweredSource = sourceText.toLowerCase();
  let cursor = 0;
  let matchedCount = 0;

  tokens.forEach((entry) => {
    const needle = normalizeTokenForSearch(entry.token);
    if (!needle) return;

    const matchIndex = loweredSource.indexOf(needle.toLowerCase(), cursor);
    if (matchIndex < 0) return;

    if (matchIndex > cursor) {
      segments.push({ text: sourceText.slice(cursor, matchIndex), score: null });
    }

    const text = sourceText.slice(matchIndex, matchIndex + needle.length);
    segments.push({
      text,
      score: entry.aiProbability,
      title: `${entry.aiProbability.toFixed(2)}% AI probability`,
    });

    matchedCount += 1;
    cursor = matchIndex + needle.length;
  });

  if (cursor < sourceText.length) {
    segments.push({ text: sourceText.slice(cursor), score: null });
  }

  return matchedCount > 0 ? segments : [{ text: sourceText, score: null }];
};

const buildSentenceHeatmapSegments = (
  sourceText: string,
  sentences: SuspiciousSentence[],
): HeatmapSegment[] => {
  if (!sourceText.trim()) return [];

  const segments: HeatmapSegment[] = [];
  const loweredSource = sourceText.toLowerCase();
  let cursor = 0;
  let matchedCount = 0;

  sentences
    .filter((entry) => entry.aiSuspicionScore >= 35)
    .forEach((entry) => {
      const needle = entry.sentence.trim();
      if (!needle) return;

      const matchIndex = loweredSource.indexOf(needle.toLowerCase(), cursor);
      if (matchIndex < 0) return;

      if (matchIndex > cursor) {
        segments.push({ text: sourceText.slice(cursor, matchIndex), score: null });
      }

      segments.push({
        text: sourceText.slice(matchIndex, matchIndex + needle.length),
        score: entry.aiSuspicionScore,
        title: `Sentence ${entry.sentenceNumber}: ${entry.aiSuspicionScore.toFixed(2)}% suspicious`,
      });

      matchedCount += 1;
      cursor = matchIndex + needle.length;
    });

  if (cursor < sourceText.length) {
    segments.push({ text: sourceText.slice(cursor), score: null });
  }

  return matchedCount > 0 ? segments : [{ text: sourceText, score: null }];
};

const hasHighlightedSegments = (segments: HeatmapSegment[]): boolean =>
  segments.some((segment) => segment.score !== null);


const parseSuspiciousSentences = (value: unknown): SuspiciousSentence[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      if (typeof item !== "object" || item === null) return null;

      const candidate = item as Record<string, unknown>;
      const score = asNumber(candidate.aiSuspicionScore);
      const sentence = typeof candidate.sentence === "string" ? candidate.sentence : null;
      const sentenceNumber = asNumber(candidate.sentenceNumber);
      const reasons = Array.isArray(candidate.reasons)
        ? candidate.reasons.map((reason) => String(reason))
        : [];

      if (score === null || !sentence) return null;

      return {
        sentenceNumber: sentenceNumber !== null ? sentenceNumber : index + 1,
        sentence,
        aiSuspicionScore: score,
        reasons,
      };
    })
    .filter((item): item is SuspiciousSentence => item !== null);
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

const parseHighlightedTokens = (value: unknown): HighlightedToken[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) return null;

      const candidate = item as Record<string, unknown>;
      const token = typeof candidate.token === "string" ? candidate.token : null;
      const aiProbability = asNumber(candidate.aiProbability);

      if (token === null || aiProbability === null) return null;

      return { token, aiProbability };
    })
    .filter((item): item is HighlightedToken => item !== null);
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
  const confidenceLevel =
    typeof details?.confidenceLevel === "string"
      ? details.confidenceLevel
      : deriveConfidenceLevel(confidenceScore);
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
    typeof details?.finalPrediction === "string"
      ? details.finalPrediction
      : typeof details?.verdict === "string"
        ? details.verdict
        : "No verdict yet";
  const finalTone = getVerdictTone(finalPrediction, submission.aiProbability);
  const analysisMessage =
    typeof details?.message === "string" ? details.message : null;
  const threshold = asNumber(details?.threshold);
  const humanConfidentMax = asNumber(details?.humanConfidentMax);
  const aiConfidentMin = asNumber(details?.aiConfidentMin);

  const allSuspiciousSentences = parseSuspiciousSentences(details?.suspiciousSentences).filter(
    (entry) => entry.aiSuspicionScore >= 35,
  );
  const suspiciousSentences = allSuspiciousSentences
    .filter((entry) => entry.aiSuspicionScore >= 56)
    .sort((left, right) => right.aiSuspicionScore - left.aiSuspicionScore)
    .slice(0, 6);
  const scoreCards = parseScoreCards(details?.scoreCards);
  const timeline = parseTimeline(details?.analysisTimeline);
  const checklist = parseChecklist(details?.reviewChecklist);
  const classProbabilities = parseClassProbabilities(details?.classProbabilities);
  const highlightedTokens = parseHighlightedTokens(details?.highlightedTokens);
  const submittedText = typeof submission.contentText === "string" ? submission.contentText : "";
  const tokenHeatmapSegments = buildTokenHeatmapSegments(submittedText, highlightedTokens);
  const sentenceHeatmapSegments = buildSentenceHeatmapSegments(
    submittedText,
    allSuspiciousSentences,
  );
  const heatmapSegments = hasHighlightedSegments(tokenHeatmapSegments)
    ? tokenHeatmapSegments
    : sentenceHeatmapSegments;
  const heatmapSource = hasHighlightedSegments(tokenHeatmapSegments)
    ? "Stored token probabilities"
    : "sentence-level suspicious sections";
  const imageProfile =
    typeof details?.imageProfile === "object" && details.imageProfile !== null
      ? (details.imageProfile as Record<string, unknown>)
      : null;
  const isImageAnalysis = detectorType === "image" || submission.submissionType === "image";

  const fallbackScoreCards: ScoreCard[] = [
    {
      id: "aiProbability",
      label: "AI probability",
      value: submission.aiProbability ?? 0,
      unit: "%",
      tone: (submission.aiProbability ?? 0) >= 60 ? "risk" : "calm",
    },
    {
      id: "confidenceScore",
      label: "Confidence score",
      value: confidenceScore ?? 0,
      unit: "%",
      tone: (confidenceScore ?? 0) >= 72 ? "calm" : "warning",
    },
    {
      id: "writingConsistencyScore",
      label: "Writing consistency",
      value: writingConsistencyScore ?? 0,
      unit: "%",
      tone: (writingConsistencyScore ?? 0) >= 70 ? "warning" : "calm",
    },
    {
      id: "humanRevisionLikelihood",
      label: "Human revision signs",
      value: humanRevisionLikelihood ?? 0,
      unit: "%",
      tone: (humanRevisionLikelihood ?? 0) >= 55 ? "calm" : "warning",
    },
  ];
  const analysisFailed = details?.analysisStatus === "failed";
  const visibleScoreCards = analysisFailed ? [] : scoreCards.length > 0 ? scoreCards : fallbackScoreCards;
  const tabs = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    {
      id: "evidence",
      label: detectorType === "image" ? "Classes" : "Sentences",
      icon: Layers,
    },
    {
      id: "tokens",
      label: detectorType === "image" ? "Profile" : "Tokens",
      icon: detectorType === "image" ? Image : FileText,
    },
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
                getConfidenceTone(confidenceLevel),
              ].join(" ")}
            >
              {confidenceLevel} confidence
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
                    <p className="text-xs theme-muted">Confidence</p>
                    <p className="text-lg font-bold text-[var(--app-text)]">
                      {typeof confidenceScore === "number"
                        ? `${confidenceScore.toFixed(2)}%`
                        : "N/A"}
                    </p>
                  </div>
                  <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-3">
                    <p className="text-xs theme-muted">AI probability</p>
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
          {tabs.map((tab) => {
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
                    ? "bg-[var(--app-accent)] text-white"
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
                {threshold !== null && (
                  <p className="mt-2 text-xs theme-muted">
                    Threshold: {(threshold * 100).toFixed(detectorType === "text" ? 8 : 2)}%
                    {humanConfidentMax !== null && aiConfidentMin !== null && humanConfidentMax < aiConfidentMin
                      ? ` | Review band: ${(humanConfidentMax * 100).toFixed(0)}%-${(aiConfidentMin * 100).toFixed(0)}%`
                      : ""}
                  </p>
                )}
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
                          <p className="text-xs theme-muted">{step.detail}</p>
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
                  Confidence level indicates how strongly the available signals support
                  the AI probability estimate.
                </p>
              </div>
              <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3">
                <div className="flex items-center gap-2">
                  {humanRevisionLikelihood !== null && humanRevisionLikelihood >= 55 ? (
                    <UserRoundCheck className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-300" />
                  )}
                  <p className="text-xs theme-muted">Review Hint</p>
                </div>
                <p className="mt-1 text-sm text-[var(--app-text)]">
                  {detectorType === "image"
                    ? "Image results should be reviewed alongside the uploaded image and assignment context."
                    : humanRevisionLikelihood !== null && humanRevisionLikelihood >= 55
                      ? "Higher human-revision likelihood suggests manual editing signs are present."
                      : "Lower human-revision likelihood suggests fewer manual editing markers."}
                </p>
              </div>
            </div>
          </>
        )}

        {activeView === "evidence" && (
          <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4">
            <div className="mb-3 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[var(--app-accent)]" />
              <p className="text-sm font-semibold text-[var(--app-text)]">
                {detectorType === "image"
                  ? "Image class probability evidence"
                  : "Sentence-by-sentence suspicious sections"}
              </p>
            </div>

            {detectorType === "image" ? (
              classProbabilities.length === 0 ? (
                <div className="rounded-lg border border-dashed theme-border p-3 text-sm theme-muted">
                  No class probabilities were returned. Add a configured image model to
                  enable model-backed image analysis.
                </div>
              ) : (
                <div className="space-y-3">
                  {classProbabilities.map((entry) => (
                    <div key={entry.label} className="rounded-lg border theme-border p-3">
                      <div className="flex items-center justify-between gap-3 text-xs theme-muted">
                        <span>{entry.label}</span>
                        <span>{entry.probability.toFixed(2)}%</span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_18%,transparent)]">
                        <div
                          className={`h-full ${getToneBarClass(getProbabilityTone(entry.probability))}`}
                          style={{
                            width: `${Math.min(Math.max(entry.probability, 0), 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : suspiciousSentences.length === 0 ? (
              <div className="rounded-lg border border-dashed theme-border p-3 text-sm theme-muted">
                No highly suspicious sentence sections were detected in this submission.
              </div>
            ) : (
              <div className="space-y-3">
                {suspiciousSentences.map((entry) => (
                  <div
                    key={`${entry.sentenceNumber}-${entry.aiSuspicionScore}`}
                    className="rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_94%,transparent)] p-3"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs theme-muted">
                      <span>Sentence {entry.sentenceNumber}</span>
                      <span>{entry.aiSuspicionScore.toFixed(2)}% suspicious</span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_18%,transparent)]">
                      <div
                        className={`h-full ${getToneBarClass(getProbabilityTone(entry.aiSuspicionScore))}`}
                        style={{
                          width: `${Math.min(Math.max(entry.aiSuspicionScore, 0), 100)}%`,
                        }}
                      />
                    </div>
                    <p className="mt-2 text-sm text-[var(--app-text)]">
                      {entry.sentence}
                    </p>
                    {entry.reasons.length > 0 && (
                      <p className="mt-1 text-xs theme-muted">
                        Signals: {entry.reasons.join(" | ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeView === "tokens" && (
          <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4">
            <div className="mb-3 flex items-center gap-2">
              {detectorType === "image" ? (
                <Image className="h-4 w-4 text-[var(--app-accent)]" />
              ) : (
                <FileText className="h-4 w-4 text-[var(--app-accent)]" />
              )}
              <p className="text-sm font-semibold text-[var(--app-text)]">
                {detectorType === "image" ? "Image technical profile" : "Token heatmap"}
              </p>
            </div>

            {detectorType === "image" ? (
              !imageProfile ? (
                <div className="rounded-lg border border-dashed theme-border p-3 text-sm theme-muted">
                  Image metadata was unavailable for this run.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(imageProfile).map(([key, value]) => (
                    <div key={key} className="rounded-lg border theme-border p-3">
                      <p className="text-xs uppercase tracking-wide theme-muted">{key}</p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--app-text)]">
                        {typeof value === "object" && value !== null
                          ? JSON.stringify(value)
                          : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              )
            ) : !hasHighlightedSegments(heatmapSegments) ? (
              <div className="rounded-lg border border-dashed theme-border p-3 text-sm theme-muted">
                No token or sentence segments crossed the heatmap review threshold for this run.
              </div>
            ) : (
              <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_94%,transparent)] p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--app-text)]">
                      Token Heatmap
                    </p>
                    <p className="text-xs theme-muted">
                      Highlight source: {heatmapSource}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full border theme-border px-2 py-1 text-[var(--app-text)]">
                      <span className="h-3 w-5 rounded bg-[var(--heatmap-human-bg)]" />
                      Green: Human-created
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border theme-border px-2 py-1 text-[var(--app-text)]">
                      <span className="h-3 w-5 rounded bg-[var(--heatmap-suspicious-bg)]" />
                      Orange: Suspicious / Unsure
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border theme-border px-2 py-1 text-[var(--app-text)]">
                      <span className="h-3 w-5 rounded bg-[var(--heatmap-ai-bg)]" />
                      Red: AI-generated
                    </span>
                  </div>
                </div>

                <div className="max-h-[420px] overflow-auto rounded-lg border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_94%,transparent)] p-4 text-sm leading-9 text-[var(--app-text)]">
                  {heatmapSegments.map((segment, index) =>
                    segment.score === null ? (
                      <span key={`${index}-${segment.text.slice(0, 8)}`}>
                        {segment.text}
                      </span>
                    ) : (
                      <mark
                        key={`${index}-${segment.text.slice(0, 8)}`}
                        title={
                          segment.title ??
                          `${getHeatmapLevel(segment.score)}: ${segment.score.toFixed(2)}%`
                        }
                        className={getHeatmapClassName(segment.score)}
                      >
                        {segment.text}
                      </mark>
                    ),
                  )}
                </div>

                <p className="mt-3 text-xs theme-muted">
                  Green spans are likely human-created, orange spans need review, and
                  red spans show high AI likelihood. Review highlighted text with the
                  assignment prompt and student context before making a decision.
                </p>
              </div>
            )}
          </div>
        )}

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
