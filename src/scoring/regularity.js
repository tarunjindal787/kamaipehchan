/**
 * Regularity score: how consistent are the gaps between payments from
 * the same employer rail? Lower variation = higher score.
 * credited_at is a Unix timestamp in seconds (per normalize.js).
 * This scoring formula is a documented heuristic, not a standardized
 * industry formula - flag for review during the pilot (Section 10).
 */
function calculateRegularity(railTransactions) {
  if (railTransactions.length < 2) {
    return { score: 0, confidence: 'low', reason: 'insufficient_history', sampleSize: railTransactions.length };
  }

  const sorted = [...railTransactions].sort((a, b) => a.credited_at - b.credited_at);
  const intervalsDays = [];
  for (let i = 1; i < sorted.length; i++) {
    intervalsDays.push((sorted[i].credited_at - sorted[i - 1].credited_at) / 86400);
  }

  const mean = intervalsDays.reduce((a, b) => a + b, 0) / intervalsDays.length;
  const variance = intervalsDays.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / intervalsDays.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;
  const score = Math.max(0, Math.round(100 - coefficientOfVariation * 100));

  return {
    score,
    meanIntervalDays: Math.round(mean * 10) / 10,
    stdDevDays: Math.round(stdDev * 10) / 10,
    confidence: sorted.length >= 3 ? 'high' : 'medium',
    sampleSize: sorted.length,
  };
}

module.exports = { calculateRegularity };
