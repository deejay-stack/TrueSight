import { analyzeText } from "./TextService.js";
import { analyzeImage } from "./ImageService.js";
import { extractTextFromSubmissionFile } from "./FileTextExtractor.js";
import { infer, type DetectorType } from "./InferenceService.js";
import { failedAnalysis, toAnalysisResult } from "./DetectionResult.js";

export const detectorForSubmissionType = (submissionType: string): DetectorType => {
  switch (submissionType) {
    case "essay": case "file": return "text";
    case "code": return "code";
    case "image": return "image";
    default: throw new Error("Unsupported assignment submission type.");
  }
};

type Submission = { submission_type: string; content_text?: string; file_name?: string; file_type?: string; file_data_url?: string };

export const analyzeSubmissionContent = async (submission: Submission) => {
  let detectorType: DetectorType | undefined;
  try {
    detectorType = detectorForSubmissionType(submission.submission_type);
    if (detectorType === "image") return await analyzeImage(submission.file_data_url, submission.file_name);
    if (detectorType === "code") return toAnalysisResult(await infer("code", { text: submission.content_text }));
    const text = submission.submission_type === "essay" ? submission.content_text ?? "" :
      await extractTextFromSubmissionFile({ fileName: submission.file_name, fileType: submission.file_type, fileDataUrl: submission.file_data_url });
    return await analyzeText(text);
  } catch (error) {
    console.error(`[ai-analysis] detector=${detectorType ?? "unsupported"} failed`, error instanceof Error ? error.message : error);
    return failedAnalysis(detectorType);
  }
};
