/**
 * Measures month-on-month variance in a worker's TOTAL combined income
 * across all employer rails - not per-rail. A worker whose combined
 * income is stable even if individual employers fluctuate should score
 * well here; that's the whole point of the multi-employer thesis
 * (Section 2).
 */
function groupByMonth(transactions) {
  const byMonth = {};
  for (const t of transactions) {
    const date = new Date(t.credited_at * 1000);
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = (byMonth[key] || 0) + t.amount;
  }
  return byMonth;
}

function calculateVariance(confirmedTransactionsAcrossAllRails) {
  const byMonth = groupByMonth(confirmedTransactionsAcrossAllRails);
  const monthlyTotals = Object.values(byMonth);

  if (monthlyTotals.length < 2) {
    return { score: 0, confidence: 'low', reason: 'insufficient_months', monthsObserved: monthlyTotals.length };
  }

  const mean = monthlyTotals.reduce((a, b) => a + b, 0) / monthlyTotals.length;
  const variance = monthlyTotals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / monthlyTotals.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;
  const score = Math.max(0, Math.round(100 - coefficientOfVariation * 100));

  return {
    score,
    avgMonthlyIncome: Math.round(mean),
    monthsObserved: monthlyTotals.length,
    confidence: monthlyTotals.length >= 6 ? 'high' : monthlyTotals.length >= 3 ? 'medium' : 'low',
  };
}

module.exports = { calculateVariance, groupByMonth };
