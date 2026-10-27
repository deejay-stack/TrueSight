import assert from 'node:assert/strict';
import test from 'node:test';
import { authoritativeSubmission, toAnalysisResult, validatePrediction } from '../services/DetectionResult.js';
const raw = (ai = .9908859729766846, detectorType: 'text' | 'code' | 'image' = 'text') => ({ detectorType, predictedLabel: (detectorType === 'image' ? ai > .5 : ai >= (detectorType === 'text' ? .9913054109 : .54)) ? 'AI' as const : 'HUMAN' as const, aiProbability: ai, humanProbability: 1 - ai, aiPercentage: ai * 100, humanPercentage: (1 - ai) * 100, threshold: { text: .9913054109, code: .54, image: .5 }[detectorType], modelName: 'Fixture', status: 'completed' as const });
test('reproduced SE_ME score preserves the frozen decision and explicitly reports uncertainty', () => {
  const result = toAnalysisResult(raw());
  assert.equal(result.isAIGenerated, false); assert.match(String(result.details.decisionLabel), /Inconclusive/);
  assert.equal(result.details.finalPrediction, result.details.decisionLabel); assert.equal(result.aiProbability, raw().aiProbability * 100);
  assert.equal(result.aiProbability! + result.humanProbability!, 100); assert.ok(result.details.analysisId); assert.ok(result.details.modelVersion);
});
test('plain-language presentation uses the frozen decision and never a 50% replacement rule', () => {
  for (const [score, expected] of [[.1, 'Possibly Human-Created'], [.9, 'Inconclusive'], [.999, 'Possibly AI-Generated']] as const) {
    const result = toAnalysisResult(raw(score));
    assert.equal(result.details.decisionLabel, expected); assert.equal(result.aiProbability, score * 100);
    assert.equal(result.details.scoreKind, 'uncalibrated_model_scores');
    assert.doesNotMatch(String(result.details.message), /threshold|class 0|class 1/i);
    assert.equal((result.details.scoreCards as any[])[0].label, 'AI model score');
  }
  const saved = toAnalysisResult(raw());
  const current = authoritativeSubmission({ id: 1, analysis_details: { ...saved.details, decisionLabel: 'Below AI threshold', message: 'Threshold failed', scoreCards: [{ label: 'AI probability' }] } });
  assert.equal(current.analysis_details.decisionLabel, 'Inconclusive'); assert.doesNotMatch(current.analysis_details.message, /threshold/i);
});
test('invalid, reversed, non-complementary and conflicting model decisions fail closed', () => {
  for (const patch of [{ aiProbability: NaN }, { aiProbability: Infinity }, { aiProbability: 99 }, { humanProbability: .4 }, { predictedLabel: 'AI' }, { threshold: .5 }, { detectorType: 'other' }]) assert.throws(() => validatePrediction({ ...raw(), ...patch } as any));
  for (const type of ['text', 'code', 'image'] as const) for (const p of [0, .5, .54, .9913054109, 1]) assert.doesNotThrow(() => validatePrediction(raw(p, type)));
});
test('saved probabilities come from the same validated run, never stale scalar fields', () => {
  const details = { ...toAnalysisResult(raw()).details, submissionId: 4, submittedVersion: 2 };
  const row = { id: 4, submitted_version: 2, ai_probability: 1, is_ai_generated: true, teacher_score: 90, analysis_details: details };
  const canonical = authoritativeSubmission(row); assert.equal(canonical.ai_probability, raw().aiProbability * 100); assert.equal(canonical.is_ai_generated, false); assert.equal(canonical.teacher_score, 90);
  for (const patch of [{ id: 5 }, { submitted_version: 3 }, { analysis_details: { ...details, probabilities: { ai: 99, human: .01 } } }]) {
    const saved = authoritativeSubmission({ ...row, ...patch }); assert.equal(saved.ai_probability, null); assert.equal(saved.is_ai_generated, null); assert.equal(saved.teacher_score, 90); assert.equal(saved.analysis_details.analysisStatus, 'legacy_unverified');
  }
});
test('occlusion evidence with a different baseline or fabricated effect is withheld', () => {
  const r = raw(.8); const explanation = { status: 'completed', method: 'sentence_occlusion', baselineAiProbability: .8, analyzedText: 'Hello.', sentences: [{ sentenceNumber: 1, start: 0, end: 6, text: 'Hello.', maskedAiProbability: .7, impactPercentagePoints: 10 }] };
  assert.equal((toAnalysisResult({ ...r, textExplanation: explanation }).details.textExplanation as any).status, 'completed');
  for (const evidence of [{ ...explanation, baselineAiProbability: .9 }, { ...explanation, sentences: [{ ...explanation.sentences[0], impactPercentagePoints: 80 }] }]) {
    const result = toAnalysisResult({ ...r, textExplanation: evidence }); assert.equal((result.details.textExplanation as any).status, 'unavailable'); assert.equal(result.aiProbability, 80);
  }
});
