// Run after npm run build: node tests/evaluate-documents.mjs manifest.json output.json
// Ground truth must be supplied by the author, never inferred from filenames/scores.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractTextFromSubmissionFile } from '../dist/services/FileTextExtractor.js';
import { infer, stopInferenceWorker } from '../dist/services/InferenceService.js';
import { toAnalysisResult } from '../dist/services/DetectionResult.js';
import { evaluationMetrics } from './evaluation-metrics.mjs';

const [manifestPath, outputPath] = process.argv.slice(2);
if (!manifestPath || !outputPath) throw Error('Provide a manifest JSON array and output JSON path.');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const results = [];
try {
  for (const sample of manifest) {
    if (!sample.provenance || !['human', 'ai', 'mixed', 'unknown'].includes(sample.authorship)) throw Error('Each sample requires authorship and provenance.');
    const bytes = await fs.readFile(sample.path);
    const text = await extractTextFromSubmissionFile({ fileName: sample.path, fileDataUrl: bytes.toString('base64') });
    const raw = await infer('text', { text });
    const analysis = toAnalysisResult(raw);
    const explanation = raw.textExplanation;
    const entry = { sample: path.basename(sample.path), authorship: sample.authorship, provenance: sample.provenance,
      sha256: createHash('sha256').update(bytes).digest('hex'), extractedTextSha256: createHash('sha256').update(text).digest('hex'),
      characters: text.length, words: text.split(/\s+/u).filter(Boolean).length,
      ...analysis, details: { ...analysis.details, textExplanation: explanation ? { ...explanation, analyzedText: undefined, sentences: explanation.sentences?.map(({ text, ...rest }) => rest) } : null, segmentExplanation: undefined } };
    results.push(entry);
    console.log(JSON.stringify({ sample: entry.sample, aiProbability: entry.aiProbability, rawLabel: raw.predictedLabel, decision: analysis.details.decisionLabel, words: entry.words, truncated: explanation?.truncated }));
    await fs.writeFile(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), threshold: raw.threshold, results, metrics: evaluationMetrics(results) }, null, 2));
  }
} finally { stopInferenceWorker(); }
