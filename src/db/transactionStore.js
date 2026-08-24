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

module.exports = {
  recordTransaction,
  getHistory,
  getTransactionsByWorker,
  getConfirmedTransactionsByWorker,
};
