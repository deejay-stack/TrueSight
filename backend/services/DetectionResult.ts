import type { DetectorType, ModelResult } from "./InferenceService.js";

export type AnalysisResult = {
  aiProbability: number | null;
  humanProbability: number | null;
  confidenceScore: number | null;
  isAIGenerated: boolean | null;
  details: Record<string, unknown>;
};

// The existing DB/UI uses percentages. Preserve that contract at this boundary.
export const toAnalysisResult = (result: ModelResult): AnalysisResult => {
  const aiProbability = Number((result.aiProbability * 100).toFixed(2));
  const humanProbability = Number((result.humanProbability * 100).toFixed(2));
  const isAIGenerated = result.predictedLabel === "AI";
  const confidenceScore = Math.max(aiProbability, humanProbability);
  const verdict = isAIGenerated ? "Likely AI-generated" : "Likely human-created";
  return {
    aiProbability, humanProbability, confidenceScore, isAIGenerated,
    details: {
      detectorType: result.detectorType, modelName: result.modelName, provider: result.modelName,
      source: `local-${result.detectorType}-model`, status: "completed", analysisStatus: "completed",
      predictedLabel: result.predictedLabel, verdict, finalPrediction: isAIGenerated ? "AI-generated" : "Human",
      threshold: result.threshold, aiProbability, humanProbability, confidenceScore,
      probabilities: { ai: result.aiProbability, human: result.humanProbability },
      aiPercentage: aiProbability, humanPercentage: humanProbability,
      message: "Probabilities are guidance for teacher review, not proof of academic misconduct.",
      scoreCards: [
        { id: "aiProbability", label: "AI probability", value: aiProbability, unit: "%", tone: isAIGenerated ? "risk" : "calm" },
        { id: "humanProbability", label: "Human probability", value: humanProbability, unit: "%", tone: isAIGenerated ? "risk" : "calm" },
      ],
      integrationStatus: { providerConfigured: true, liveProviderUsed: true, fallbackUsed: false, message: "Local model inference completed." },
      reviewChecklist: [{ label: "Compare the submission with drafts, sources, and classroom work", status: "recommended" }],
    },
  };
};

export const failedAnalysis = (detectorType?: DetectorType): AnalysisResult => ({
  aiProbability: null, humanProbability: null, confidenceScore: null, isAIGenerated: null,
  details: {
    detectorType, status: "failed", analysisStatus: "failed", verdict: "Analysis unavailable",
    finalPrediction: "Analysis unavailable", message: "AI detection temporarily unavailable.",
    integrationStatus: { liveProviderUsed: false, fallbackUsed: false },
  },
});
