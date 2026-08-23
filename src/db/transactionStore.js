// In-memory transaction history store for Day 1/2 prototype only.
// Replace with a persistent store (DB) beyond the demo stage - this
// resets on server restart and won't work across multiple instances.
const transactionsByRail = new Map();

function recordTransaction(transaction) {
  if (!transaction?.rail_id) {
    throw new Error('recordTransaction requires a transaction with rail_id');
  }

  const history = transactionsByRail.get(transaction.rail_id) || [];
  history.push(transaction);
  transactionsByRail.set(transaction.rail_id, history);
  return transaction;
}

function getHistory(rail_id) {
  return transactionsByRail.get(rail_id) || [];
}

module.exports = { recordTransaction, getHistory };
