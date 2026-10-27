import type { SubmissionAnalysisDetails } from "../services/classService";

export const confidenceCategory = (score: number | null): string => {
  if (score === null || !Number.isFinite(score)) return "Unavailable";
  if (score >= 85) return "Very High";
  if (score >= 72) return "High";
  if (score >= 60) return "Moderate";
  return "Low";
};

// Presentation bands only. The backend's frozen threshold remains authoritative.
export const segmentLevel = (probability: number): "low" | "moderate" | "high" => probability >= 0.7 ? "high" : probability >= 0.4 ? "moderate" : "low";

export type ScoredSegment = {
  segmentNumber: number; start: number; end: number; text: string;
  aiProbability: number; humanProbability: number; evaluatedTokens: number; truncated: boolean;
};
export type SegmentExplanation = {
  analyzedText: string; segments: ScoredSegment[]; availableSegments: number;
  segmentLimit: number; maxTokensPerSegment: number; limitations: string[];
  processingLimitReached: boolean;
};
export const parseSegmentExplanation = (details: SubmissionAnalysisDetails | null): SegmentExplanation | null => {
  if (details?.detectorType !== "text" || !details.segmentExplanation || typeof details.segmentExplanation !== "object") return null;
  const data = details.segmentExplanation as Record<string, unknown>;
  if (data.status !== "completed" || data.method !== "independent_sentence_probability" || typeof data.analyzedText !== "string" || !Array.isArray(data.segments)) return null;
  const text = data.analyzedText;
  let end = 0;
  const segments: ScoredSegment[] = [];
  for (const value of data.segments) {
    if (!value || typeof value !== "object") return null;
    const segment = value as ScoredSegment;
    if (segment.segmentNumber !== segments.length + 1 || !Number.isInteger(segment.start) || !Number.isInteger(segment.end) || segment.start < end || segment.end <= segment.start || segment.end > text.length || text.slice(segment.start, segment.end) !== segment.text ||
      ![segment.aiProbability, segment.humanProbability].every((p) => Number.isFinite(p) && p >= 0 && p <= 1) || Math.abs(segment.aiProbability + segment.humanProbability - 1) > 1e-5) return null;
    segments.push(segment); end = segment.end;
  }
  if (!Number.isInteger(data.availableSegments) || Number(data.availableSegments) < segments.length) return null;
  return { analyzedText: text, segments, availableSegments: Number(data.availableSegments), segmentLimit: Number(data.segmentLimit), maxTokensPerSegment: Number(data.maxTokensPerSegment), processingLimitReached: data.processingLimitReached === true, limitations: Array.isArray(data.limitations) ? data.limitations.map(String) : [] };
};
