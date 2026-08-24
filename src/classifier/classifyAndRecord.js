/**
 * KamaiPehchan - Classify and Record Pipeline Coordinator (Day 2)
 *
 * Coordinates the full transaction processing lifecycle:
 * 1. Invokes the hybrid classifier (Deterministic -> LLM fallback)
 * 2. Applies the Confidence Gate (threshold: 0.70)
 * 3. Records transaction to Transaction Store with appropriate flags
 * 4. Triggers worker confirmation prompt if needs_review is true (Section 7)
 */

const { classifyTransaction } = require('./index');
const { applyGate } = require('./confidenceGate');
const { recordTransaction } = require('../db/transactionStore');
const { sendConfirmationPrompt } = require('../worker/notifier');

/**
 * Classifies, gates, records, and triggers notifications for a normalized transaction.
 *
 * @param {Object} transaction - Normalized transaction object
 * @returns {Promise<Object>} Gated classification result
 */
async function classifyAndRecord(transaction) {
  const classification = await classifyTransaction(transaction);
  const gated = applyGate(classification);

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
