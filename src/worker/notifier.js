// Section 7 - simulated confirmation prompt only, no real SMS/WhatsApp send
// (per the $0-build plan). A transaction gated to needs_review is excluded
// from ISI until a real confirmation channel is wired in and the worker
// actually confirms - it is never guessed into a category.
async function sendConfirmationPrompt(transaction, classificationResult) {
  const amount = (transaction.amount / 100).toFixed(0);
  const message = `Is Rs.${amount} aapki monthly salary hai? Reply 1 for haan, 2 for personal/loan transfer.`;
  console.log(`[notifier] SIMULATED message to worker ${transaction.worker_id}: "${message}"`);
  console.log(`[notifier] Transaction excluded from ISI until confirmed (Section 7 - never guessed).`);
  return { sent: true, simulated: true };
}

module.exports = { sendConfirmationPrompt };
