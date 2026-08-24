/**
 * KamaiPehchan - Credit Passport Assembly Module (Day 3)
 *
 * Assembles the Section 4 Lender/Worker Credit Passport on-demand from:
 * 1. Income Stability Index (ISI) Engine calculation (0-100 explainable score)
 * 2. Confirmed transaction history from the Transaction Store
 * 3. 6-Month rolling average monthly income computation
 *
 * If a worker has insufficient transaction data, this returns an explicit
 * { status: 'insufficient_data' } payload with isi_score: null (no fake/guessed scores).
 */

const { calculateISI } = require('../scoring/isiEngine');
const { getConfirmedTransactionsByWorker } = require('../db/transactionStore');

/**
 * Computes the average monthly income across the last 6 months (180 days).
 *
 * @param {Array<Object>} confirmedTransactions - List of confirmed worker transactions
 * @returns {number|null} Average monthly income in paise/units, or null if no recent activity
 */
function sixMonthAverageIncome(confirmedTransactions) {
  const sixMonthsAgo = Math.floor(Date.now() / 1000) - 6 * 30 * 86400;
  const recent = confirmedTransactions.filter((t) => t.credited_at >= sixMonthsAgo);
  if (recent.length === 0) return null;

  const total = recent.reduce((s, t) => s + t.amount, 0);
  const months = new Set(
    recent.map((t) => {
      const d = new Date(t.credited_at * 1000);
      return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    })
  ).size;

  return Math.round(total / Math.max(1, months));
}

/**
 * Builds the canonical Credit Passport for a given worker.
 *
 * @param {string} worker_id - Unique worker identifier
 * @returns {Object} Credit Passport payload
 */
function buildPassport(worker_id) {
  const confirmed = getConfirmedTransactionsByWorker(worker_id);
  const isi = calculateISI(worker_id);

  // Safeguard: Do not manufacture scores for workers with zero confirmed data
  if (isi.isi_score === null) {
    return {
      worker_id,
      isi_score: null,
      status: 'insufficient_data',
      reason: isi.reason,
    };
  }

  return {
    worker_id,
    isi_score: isi.isi_score,
    confidence: isi.confidence,
    active_employer_count: isi.breakdown.retention.activeEmployerCount,
    six_month_avg_income: sixMonthAverageIncome(confirmed),
    weights_used: isi.weights_used,
    breakdown: isi.breakdown,
    generated_at: new Date().toISOString(),
  };
}

module.exports = { buildPassport, sixMonthAverageIncome };
