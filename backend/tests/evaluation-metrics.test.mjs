import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluationMetrics } from './evaluation-metrics.mjs';
test('metrics include actual confusion counts, ranking and calibration without labelling unknown samples', () => {
  const metric = evaluationMetrics([{ authorship: 'human', aiProbability: 10, isAIGenerated: false }, { authorship: 'human', aiProbability: 90, isAIGenerated: true }, { authorship: 'ai', aiProbability: 80, isAIGenerated: true }, { authorship: 'ai', aiProbability: 20, isAIGenerated: false }, { authorship: 'unknown', aiProbability: 99, isAIGenerated: true }]);
  assert.deepEqual(metric.confusionMatrix, { tn: 1, fp: 1, fn: 1, tp: 1 }); assert.equal(metric.accuracy, .5); assert.equal(metric.precision, .5); assert.equal(metric.recall, .5); assert.equal(metric.f1, .5); assert.equal(metric.falsePositiveRate, .5); assert.equal(metric.falseNegativeRate, .5); assert.equal(metric.rocAuc, .5); assert.equal(metric.excluded, 1); assert.ok(Math.abs(metric.calibration.brierScore - .375) < 1e-10);
});
test('missing classes and unavailable predictions never become perfect scores', () => {
  assert.equal(evaluationMetrics([{ authorship: 'unknown' }]).sampleSize, 0);
  const result = evaluationMetrics([{ authorship: 'human', aiProbability: 20, isAIGenerated: false }, { authorship: 'ai', aiProbability: null, isAIGenerated: null }]);
  assert.equal(result.precision, null); assert.equal(result.rocAuc, null); assert.equal(result.failedOrMissingPredictions, 1);
});
