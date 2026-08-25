/**
 * Flags suspicious payment PATTERNS as needs_review signals - never
 * an auto-reject. Section 7a: this is a pilot-phase hardening item,
 * not a claimed fraud-proof system.
 */
function isRoundNumber(amount) {
  // amount is in paise; flag if it's an exact multiple of 100000
  // paise (Rs. 1000) - a real salary is rarely a perfectly round figure
  return amount % 100000 === 0;
}

function hasUnnaturallyUniformIntervals(railTransactions) {
  if (railTransactions.length < 3) return false;
  const sorted = [...railTransactions].sort((a, b) => a.credited_at - b.credited_at);
  const intervals = [];
  for (let i = 1; i < sorted.length; i++) {
    intervals.push(sorted[i].credited_at - sorted[i - 1].credited_at);
  }
  // flag if every interval is EXACTLY identical to the second - real
  // human-initiated payments almost never land at the exact same
  // second-level interval repeatedly
  return intervals.every((v) => v === intervals[0]);
}

function detectAnomalies(transaction, railHistory) {
  const flags = [];
  if (isRoundNumber(transaction.amount)) flags.push('round_number_amount');
  if (hasUnnaturallyUniformIntervals([...railHistory, transaction])) flags.push('unnaturally_uniform_intervals');
  return { flagged: flags.length > 0, flags };
}

module.exports = { detectAnomalies, isRoundNumber, hasUnnaturallyUniformIntervals };
