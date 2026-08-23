// In-memory transaction history store for Day 1/2 prototype only.
// Replace with a persistent store (DB) beyond the demo stage - this
// resets on server restart and won't work across multiple instances.
const transactionsByRail = new Map();
const transactionsByWorker = new Map();

function recordTransaction(transaction) {
  if (!transaction?.rail_id) {
    throw new Error('recordTransaction requires a transaction with rail_id');
  }

  const railHistory = transactionsByRail.get(transaction.rail_id) || [];
  railHistory.push(transaction);
  transactionsByRail.set(transaction.rail_id, railHistory);

  if (transaction.worker_id) {
    const workerHistory = transactionsByWorker.get(transaction.worker_id) || [];
    workerHistory.push(transaction);
    transactionsByWorker.set(transaction.worker_id, workerHistory);
  }

  return transaction;
}

function getHistory(rail_id) {
  return transactionsByRail.get(rail_id) || [];
}

function getTransactionsByWorker(worker_id) {
  return transactionsByWorker.get(worker_id) || [];
}

// Section 7, non-negotiable: an unconfirmed transaction is never scored.
// This is the ONLY sanctioned way to read a worker's transactions for
// scoring - it filters out anything still needs_review so that rule is
// structurally hard to bypass by accident.
function getConfirmedTransactionsByWorker(worker_id) {
  return getTransactionsByWorker(worker_id).filter((t) => t.needs_review === false);
}

module.exports = {
  recordTransaction,
  getHistory,
  getTransactionsByWorker,
  getConfirmedTransactionsByWorker,
};
