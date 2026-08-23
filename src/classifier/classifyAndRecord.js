const { classifyTransaction } = require('./index');
const { applyGate } = require('./confidenceGate');
const { recordTransaction } = require('../db/transactionStore');
const { sendConfirmationPrompt } = require('../worker/notifier');

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
