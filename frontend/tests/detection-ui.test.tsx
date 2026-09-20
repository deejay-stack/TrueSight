import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MultiLevelAIDetectionPanel } from "../src/screens/teacher/components/MultiLevelAIDetectionPanel";
import { AIExplainabilityPanel } from "../src/screens/teacher/components/AIExplainabilityPanel";
import { TextEvidencePanel } from "../src/screens/teacher/components/TextEvidencePanel";
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
  assert.match(explanations, /does not meet/);
  assert.match(explanations, /99\.13054109%/);
  assert.doesNotMatch(explanations, /Repetitive phrasing|Over-perfect grammar/);
});

test("sentence heatmap handles Unicode, signed impact, and duplicate passages", () => {
  const text = "🙂 Hello. Hello.";
  const explanation = {
    status: "completed", method: "sentence_occlusion", analyzedText: text,
    sentences: [
      { sentenceNumber: 1, start: 0, end: 9, text: "🙂 Hello.", impactPercentagePoints: 12, maskedAiProbability: 0.86 },
      { sentenceNumber: 2, start: 10, end: 16, text: "Hello.", impactPercentagePoints: -1, maskedAiProbability: 0.99 },
    ], evaluatedTokens: 9, availableSentences: 2, truncated: true,
    summary: "Sentence masking", limitations: ["Not proof of authorship."],
  };
  const html = renderToStaticMarkup(<TextEvidencePanel details={{ detectorType: "text", textExplanation: explanation }} />);
  assert.match(html, /heatmap-impact-strong/);
  assert.match(html, /heatmap-impact-negative/);
  assert.match(html, /86\.0000%/);
  assert.match(html, /only the evaluated excerpt/);
  assert.match(html, /not proof/);
  const invalid = { ...explanation, sentences: [{ ...explanation.sentences[0], start: 1 }] };
  const unavailable = renderToStaticMarkup(<TextEvidencePanel details={{ detectorType: "text", textExplanation: invalid }} />);
  assert.match(unavailable, /Sentence evidence is unavailable/);
  assert.doesNotMatch(unavailable, /heatmap-passage/);
});

test("older results request reanalysis without inventing highlights", () => {
  const html = renderToStaticMarkup(<TextEvidencePanel details={{ detectorType: "text" }} />);
  assert.match(html, /Run Analyze submission again/);
  assert.doesNotMatch(html, /heatmap-passage/);
});

test("failed analysis renders an unavailable message without fabricated score cards", () => {
  const result = failedAnalysis("text");
  const submission = { ...result, submissionType: "essay" } as unknown as ClassSubmission;
  const html = renderToStaticMarkup(<MultiLevelAIDetectionPanel submission={submission} details={result.details} />);
  assert.match(html, /AI detection temporarily unavailable/);
  assert.doesNotMatch(html, /0\.00%|100\.00%/);
});
