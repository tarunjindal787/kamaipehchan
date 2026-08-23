/**
 * Retention: how many distinct employer rails does this worker have,
 * and how long has each relationship persisted? Multiple concurrent
 * relationships = stable income per Section 2's core thesis, not a
 * risk signal.
 */
function calculateRetention(confirmedTransactionsByRail) {
  const railIds = Object.keys(confirmedTransactionsByRail);
  const activeEmployerCount = railIds.length;

  const retentionByRail = {};
  for (const railId of railIds) {
    const sorted = [...confirmedTransactionsByRail[railId]].sort((a, b) => a.credited_at - b.credited_at);
    const spanSeconds = sorted[sorted.length - 1].credited_at - sorted[0].credited_at;
    const monthsActive = Math.max(1, Math.round(spanSeconds / (86400 * 30)));
    retentionByRail[railId] = { monthsActive, transactionCount: sorted.length };
  }

  const avgMonthsRetained = activeEmployerCount > 0
    ? Object.values(retentionByRail).reduce((s, r) => s + r.monthsActive, 0) / activeEmployerCount
    : 0;

  return { activeEmployerCount, retentionByRail, avgMonthsRetained: Math.round(avgMonthsRetained * 10) / 10 };
}

module.exports = { calculateRetention };
