/**
 * KamaiPehchan - Classify and Record Pipeline Coordinator (Day 2/4)
 *
 * Coordinates the full transaction processing lifecycle:
 * 1. Invokes the hybrid classifier (Deterministic -> LLM fallback)
 * 2. Applies the Confidence Gate (threshold: 0.70)
 * 3. Runs fraud/anomaly checks (Section 7a) - a flag forces needs_review
 *    regardless of classifier confidence
 * 4. Records transaction to Transaction Store with appropriate flags
 * 5. Triggers worker confirmation prompt if needs_review is true (Section 7)
 */

const { classifyTransaction } = require('./index');
const { applyGate } = require('./confidenceGate');
const { recordTransaction, getHistory } = require('../db/transactionStore');
const { sendConfirmationPrompt } = require('../worker/notifier');
const { detectAnomalies } = require('../fraud/anomalyDetector');
const { isSelfPayment } = require('../fraud/selfPaymentCheck');

/**
 * Classifies, gates, fraud-checks, records, and triggers notifications
 * for a normalized transaction.
 *
 * @param {Object} transaction - Normalized transaction object
 * @returns {Promise<Object>} Gated classification result
 */
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
