/**
 * KamaiPehchan - In-Memory Transaction Store (Day 2 & Day 3)
 *
 * In-memory ledger tracking transaction histories indexed by:
 * 1. rail_id (for deterministic classifier pattern matching)
 * 2. worker_id (for ISI Engine scoring & Credit Passport assembly)
 *
 * CRITICAL ARCHITECTURAL SAFEGUARD (Section 7):
 * `getConfirmedTransactionsByWorker` strictly filters out any transaction
 * where `needs_review !== false`. Unconfirmed transactions are structurally
 * barred from influencing a worker's credit score.
 */

const transactionsByRail = new Map();
const transactionsByWorker = new Map();

/**
 * Records a normalized transaction into both rail and worker indices.
 *
 * @param {Object} transaction - Normalized transaction object
 * @returns {Object} Stored transaction
 */
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

/**
 * Retrieves full transaction history for a specific payment rail.
 *
 * @param {string} rail_id - Dedicated rail identifier (e.g. virtual_account_id)
 * @returns {Array<Object>} List of transactions on this rail
 */
function getHistory(rail_id) {
  return transactionsByRail.get(rail_id) || [];
}

/**
 * Retrieves all transactions associated with a worker (including pending/unconfirmed).
 *
 * @param {string} worker_id - Worker identifier
 * @returns {Array<Object>} All transactions for this worker
 */
function getTransactionsByWorker(worker_id) {
  return transactionsByWorker.get(worker_id) || [];
}

/**
 * Retrieves ONLY confirmed transactions for scoring (excludes needs_review).
 *
 * Section 7 rule: An unconfirmed transaction is never scored.
 *
 * @param {string} worker_id - Worker identifier
 * @returns {Array<Object>} Confirmed transactions for this worker
 */
function getConfirmedTransactionsByWorker(worker_id) {
  return getTransactionsByWorker(worker_id).filter((t) => t.needs_review === false);
}

// Section 4: ISI is about wage income specifically. A confirmed
// one_off_transfer or advance is a real, resolved transaction, but it
// isn't income - it must not feed regularity/retention/variance math.
const INCOME_LABELS = ['recurring_wage', 'gig_payout'];

/**
 * Retrieves ONLY confirmed transactions that also represent income
 * (excludes needs_review AND non-income labels like one_off_transfer/advance).
 * This is what ISI/Credit Passport scoring should read - getConfirmedTransactionsByWorker
 * stays available for callers that legitimately want all confirmed transactions
 * regardless of label.
 *
 * @param {string} worker_id - Worker identifier
 * @returns {Array<Object>} Confirmed income transactions for this worker
 */
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
