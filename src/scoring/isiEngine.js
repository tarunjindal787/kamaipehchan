const { calculateRegularity } = require('./regularity');
const { calculateRetention } = require('./employerRetention');
const { calculateVariance } = require('./varianceCalc');
const { getConfirmedTransactionsByWorker } = require('../db/transactionStore');

// Explicit, documented weights - stated here so they can be scrutinized
// and adjusted, not hidden inside a formula. Placeholder weights for
// the buildathon prototype - validate against real pilot data
// (Section 10) before treating these as final.
const WEIGHTS = { regularity: 0.4, retention: 0.3, variance: 0.3 };

function groupByRail(transactions) {
  return transactions.reduce((acc, t) => {
    (acc[t.rail_id] = acc[t.rail_id] || []).push(t);
    return acc;
  }, {});
}

function calculateISI(worker_id) {
  const confirmed = getConfirmedTransactionsByWorker(worker_id);

  if (confirmed.length === 0) {
    return { isi_score: null, confidence: 'none', reason: 'no_confirmed_transactions' };
  }

  const byRail = groupByRail(confirmed);
  const regularityScores = Object.values(byRail).map((txns) => calculateRegularity(txns));
  const avgRegularity = regularityScores.reduce((s, r) => s + r.score, 0) / regularityScores.length;

  const retention = calculateRetention(byRail);
  // Retention score: more employers + longer tenure = higher, capped at 100
  const retentionScore = Math.min(100, retention.activeEmployerCount * 20 + retention.avgMonthsRetained * 5);

  const variance = calculateVariance(confirmed);

  const isi_score = Math.round(
    avgRegularity * WEIGHTS.regularity +
    retentionScore * WEIGHTS.retention +
    variance.score * WEIGHTS.variance
  );

  const confidenceLevels = [
    ...regularityScores.map((r) => r.confidence),
    variance.confidence,
  ];
  const overallConfidence = confidenceLevels.includes('low') ? 'low'
    : confidenceLevels.includes('medium') ? 'medium' : 'high';

  return {
    isi_score,
    confidence: overallConfidence,
    weights_used: WEIGHTS,
    breakdown: {
      regularity: { score: Math.round(avgRegularity), byRail: regularityScores },
      retention: { score: Math.round(retentionScore), ...retention },
      variance,
    },
  };
}

module.exports = { calculateISI, WEIGHTS };
