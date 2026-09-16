import assert from "node:assert/strict";
import test from "node:test";
import { detectorForSubmissionType, analyzeSubmissionContent } from "../services/DetectorRouter.js";
import { toAnalysisResult } from "../services/DetectionResult.js";

test("assignment type determines the sole detector", () => {
  assert.equal(detectorForSubmissionType("essay"), "text");
  assert.equal(detectorForSubmissionType("file"), "text");
  assert.equal(detectorForSubmissionType("code"), "code");
  assert.equal(detectorForSubmissionType("image"), "image");
  assert.throws(() => detectorForSubmissionType("txt"));
  assert.throws(() => detectorForSubmissionType("unknown"));
});

test("98% AI probability preserves the text model's HUMAN decision", () => {
  const result = toAnalysisResult({ detectorType: "text", predictedLabel: "HUMAN", aiProbability: 0.98,
    humanProbability: 0.02, aiPercentage: 98, humanPercentage: 2, threshold: 0.9913054109,
    modelName: "DeBERTa-v3-base V3", status: "completed" });
  assert.equal(result.aiProbability, 98);
  assert.equal(result.humanProbability, 2);
  assert.equal(result.isAIGenerated, false);
  assert.equal(result.details.predictedLabel, "HUMAN");
  assert.deepEqual(result.details.probabilities, { ai: 0.98, human: 0.02 });
});

test("routing never falls back to file metadata for an unknown assignment", async () => {
  const result = await analyzeSubmissionContent({ submission_type: "unknown", file_name: "photo.png", file_type: "image/png" });
  assert.equal(result.details.analysisStatus, "failed");
  assert.equal(result.aiProbability, null);
  assert.equal(result.isAIGenerated, null);
});

test("empty written content fails without fabricated probabilities", async () => {
  const result = await analyzeSubmissionContent({ submission_type: "essay", content_text: "   " });
  assert.equal(result.details.analysisStatus, "failed");
  assert.equal(result.humanProbability, null);
});
