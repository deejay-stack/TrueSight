export function evaluationMetrics(rows) {
  const labelled = rows.filter(r => ['human', 'ai'].includes(r.authorship));
  const binary = labelled.filter(r => typeof r.isAIGenerated === 'boolean' && typeof r.aiProbability === 'number' && Number.isFinite(r.aiProbability) && r.aiProbability >= 0 && r.aiProbability <= 100);
  if (!binary.length) return { sampleSize: 0, excluded: rows.length, status: 'Awaiting verified binary authorship; scores are not ground truth.' };
  const count = (truth, predicted) => binary.filter(r => (r.authorship === 'ai') === truth && r.isAIGenerated === predicted).length;
  const tp = count(true, true), tn = count(false, false), fp = count(false, true), fn = count(true, false);
  const divide = (n, d) => d ? n / d : null;
  const positives = binary.filter(r => r.authorship === 'ai'), negatives = binary.filter(r => r.authorship === 'human');
  let pairs = 0;
  for (const p of positives) for (const n of negatives) pairs += p.aiProbability > n.aiProbability ? 1 : p.aiProbability === n.aiProbability ? 0.5 : 0;
  const bins = Array.from({ length: 10 }, (_, i) => {
    const members = binary.filter(r => Math.min(9, Math.floor(r.aiProbability / 10)) === i);
    return { lower: i / 10, upper: (i + 1) / 10, count: members.length, meanScore: divide(members.reduce((s, r) => s + r.aiProbability / 100, 0), members.length), aiFrequency: divide(members.filter(r => r.authorship === 'ai').length, members.length) };
  });
  return { sampleSize: binary.length, excluded: rows.length - binary.length, failedOrMissingPredictions: labelled.length - binary.length, presentationReviewRequired: binary.filter(r => r.details?.decisionLabel === 'Inconclusive' || r.details?.decisionLabel?.startsWith('Below AI threshold')).length, confusionMatrix: { tn, fp, fn, tp }, accuracy: (tp + tn) / binary.length,
    precision: divide(tp, tp + fp), recall: divide(tp, tp + fn), f1: divide(2 * tp, 2 * tp + fp + fn), falsePositiveRate: divide(fp, fp + tn), falseNegativeRate: divide(fn, fn + tp), rocAuc: divide(pairs, positives.length * negatives.length),
    calibration: { brierScore: binary.reduce((s, r) => s + (r.aiProbability / 100 - Number(r.authorship === 'ai')) ** 2, 0) / binary.length, expectedCalibrationError: bins.reduce((s, b) => s + (b.count ? b.count / binary.length * Math.abs(b.meanScore - b.aiFrequency) : 0), 0), bins },
    limitation: 'Descriptive sample metrics only; a small or convenience sample cannot establish general accuracy, justify threshold tuning, or validate probability calibration. Mixed and unknown authorship are excluded.' };
}
