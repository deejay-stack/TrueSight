import assert from 'node:assert/strict';
import test from 'node:test';
import { assessContent, assessSubmission, rubric, scoringEnabled } from '../services/LmsGrading.js';

const context = { enabled: true, analyzed: true, submissionType: 'essay', submissionId: 1, submittedVersion: 2, detectorType: 'text', analysisStatus: 'completed' };
const requirements = { id: 'requirements', title: 'Instruction requirements', description: 'Explicit checks', maxPoints: 30, aiEnabled: true, assessment: { minimumWords: 6, minimumParagraphs: 2, requiredPhrases: ['photosynthesis'] } };

test('empty rows are ignored, active rows validated, and AI configuration persists', () => {
  const saved = rubric([requirements, { id: 'empty', title: '', description: '', maxPoints: 0, aiEnabled: true }]);
  assert.deepEqual(saved, [requirements]);
  assert.deepEqual(rubric([{ id: 'cleared', title: '', description: '', maxPoints: 0, aiEnabled: true, assessment: { requiredPhrases: [] } }]), []);
  assert.throws(() => rubric([{ ...requirements, maxPoints: -1 }]));
  assert.throws(() => rubric([{ ...requirements, assessment: { minimumWords: -1 } }]));
  assert.throws(() => rubric([{ ...requirements, assessment: { requiredPhrases: [''] } }]));
  assert.throws(() => rubric([{ ...requirements, maxPoints: 0 }]));
  assert.throws(() => rubric([requirements, { ...requirements, id: 'duplicate' }]));
  assert.throws(() => scoringEnabled(true, []));
});

test('supported checks produce bounded criterion scores and complete totals from observed content', () => {
  const assessed = assessContent([requirements], 'Photosynthesis uses light and carbon dioxide.\n\nPlants produce oxygen.', context);
  assert.equal(assessed.status, 'complete'); assert.equal(assessed.suggestedTotal, 30); assert.equal(assessed.suggestedPercentage, 100);
  assert.equal(assessed.criteria[0].evidence.length, 3); assert.ok(assessed.criteria[0].evidence.every(e => e.met));
  assert.equal(assessed.analysisReference.submittedVersion, 2);
  const partialCredit = assessContent([requirements], 'Photosynthesis uses light and carbon dioxide.', context);
  assert.equal(partialCredit.suggestedTotal, 20);
  const zero = assessContent([requirements], 'Unrelated.', context);
  assert.equal(zero.suggestedTotal, 0); assert.equal(zero.suggestedPercentage, 0);
});

test('unsupported semantic criteria remain unscored and incomplete totals cannot masquerade as grades', () => {
  const quality = { id: 'quality', title: 'Originality and academic quality', description: 'Teacher judgment', maxPoints: 70, aiEnabled: true };
  const assessed = assessContent([requirements, quality], 'Photosynthesis uses light and carbon dioxide.\n\nPlants produce oxygen.', context);
  assert.equal(assessed.status, 'partial'); assert.equal(assessed.partialTotal, 30);
  assert.equal(assessed.suggestedTotal, null); assert.equal(assessed.suggestedPercentage, null);
  assert.equal(assessed.criteria[1].score, null); assert.match(assessed.criteria[1].explanation, /teacher evaluation/);
  assert.equal((assessed as any).confidence, undefined);
});

test('disabled, failed, missing-text and unsupported-format assessments never invent scores', () => {
  for (const ctx of [{ ...context, enabled: false }, { ...context, analyzed: false }, { ...context, submissionType: 'image' }, { ...context, submissionType: 'code' }]) {
    const assessed = assessContent([requirements], 'Photosynthesis uses light.', ctx);
    assert.equal(assessed.criteria[0].score, null); assert.equal(assessed.suggestedTotal, null);
  }
  assert.equal(assessContent([requirements], null, context).criteria[0].score, null);
  assert.equal(assessContent([{ ...requirements, aiEnabled: false }], 'Photosynthesis.', context).criteria[0].score, null);
});

test('detector probability and confidence cannot affect academic suggestions', async () => {
  const submission = { id: 1, submitted_version: 2, submission_type: 'essay', content_text: 'Photosynthesis uses light and carbon dioxide.\n\nPlants produce oxygen.', rubric: [requirements], ai_scoring_enabled: true };
  const low = await assessSubmission(submission, { analysisStatus: 'completed', detectorType: 'text', aiProbability: 0, confidenceScore: 100 });
  const high = await assessSubmission(submission, { analysisStatus: 'completed', detectorType: 'text', aiProbability: 100, confidenceScore: 100 });
  assert.deepEqual(low.criteria, high.criteria); assert.equal(low.suggestedTotal, high.suggestedTotal);
});

test('required phrases respect word boundaries and Unicode without claiming semantic correctness', () => {
  const criterion = { ...requirements, assessment: { requiredPhrases: ['cat', 'niño'] } };
  const assessed = assessContent([criterion], 'Education helps a NIÑO.', context);
  assert.equal(assessed.criteria[0].score, 15); assert.equal(assessed.criteria[0].evidence[0].met, false);
  assert.equal(assessed.criteria[0].evidence[1].met, true);
});
