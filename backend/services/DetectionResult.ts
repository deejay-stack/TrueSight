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
  const thresholdPercent = (result.threshold * 100).toFixed(result.detectorType === "text" ? 8 : 2);
  const comparison = result.detectorType === "image" ? "greater than" : "greater than or equal to";
  const reasons = [
    `${result.modelName} returned ${(result.aiProbability * 100).toFixed(6)}% AI probability and ${(result.humanProbability * 100).toFixed(6)}% human probability.`,
    `The frozen rule is AI when its unrounded probability is ${comparison} ${thresholdPercent}%. This submission ${isAIGenerated ? "meets" : "does not meet"} that rule, so its result is ${result.predictedLabel}.`,
    result.detectorType === "text"
      ? "DeBERTa evaluates up to 512 tokens, including special tokens. Sentence masking measures changes within that same context; it does not replace the original prediction."
      : result.detectorType === "code"
        ? "The CodeT5 tokenizer encodes up to 512 tokens. The trained bidirectional LSTM evaluates that sequence and a sigmoid converts its output to the AI score. This model does not identify which lines were authored by AI."
        : "EfficientNetV2L evaluates the image after RGB conversion, 224×224 resizing, and the training rescale. Its single sigmoid output supplies the AI probability; it does not identify AI-generated image regions.",
    "Confidence is the larger of the two model probabilities, not a separately measured probability that the verdict is correct. Review drafts, references, and the student's explanation alongside this result.",
  ];
  return {
    aiProbability, humanProbability, confidenceScore, isAIGenerated,
    details: {
      detectorType: result.detectorType, modelName: result.modelName, provider: result.modelName,
      source: `local-${result.detectorType}-model`, status: "completed", analysisStatus: "completed",
      predictedLabel: result.predictedLabel, verdict, finalPrediction: isAIGenerated ? "AI-generated" : "Human",
      threshold: result.threshold, aiProbability, humanProbability, confidenceScore,
      probabilities: { ai: result.aiProbability, human: result.humanProbability },
      aiPercentage: aiProbability, humanPercentage: humanProbability,
      reasons,
      ...(result.detectorType === "text" && result.textExplanation ? { textExplanation: result.textExplanation } : {}),
      analysisTimeline: [
        { label: "Local model inference", status: "complete", detail: result.modelName },
        { label: "Frozen decision rule", status: "complete", detail: `AI probability ${comparison} ${thresholdPercent}%; returned ${result.predictedLabel}.` },
      ],
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
