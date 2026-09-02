/**
 * Automated Exception Report - Section 9 (Razorpay underwriting
 * transparency requirement): "an honest exception list, not just
 * cherry-picked matches."
 *
 * This is pure aggregation over what classifyAndRecord.js already
 * persists on each transaction (confidence, classification_path,
 * fraud_flags, self_payment_suspected, original_label) - no new
 * detection or classification logic lives here.
 */

const { getTransactionsByWorker, getConfirmedIncomeTransactionsByWorker } = require('../db/transactionStore');
const { CONFIDENCE_THRESHOLD } = require('../classifier/confidenceGate');

function toInr(amountPaise) {
  return typeof amountPaise === 'number' ? Math.round(amountPaise) / 100 : null;
}

function toIso(creditedAtSeconds) {
  return typeof creditedAtSeconds === 'number' ? new Date(creditedAtSeconds * 1000).toISOString() : null;
}

const ACTION_TAKEN = 'Flagged for worker confirmation, excluded from ISI';

// Priority order matters: a transaction can carry more than one signal
// (e.g. self-payment AND a round-number amount) - the most specific,
// most actionable-for-a-lender reason wins. Every branch reads only
// fields already recorded on the transaction by classifyAndRecord.js.
function classifyReason(t) {
  const fraudFlags = Array.isArray(t.fraud_flags) ? t.fraud_flags : [];

  if (t.self_payment_suspected === true) {
    return {
      reason_code: 'SELF_PAYMENT_SUSPECTED',
      reason_detail: "Payer identity matches the worker's own registered phone, VPA, or email.",
    };
  }
  if (fraudFlags.includes('round_number_amount')) {
    return {
      reason_code: 'FRAUD_ROUND_NUMBER',
      reason_detail: 'Amount is an exact multiple of Rs.1000 - flagged as an atypical wage pattern.',
    };
  }
  if (fraudFlags.includes('unnaturally_uniform_intervals')) {
    return {
      reason_code: 'FRAUD_UNIFORM_INTERVALS',
      reason_detail: 'Payment intervals on this rail are identical to the second - atypical of human-initiated payments.',
    };
  }
  if (t.classification_path === 'llm_unavailable' || t.parse_error === true) {
    return {
      reason_code: 'LLM_UNAVAILABLE',
      reason_detail: 'LLM-assisted classification could not complete (not configured, timed out, or returned an unparseable response).',
    };
  }
  if (typeof t.confidence === 'number' && t.confidence < CONFIDENCE_THRESHOLD) {
    return {
      reason_code: 'LOW_CONFIDENCE',
      reason_detail: `Classifier confidence (${t.confidence}) fell below the ${CONFIDENCE_THRESHOLD} auto-approval gate.`,
    };
  }
  // needs_review is true, but no confidence was ever recorded on this
  // transaction (typeof t.confidence !== 'number') and label is null,
  // meaning it's genuinely still sitting in the pending-confirmation
  // bucket with no other diagnostic available - not "we can't tell",
  // just "nothing more specific than pending has been recorded".
  if (t.label === null || t.label === undefined) {
    return {
      reason_code: 'AWAITING_WORKER_CONFIRMATION',
      reason_detail: 'Held for worker SMS confirmation; no reply recorded yet.',
    };
  }

  return {
    reason_code: 'UNKNOWN',
    reason_detail:
      'Transaction is flagged needs_review but carries no recorded confidence, fraud flags, LLM path, or pending marker to explain why.',
  };
}

function buildExceptionReport(worker_id) {
  const all = getTransactionsByWorker(worker_id);
  const confirmedIncome = getConfirmedIncomeTransactionsByWorker(worker_id);

  const totalTransactions = all.length;
  const autoClassified = all.filter((t) => t.needs_review === false).length;
  const exceptionTransactions = all.filter((t) => t.needs_review === true);
  const exceptionsCount = exceptionTransactions.length;
  const includedInIsi = confirmedIncome.length;
  const excludedFromIsi = totalTransactions - includedInIsi;

  const autoClassificationRate =
    totalTransactions === 0 ? 0 : Math.round((autoClassified / totalTransactions) * 1000) / 10;

  const exceptions = exceptionTransactions.map((t) => {
    const { reason_code, reason_detail } = classifyReason(t);
    return {
      transaction_id: t.transaction_id ?? null,
      rail_id: t.rail_id ?? null,
      amount_inr: toInr(t.amount),
      credited_at: toIso(t.credited_at),
      reason_code,
      reason_detail,
      action_taken: ACTION_TAKEN,
      classification_path: t.classification_path ?? null,
    };
  });

  return {
    worker_id,
    generated_at: new Date().toISOString(),
    summary: {
      total_transactions: totalTransactions,
      auto_classified: autoClassified,
      exceptions: exceptionsCount,
      auto_classification_rate: autoClassificationRate,
      included_in_isi: includedInIsi,
      excluded_from_isi: excludedFromIsi,
    },
    exceptions,
  };
}

module.exports = { buildExceptionReport };
