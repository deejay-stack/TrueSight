import { infer } from "./InferenceService.js";
import { toAnalysisResult } from "./DetectionResult.js";

// Preserve existing callers while using exactly one production text detector.
export const analyzeText = async (text: string) => {
  if (!text?.trim()) throw new Error("Written content must not be empty.");
  return toAnalysisResult(await infer("text", { text }));
};
