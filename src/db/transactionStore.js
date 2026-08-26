/**
 * In-memory ledger, indexed two ways: by rail_id (for the deterministic
 * classifier's history matching) and by worker_id (for ISI scoring and
 * Credit Passport assembly).
 *
 * Section 7 safeguard: getConfirmedTransactionsByWorker filters out
 * anything where needs_review !== false. Unconfirmed transactions are
 * structurally barred from influencing a worker's credit score.
 */

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

// Includes pending/unconfirmed transactions - see getConfirmedTransactionsByWorker
// below for the version that's actually safe to score with.
function getTransactionsByWorker(worker_id) {
  return transactionsByWorker.get(worker_id) || [];
}

function getConfirmedTransactionsByWorker(worker_id) {
  return getTransactionsByWorker(worker_id).filter((t) => t.needs_review === false);
}

// Section 4: ISI is about wage income specifically. A confirmed
// one_off_transfer or advance is a real, resolved transaction, but it
// isn't income - it must not feed regularity/retention/variance math.
const INCOME_LABELS = ['recurring_wage', 'gig_payout'];

// This is what ISI/Credit Passport scoring should actually read.
// getConfirmedTransactionsByWorker above stays available for callers that
// legitimately want all confirmed transactions regardless of label.
function getConfirmedIncomeTransactionsByWorker(worker_id) {
  return getTransactionsByWorker(worker_id).filter(
    (t) => t.needs_review === false && INCOME_LABELS.includes(t.label)
  );
}

module.exports = {
  recordTransaction,
  getHistory,
  getTransactionsByWorker,
  getConfirmedTransactionsByWorker,
  getConfirmedIncomeTransactionsByWorker,
  INCOME_LABELS,
};
