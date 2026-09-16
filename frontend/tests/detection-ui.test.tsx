import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MultiLevelAIDetectionPanel } from "../src/screens/teacher/components/MultiLevelAIDetectionPanel";
import { AIExplainabilityPanel } from "../src/screens/teacher/components/AIExplainabilityPanel";
import type { ClassSubmission } from "../src/services/classService";
import { toAnalysisResult, failedAnalysis } from "../../backend/services/DetectionResult";

// The standalone TSX test runner uses classic JSX for imported UI files.
Object.assign(globalThis, { React });

test("teacher cards display 98% AI, 2% human, and the returned HUMAN decision", () => {
  const result = toAnalysisResult({ detectorType: "text", predictedLabel: "HUMAN", aiProbability: 0.98,
    humanProbability: 0.02, aiPercentage: 98, humanPercentage: 2, threshold: 0.9913054109,
    modelName: "DeBERTa-v3-base V3", status: "completed" });
  const submission = { ...result, submissionType: "essay", contentText: "Test essay" } as unknown as ClassSubmission;
  const html = renderToStaticMarkup(<MultiLevelAIDetectionPanel submission={submission} details={result.details} />);
  assert.match(html, /98\.00%/);
  assert.match(html, /2\.00%/);
  assert.match(html, /Human-created/);
  assert.match(html, /99\.13054109%/);
  assert.match(html, /DeBERTa-v3-base V3/);
  assert.match(html, /Detector: text/);
  const explanations = renderToStaticMarkup(<AIExplainabilityPanel details={result.details} />);
  assert.match(explanations, /explanations are unavailable/);
  assert.doesNotMatch(explanations, /0%/);
});

test("failed analysis renders an unavailable message without fabricated score cards", () => {
  const result = failedAnalysis("text");
  const submission = { ...result, submissionType: "essay" } as unknown as ClassSubmission;
  const html = renderToStaticMarkup(<MultiLevelAIDetectionPanel submission={submission} details={result.details} />);
  assert.match(html, /AI detection temporarily unavailable/);
  assert.doesNotMatch(html, /0\.00%|100\.00%/);
});
