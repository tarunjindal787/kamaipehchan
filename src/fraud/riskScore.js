/**
 * Converts the boolean fraud signals already computed by
 * anomalyDetector.js and selfPaymentCheck.js into a single weighted
 * 0-100 score. No new detection lives here - this is pure aggregation
 * over signals computed elsewhere, same posture as exceptionReport.js.
 *
 * Weights below are unvalidated placeholders pending pilot data -
 * same caveat as isiEngine.js's WEIGHTS (Section 10: validate before
 * treating as final).
 */

const WEIGHTS = {
  self_payment_suspected: 50,
  unnaturally_uniform_intervals: 30,
  round_number_amount: 25,
  first_payment_on_this_rail: 30,
  no_history_on_rail: 15,
};

// paise - Rs 25,000
const LARGE_FIRST_PAYMENT_THRESHOLD = 2500000;

function calculateRiskScore(transaction, railHistory, anomalies, selfPay) {
  const factors = [];

  if (selfPay && selfPay.checked && selfPay.isSelfPayment) {
    factors.push({
      factor: 'self_payment_suspected',
      points: WEIGHTS.self_payment_suspected,
      detail: "Payer identity matches the worker's own registered phone, VPA, or email.",
    });
  }

  const flags = (anomalies && anomalies.flags) || [];
  if (flags.includes('unnaturally_uniform_intervals')) {
    factors.push({
      factor: 'unnaturally_uniform_intervals',
      points: WEIGHTS.unnaturally_uniform_intervals,
      detail: 'Payment intervals on this rail are identical to the second - atypical of human-initiated payments.',
    });
  }
  if (flags.includes('round_number_amount')) {
    factors.push({
      factor: 'round_number_amount',
      points: WEIGHTS.round_number_amount,
      detail: 'Amount is an exact multiple of Rs.1000 - flagged as an atypical wage pattern.',
    });
  }

  // No history on a rail is one underlying signal, not two - a large
  // first payment gets the more specific, heavier factor instead of
  // stacking with the generic "no history" factor below it.
  const noHistory = Array.isArray(railHistory) && railHistory.length === 0;
  if (noHistory && transaction.amount > LARGE_FIRST_PAYMENT_THRESHOLD) {
    factors.push({
      factor: 'first_payment_on_this_rail',
      points: WEIGHTS.first_payment_on_this_rail,
      detail: `First payment on this rail exceeds Rs.25,000 (amount: Rs.${Math.round(transaction.amount / 100)}).`,
    });
  } else if (noHistory) {
    factors.push({
      factor: 'no_history_on_rail',
      points: WEIGHTS.no_history_on_rail,
      detail: 'No prior payment history on this rail.',
    });
  }

  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const risk_score = Math.min(100, rawScore);
  const risk_level = risk_score >= 70 ? 'HIGH' : risk_score >= 40 ? 'MEDIUM' : 'LOW';

  return { risk_score, risk_level, contributing_factors: factors };
}

module.exports = { calculateRiskScore, WEIGHTS, LARGE_FIRST_PAYMENT_THRESHOLD };
