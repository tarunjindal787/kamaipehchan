/**
 * Runs a transaction through the full pipeline: classify (deterministic
 * then LLM fallback), gate on confidence, run fraud/anomaly checks (a
 * flag forces needs_review no matter how confident the classifier was),
 * record it, and prompt the worker for confirmation if it's still
 * needs_review.
 */

const { classifyTransaction } = require('./index');
const { applyGate } = require('./confidenceGate');
const { recordTransaction, getHistory } = require('../db/transactionStore');
const { sendConfirmationPrompt } = require('../worker/notifier');
const { detectAnomalies } = require('../fraud/anomalyDetector');
const { isSelfPayment } = require('../fraud/selfPaymentCheck');
const { calculateRiskScore } = require('../fraud/riskScore');

async function classifyAndRecord(transaction) {
  const classification = await classifyTransaction(transaction);
  let gated = applyGate(classification);

  const railHistory = getHistory(transaction.rail_id);
  const anomalies = detectAnomalies(transaction, railHistory);
  const selfPay = isSelfPayment(transaction);
  // Computed from the same anomalies/selfPay signals checked below, so
  // a HIGH risk_level can never occur without also tripping the
  // fraud-flag/self-payment condition already handled there - see
  // riskScore.js's "no_history_on_rail" comment. Included in the
  // condition anyway so the override stays correct if the weights
  // above ever change independently of this file.
  const risk = calculateRiskScore(transaction, railHistory, anomalies, selfPay);

  if (anomalies.flagged || (selfPay.checked && selfPay.isSelfPayment) || risk.risk_level === 'HIGH') {
    gated = {
      ...gated,
      needs_review: true,
      label: 'needs_review',
      // Preserve whatever the classifier's best-known suspected category
      // was BEFORE this override, the same way confidenceGate does for a
      // low-confidence gate - notifier.js reads original_label to resolve
      // a later "reply 1" confirmation back to the right category. Without
      // this, a fraud-flagged but classifier-confident transaction would
      // resolve to the literal string "needs_review" as its final label.
      original_label: gated.original_label || gated.label,
      fraud_flags: anomalies.flags,
      self_payment_suspected: selfPay.isSelfPayment || false,
    };
  }

  recordTransaction({
    ...transaction,
    needs_review: gated.needs_review,
    label: gated.needs_review ? null : gated.label,
    // Persisted so downstream reporting (src/reporting/exceptionReport.js)
    // can cite the actual recorded reason a transaction wasn't
    // auto-classified, rather than re-deriving or guessing it after the
    // fact - none of this was previously written to the stored record.
    confidence: gated.confidence,
    classification_path: gated.path,
    parse_error: gated.parse_error || false,
    fraud_flags: gated.fraud_flags || [],
    self_payment_suspected: gated.self_payment_suspected || false,
    original_label: gated.original_label || null,
    // Persisted independently of needs_review/fraud_flags so the
    // Exception Report (src/reporting/exceptionReport.js) can surface
    // the score even on transactions the fraud-flag override didn't
    // otherwise touch.
    risk_score: risk.risk_score,
    risk_level: risk.risk_level,
    contributing_factors: risk.contributing_factors,
  });

  if (gated.needs_review) {
    await sendConfirmationPrompt(transaction, gated);
  }

  return gated;
}

module.exports = { classifyAndRecord };
