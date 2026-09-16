import { AlertTriangle, ArrowRight, Check, WandSparkles } from "lucide-react";
import { Card, CardContent } from "../../../components/ui/Card";
import type {
  ExplainabilitySignal,
  SubmissionAnalysisDetails,
} from "../services/teacherClassroomService";

type AIExplainabilityPanelProps = {
  details: SubmissionAnalysisDetails | null;
};

type RequiredSignal = {
  id: string;
  label: string;
  fallbackExplanation: string;
};

const REQUIRED_SIGNALS: RequiredSignal[] = [
  {
    id: "repetitivePhrasing",
    label: "Repetitive phrasing",
    fallbackExplanation:
      "Vocabulary reuse and repeated expressions can be generated-text indicators.",
  },
  {
    id: "roboticStructure",
    label: "Robotic structure",
    fallbackExplanation:
      "Very uniform sentence form and length can indicate machine-like structure.",
  },
  {
    id: "unnaturalTransitions",
    label: "Unnatural transitions",
    fallbackExplanation:
      "Abrupt or template-like flow between ideas can signal generated writing.",
  },
  {
    id: "overPerfectGrammar",
    label: "Over-perfect grammar",
    fallbackExplanation:
      "Exceptionally polished grammar with limited natural variation may be suspicious.",
  },
];

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const parseSignals = (value: unknown): ExplainabilitySignal[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const candidate = item as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id : null;
      const label = typeof candidate.label === "string" ? candidate.label : null;
      const score = asNumber(candidate.score);
      const explanation =
        typeof candidate.explanation === "string" ? candidate.explanation : null;

      if (!id || !label || score === null || !explanation) {
        return null;
      }

      return {
        id,
        label,
        score,
        explanation,
      };
    })
    .filter((item): item is ExplainabilitySignal => item !== null);
};

const getTone = (score: number): string => {
  if (score >= 75) {
    return "bg-[var(--heatmap-ai-bg)] text-[var(--heatmap-ai-text)]";
  }

  if (score >= 50) {
    return "bg-[var(--heatmap-suspicious-bg)] text-[var(--heatmap-suspicious-text)]";
  }

  return "bg-[var(--heatmap-human-bg)] text-[var(--heatmap-human-text)]";
};

const getBarTone = (score: number): string => {
  if (score >= 75) {
    return "bg-rose-500";
  }

  if (score >= 50) {
    return "bg-amber-500";
  }

  return "bg-emerald-500";
};

export function AIExplainabilityPanel({ details }: AIExplainabilityPanelProps) {
  const parsedSignals = parseSignals(details?.explainabilitySignals);
  if ((typeof details?.modelName === "string" || details?.analysisStatus === "failed") && parsedSignals.length === 0) {
    return (
      <Card className="theme-card">
        <CardContent className="space-y-2 p-5">
          <h3 className="text-lg font-semibold text-[var(--app-text)]">AI Explainability</h3>
          <p className="text-sm theme-muted">
            Sentence, token, and writing-style explanations are unavailable for this analysis.
          </p>
        </CardContent>
      </Card>
    );
  }
  const signalById = new Map(parsedSignals.map((signal) => [signal.id, signal]));

  const mergedSignals = REQUIRED_SIGNALS.map((required) => {
    const existing = signalById.get(required.id);

    if (existing) {
      return existing;
    }

    return {
      id: required.id,
      label: required.label,
      score: 0,
      explanation: required.fallbackExplanation,
    };
  });

  const reasons = Array.isArray(details?.reasons)
    ? details.reasons.map((reason) => String(reason))
    : [];

  return (
    <Card className="theme-card">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[var(--app-text)]">AI Explainability</h3>
            <p className="text-sm theme-muted">
              Signal-based reasoning that explains why this output was flagged.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--app-accent)_16%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--app-accent)]">
            <WandSparkles className="h-3.5 w-3.5" />
            Explainability Panel
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {mergedSignals.map((signal) => (
            <div
              key={signal.id}
              className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[var(--app-text)]">{signal.label}</p>
                  <p className="mt-1 text-xs theme-muted">{signal.explanation}</p>
                </div>
                <span
                  className={[
                    "rounded-full px-2 py-1 text-xs font-semibold",
                    getTone(signal.score),
                  ].join(" ")}
                >
                  {signal.score.toFixed(0)}%
                </span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_16%,transparent)]">
                <div
                  className={`h-full ${getBarTone(signal.score)}`}
                  style={{
                    width: `${Math.min(Math.max(signal.score, 0), 100)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-4">
          <div className="mb-2 flex items-center gap-2">
            {reasons.length > 0 ? (
              <AlertTriangle className="h-4 w-4 text-amber-300" />
            ) : (
              <Check className="h-4 w-4 text-emerald-300" />
            )}
            <p className="text-sm font-semibold text-[var(--app-text)]">Model rationale</p>
          </div>

          {reasons.length === 0 ? (
            <p className="text-sm theme-muted">
              No additional rationale was returned for this analysis run.
            </p>
          ) : (
            <div className="space-y-2">
              {reasons.map((reason, index) => (
                <div key={`reason-${index}`} className="flex items-start gap-2 text-sm">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-[var(--app-accent)]" />
                  <span className="text-[var(--app-text)]">{reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
