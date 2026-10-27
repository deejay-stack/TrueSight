import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MultiLevelAIDetectionPanel } from "../src/screens/teacher/components/MultiLevelAIDetectionPanel";
import { AIExplainabilityPanel } from "../src/screens/teacher/components/AIExplainabilityPanel";
import { TextEvidencePanel } from "../src/screens/teacher/components/TextEvidencePanel";
import type { ClassSubmission } from "../src/services/classService";
import { toAnalysisResult, failedAnalysis } from "../../backend/services/DetectionResult";
import { AnalysisSummary } from "../src/screens/teacher/components/AnalysisSummary";
import { parseSegmentExplanation, confidenceCategory, segmentLevel } from "../src/utils/analysisPresentation";
import { previewKind, readPreviewBytes } from "../src/utils/filePreview";

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
  assert.match(html, /Inconclusive/);
  assert.doesNotMatch(html, /Human-created|Tokens|Sentences|Token Heatmap/);
  assert.match(html, /AI model score/); assert.doesNotMatch(html, /Very High confidence/);
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
  const html = renderToStaticMarkup(<TextEvidencePanel details={{ detectorType: "text", analysisStatus: "completed", probabilities: { ai: .98, human: .02 }, textExplanation: explanation }} />);
  assert.match(html, /heatmap-impact-strong/);
  assert.match(html, /heatmap-impact-negative/);
  assert.match(html, /86\.0000%/);
  assert.match(html, /only the evaluated excerpt/);
  assert.match(html, /do not independently prove/);
  const invalid = { ...explanation, sentences: [{ ...explanation.sentences[0], start: 1 }] };
  const unavailable = renderToStaticMarkup(<TextEvidencePanel details={{ detectorType: "text", analysisStatus: "completed", probabilities: { ai: .98, human: .02 }, textExplanation: invalid }} />);
  assert.match(unavailable, /Sentence evidence is unavailable/);
  assert.doesNotMatch(unavailable, /heatmap-passage/);
  for (const badEvidence of [{ ...explanation, baselineAiProbability: .5 }, { ...explanation, sentences: [{ ...explanation.sentences[0], impactPercentagePoints: 80 }] }]) {
    const inconsistent = renderToStaticMarkup(<TextEvidencePanel details={{ detectorType: 'text', analysisStatus: 'completed', probabilities: { ai: .98, human: .02 }, textExplanation: badEvidence }} />);
    assert.match(inconsistent, /Sentence evidence is unavailable/); assert.doesNotMatch(inconsistent, /heatmap-passage/);
  }
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

test("redundant segment heatmap is hidden while evidence data and the HUMAN verdict remain", () => {
  const text = "🙂 A meaningful sentence. Another meaningful sentence.";
  const boundary = text.indexOf(" Another");
  const details = { detectorType: "text", decisionLabel: "Inconclusive", analysisStatus: "completed", modelName: "DeBERTa-v3-base V3", predictedLabel: "HUMAN", threshold: .9913054109, probabilities: { ai: .98, human: .02 },
    segmentExplanation: { status: "completed", method: "independent_sentence_probability", analyzedText: text, availableSegments: 2, segmentLimit: 24, maxTokensPerSegment: 512, limitations: [], segments: [
      { segmentNumber: 1, start: 0, end: boundary, text: text.slice(0, boundary), aiProbability: .95, humanProbability: .05, evaluatedTokens: 8, truncated: false },
      { segmentNumber: 2, start: boundary + 1, end: text.length, text: text.slice(boundary + 1), aiProbability: .2, humanProbability: .8, evaluatedTokens: 8, truncated: false },
    ] } };
  assert.equal(parseSegmentExplanation(details)?.segments.length, 2);
  const html = renderToStaticMarkup(<TextEvidencePanel details={details} />);
  assert.doesNotMatch(html, /Content-level indicators|segment-heatmap-text|heatmap-token-ai/);
  assert.match(html, /Advanced evidence: sentence occlusion/);
  const submission = { aiProbability: 98, humanProbability: 2, confidenceScore: 98, isAIGenerated: false, analysisDetails: details, submissionType: "file" } as unknown as ClassSubmission;
  const summary = renderToStaticMarkup(<AnalysisSummary submission={submission} />);
  assert.match(summary, /Inconclusive/);
  assert.match(summary, /98\.00%/);
  assert.doesNotMatch(summary, /Classified as human-created/);
  const invalid = { ...details, segmentExplanation: { ...details.segmentExplanation, segments: [{ ...details.segmentExplanation.segments[0], end: 3 }] } };
  assert.equal(parseSegmentExplanation(invalid), null);
  assert.equal(segmentLevel(.4), "moderate"); assert.equal(segmentLevel(.7), "high");
  assert.equal(confidenceCategory(null), "Unavailable");
});

test("file preview classifies safely and preserves literal bytes", () => {
  assert.equal(previewKind({ fileName: "report.docx" }), "docx");
  assert.equal(previewKind({ fileName: "report.pdf" }), "pdf");
  assert.equal(previewKind({ fileName: "report.doc", dataUrl: "data:application/msword;base64,AA==" }), "unsupported");
  assert.equal(previewKind({ fileName: "main.py" }), "code");
  assert.equal(previewKind({ fileName: "essay", code: true, language: "Python" }), "code");
  assert.equal(previewKind({ fileName: "unknown", fileType: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,AA==" }), "unsupported");
  assert.equal(new TextDecoder().decode(readPreviewBytes("data:text/plain;base64,SGVsbG8K")), "Hello\n");
  assert.throws(() => readPreviewBytes("https://example.invalid/private"));
});
