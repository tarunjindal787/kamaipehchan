const { calculateISI } = require('../scoring/isiEngine');
const { getConfirmedTransactionsByWorker } = require('../db/transactionStore');

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

function buildPassport(worker_id) {
  const confirmed = getConfirmedTransactionsByWorker(worker_id);
  const isi = calculateISI(worker_id);

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
