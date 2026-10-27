import type { DetectorType, ModelResult } from "./InferenceService.js";
import { randomUUID } from 'node:crypto';

export const FROZEN_THRESHOLDS = { text: 0.9913054109, code: 0.54, image: 0.5 };
export function validatePrediction(result: ModelResult) {
  const threshold = FROZEN_THRESHOLDS[result.detectorType];
  if (threshold === undefined || result.threshold !== threshold || ![result.aiProbability, result.humanProbability].every(p => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1) || Math.abs(result.aiProbability + result.humanProbability - 1) > 1e-5) throw new Error('Invalid inference probabilities or decision policy.');
  const expected = (result.detectorType === 'image' ? result.aiProbability > threshold : result.aiProbability >= threshold) ? 'AI' : 'HUMAN';
  if (result.predictedLabel !== expected) throw new Error('Inference label does not match its full-precision score and frozen threshold.');
}

function textEvidence(result: ModelResult) {
  const evidence = result.textExplanation as any;
  if (!evidence || evidence.status !== 'completed') return evidence;
  let previous = 0;
  if (evidence.method !== 'sentence_occlusion' || typeof evidence.analyzedText !== 'string' || !Array.isArray(evidence.sentences) || !Number.isFinite(evidence.baselineAiProbability) || Math.abs(evidence.baselineAiProbability - result.aiProbability) > 1e-7 || evidence.sentences.some((sentence: any, index: number) => {
    if (!sentence || typeof sentence !== 'object') return true;
    const invalid = sentence.sentenceNumber !== index + 1 || !Number.isInteger(sentence.start) || !Number.isInteger(sentence.end) || sentence.start < previous || sentence.end <= sentence.start || sentence.end > evidence.analyzedText.length || evidence.analyzedText.slice(sentence.start, sentence.end) !== sentence.text || !Number.isFinite(sentence.maskedAiProbability) || sentence.maskedAiProbability < 0 || sentence.maskedAiProbability > 1 || !Number.isFinite(sentence.impactPercentagePoints) || Math.abs((result.aiProbability - sentence.maskedAiProbability) * 100 - sentence.impactPercentagePoints) > 0.0001;
    previous = sentence.end; return invalid;
  })) return { status: 'unavailable', message: 'Sentence evidence failed consistency validation. Reanalyze to retry; the original document prediction is unchanged.' };
  return evidence;
}

export type AnalysisResult = {
  aiProbability: number | null;
  humanProbability: number | null;
  confidenceScore: number | null;
  isAIGenerated: boolean | null;
  details: Record<string, unknown>;
};

export function predictionPresentation(result: Pick<ModelResult, 'predictedLabel' | 'aiProbability' | 'humanProbability'>) {
  const decisionTone = result.predictedLabel === 'AI' ? 'ai' : result.aiProbability >= result.humanProbability ? 'uncertain' : 'human';
  const decisionLabel = decisionTone === 'ai' ? 'Possibly AI-Generated' : decisionTone === 'human' ? 'Possibly Human-Created' : 'Inconclusive';
  const interpretation = decisionTone === 'ai' ? 'The detector found indications associated with AI-generated content. Review this estimate together with the supporting evidence.' : decisionTone === 'human' ? 'The detector found stronger indications of human-created content. This estimate does not independently verify authorship.' : 'The detector gives conflicting indications and cannot support a clear authorship prediction. Review the original work, drafts, and supporting evidence.';
  return { decisionTone, decisionLabel, verdict: decisionLabel, finalPrediction: decisionLabel, interpretation, message: interpretation,
    scoreKind: 'uncalibrated_model_scores',
    scoreCards: [
      { id: 'aiProbability', label: 'AI model score', value: result.aiProbability * 100, unit: '%', tone: decisionTone === 'ai' ? 'risk' : decisionTone === 'human' ? 'calm' : 'warning' },
      { id: 'humanProbability', label: 'Human model score', value: result.humanProbability * 100, unit: '%', tone: decisionTone === 'ai' ? 'risk' : decisionTone === 'human' ? 'calm' : 'warning' },
    ] };
}

// The existing DB/UI uses percentages. Preserve that contract at this boundary.
export const toAnalysisResult = (result: ModelResult): AnalysisResult => {
  validatePrediction(result);
  const aiProbability = result.aiProbability * 100;
  const humanProbability = result.humanProbability * 100;
  const isAIGenerated = result.predictedLabel === "AI";
  const confidenceScore = Math.max(aiProbability, humanProbability);
  const verdict = predictionPresentation(result).decisionLabel;
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
      analysisId: randomUUID(), analyzedAt: new Date().toISOString(), modelVersion: result.modelVersion ?? `${result.modelName}: frozen production configuration`,
      decisionLabel: verdict, decisionRule: result.detectorType === 'image' ? 'AI if pAI > threshold' : 'AI if pAI >= threshold',
      calibration: { status: 'not_calibrated_in_this_application', note: 'Softmax/sigmoid scores are not verified authorship frequencies. Below-threshold is not proof of human authorship.' },
      detectorType: result.detectorType, modelName: result.modelName, provider: result.modelName,
      source: `local-${result.detectorType}-model`, status: "completed", analysisStatus: "completed",
      predictedLabel: result.predictedLabel, verdict, finalPrediction: verdict,
      threshold: result.threshold, aiProbability, humanProbability, confidenceScore,
      probabilities: { ai: result.aiProbability, human: result.humanProbability },
      rawOutput: result.rawOutput ?? null,
      classMapping: result.detectorType === 'text' ? { '0': 'HUMAN', '1': 'AI' } : { output: 'AI', human: '1 - pAI' },
      outputTransform: result.detectorType === 'text' ? 'softmax over HUMAN, AI logits' : result.detectorType === 'code' ? 'sigmoid of one AI logit' : 'model sigmoid output is pAI',
      tokenizerFingerprint: result.tokenizerFingerprint ?? null,
      aiPercentage: aiProbability, humanPercentage: humanProbability,
      reasons,
      ...(result.detectorType === "text" && result.textExplanation ? { textExplanation: textEvidence(result) } : {}),
      ...(result.detectorType === "text" && result.segmentExplanation ? { segmentExplanation: result.segmentExplanation } : {}),
      analysisTimeline: [
        { label: "Local model inference", status: "complete", detail: result.modelName },
        { label: "Frozen decision rule", status: "complete", detail: `AI probability ${comparison} ${thresholdPercent}%; returned ${result.predictedLabel}.` },
      ],
      technicalNote: result.predictedLabel === 'HUMAN' && result.aiProbability > result.humanProbability ? 'The AI score is below the frozen decision threshold despite being the larger class score.' : 'The full-precision score and frozen rule agree with the returned class.',
      ...predictionPresentation(result),
      integrationStatus: { providerConfigured: true, liveProviderUsed: true, fallbackUsed: false, message: "Local model inference completed." },
      reviewChecklist: [{ label: "Compare the submission with drafts, sources, and classroom work", status: "recommended" }],
    },
  };
};

export const failedAnalysis = (detectorType?: DetectorType): AnalysisResult => ({
  aiProbability: null, humanProbability: null, confidenceScore: null, isAIGenerated: null,
  details: {
    analysisId: randomUUID(), analyzedAt: new Date().toISOString(), decisionLabel: 'Analysis unavailable',
    detectorType, status: "failed", analysisStatus: "failed", verdict: "Analysis unavailable",
    finalPrediction: "Analysis unavailable", message: "AI detection temporarily unavailable.",
    integrationStatus: { liveProviderUsed: false, fallbackUsed: false },
  },
});

/** Read-time normalization only: preserve stored records and grades, never mix legacy scalar fields with another run. */
export function authoritativeSubmission(row: any) {
  if (!row) return row;
  const d = row.analysis_details;
  if (!d || d.analysisStatus !== 'completed') return { ...row, ai_probability: null, is_ai_generated: null, analysis_details: d };
  try {
    const submissionId = row.submission_id ?? row.id;
    if ((d.submissionId !== undefined && submissionId !== undefined && Number(d.submissionId) !== Number(submissionId)) || (d.submittedVersion !== undefined && row.submitted_version !== undefined && Number(d.submittedVersion) !== Number(row.submitted_version))) throw new Error('Saved analysis belongs to another submission or version.');
    const result = { detectorType: d.detectorType, predictedLabel: d.predictedLabel, aiProbability: d.probabilities?.ai, humanProbability: d.probabilities?.human, threshold: d.threshold, modelName: d.modelName, status: 'completed' } as ModelResult;
    validatePrediction(result);
    return { ...row, ai_probability: result.aiProbability * 100, is_ai_generated: result.predictedLabel === 'AI', analysis_details: { ...d, ...predictionPresentation(result), aiProbability: result.aiProbability * 100, humanProbability: result.humanProbability * 100, confidenceScore: Math.max(result.aiProbability, result.humanProbability) * 100 } };
  } catch { return { ...row, ai_probability: null, is_ai_generated: null, analysis_details: { analysisStatus: 'legacy_unverified', decisionLabel: 'Saved result needs reanalysis', message: 'Stored prediction fields do not satisfy the current model contract. Reanalyze this submission; historical grades are unchanged.' } }; }
}
