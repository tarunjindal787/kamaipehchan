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

async function classifyAndRecord(transaction) {
  const classification = await classifyTransaction(transaction);
  let gated = applyGate(classification);

  const railHistory = getHistory(transaction.rail_id);
  const anomalies = detectAnomalies(transaction, railHistory);
  const selfPay = isSelfPayment(transaction);

  if (anomalies.flagged || (selfPay.checked && selfPay.isSelfPayment)) {
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
  });

  if (gated.needs_review) {
    await sendConfirmationPrompt(transaction, gated);
  }

  return gated;
}

module.exports = { classifyAndRecord };
