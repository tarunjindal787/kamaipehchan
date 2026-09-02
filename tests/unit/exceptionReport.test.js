const assert = require('assert');
const { recordTransaction } = require('../../src/db/transactionStore');
const { buildExceptionReport } = require('../../src/reporting/exceptionReport');

console.log('Running unit test: tests/unit/exceptionReport.test.js');

const now = Math.floor(Date.now() / 1000);

// --- 1. Mixed confirmed/exception worker: correct counts and rate ---
const MIXED_WORKER = 'worker_exception_mixed_test';

recordTransaction({
  transaction_id: 'pay_mixed_1',
  rail_id: 'rail_mixed_a',
  worker_id: MIXED_WORKER,
  amount: 1450000,
  note: 'salary',
  credited_at: now - 30 * 86400,
  needs_review: false,
  label: 'recurring_wage',
  confidence: 1,
  classification_path: 'deterministic',
});
recordTransaction({
  transaction_id: 'pay_mixed_2',
  rail_id: 'rail_mixed_a',
  worker_id: MIXED_WORKER,
  amount: 1460000,
  note: 'salary',
  credited_at: now,
  needs_review: false,
  label: 'recurring_wage',
  confidence: 1,
  classification_path: 'deterministic',
});
// A confirmed one_off_transfer - auto-classified but NOT income.
recordTransaction({
  transaction_id: 'pay_mixed_3',
  rail_id: 'rail_mixed_b',
  worker_id: MIXED_WORKER,
  amount: 500000,
  note: 'personal',
  credited_at: now,
  needs_review: false,
  label: 'one_off_transfer',
  confidence: 1,
  classification_path: 'deterministic',
});
// An exception: low confidence.
recordTransaction({
  transaction_id: 'pay_mixed_4',
  rail_id: 'rail_mixed_c',
  worker_id: MIXED_WORKER,
  amount: 300000,
  note: 'urgent',
  credited_at: now,
  needs_review: true,
  label: null,
  confidence: 0.42,
  classification_path: 'llm_assisted',
});

{
  const report = buildExceptionReport(MIXED_WORKER);
  assert.strictEqual(report.worker_id, MIXED_WORKER);
  assert.strictEqual(typeof report.generated_at, 'string');
  assert.strictEqual(report.summary.total_transactions, 4);
  assert.strictEqual(report.summary.auto_classified, 3);
  assert.strictEqual(report.summary.exceptions, 1);
  assert.strictEqual(report.summary.auto_classification_rate, 75.0);
  assert.strictEqual(report.summary.included_in_isi, 2); // only the two recurring_wage
  assert.strictEqual(report.summary.excluded_from_isi, 2); // one_off_transfer + the exception
  assert.strictEqual(report.exceptions.length, 1);
  assert.strictEqual(report.exceptions[0].transaction_id, 'pay_mixed_4');
  assert.strictEqual(report.exceptions[0].reason_code, 'LOW_CONFIDENCE');
  assert.strictEqual(report.exceptions[0].amount_inr, 3000);
  console.log('  ✓ mixed confirmed/exception worker produces correct counts and rate');
}

// --- 2. Zero transactions: clean empty report, no crash ---
{
  const report = buildExceptionReport('worker_never_seen_anywhere');
  assert.strictEqual(report.summary.total_transactions, 0);
  assert.strictEqual(report.summary.auto_classified, 0);
  assert.strictEqual(report.summary.exceptions, 0);
  assert.strictEqual(report.summary.auto_classification_rate, 0);
  assert.strictEqual(report.summary.included_in_isi, 0);
  assert.strictEqual(report.summary.excluded_from_isi, 0);
  assert.deepStrictEqual(report.exceptions, []);
  console.log('  ✓ worker with zero transactions returns a clean empty report, does not crash');
}

// --- 3. Each reason code maps correctly from underlying transaction data ---
function reasonFor(worker_id, txn) {
  recordTransaction({ worker_id, needs_review: true, label: null, ...txn });
  const report = buildExceptionReport(worker_id);
  const match = report.exceptions.find((e) => e.transaction_id === txn.transaction_id);
  assert.ok(match, `expected an exception entry for ${txn.transaction_id}`);
  return match.reason_code;
}

assert.strictEqual(
  reasonFor('worker_reason_low_confidence', {
    transaction_id: 'pay_reason_low_conf',
    rail_id: 'rail_r1',
    amount: 100000,
    credited_at: now,
    confidence: 0.5,
    classification_path: 'llm_assisted',
  }),
  'LOW_CONFIDENCE'
);

assert.strictEqual(
  reasonFor('worker_reason_fraud_round', {
    transaction_id: 'pay_reason_round',
    rail_id: 'rail_r2',
    amount: 100000,
    credited_at: now,
    confidence: 1,
    classification_path: 'deterministic',
    fraud_flags: ['round_number_amount'],
  }),
  'FRAUD_ROUND_NUMBER'
);

assert.strictEqual(
  reasonFor('worker_reason_fraud_uniform', {
    transaction_id: 'pay_reason_uniform',
    rail_id: 'rail_r3',
    amount: 123456,
    credited_at: now,
    confidence: 1,
    classification_path: 'deterministic',
    fraud_flags: ['unnaturally_uniform_intervals'],
  }),
  'FRAUD_UNIFORM_INTERVALS'
);

assert.strictEqual(
  reasonFor('worker_reason_self_payment', {
    transaction_id: 'pay_reason_selfpay',
    rail_id: 'rail_r4',
    amount: 123456,
    credited_at: now,
    confidence: 1,
    classification_path: 'deterministic',
    self_payment_suspected: true,
  }),
  'SELF_PAYMENT_SUSPECTED'
);

assert.strictEqual(
  reasonFor('worker_reason_llm_unavailable_no_key', {
    transaction_id: 'pay_reason_llm_no_key',
    rail_id: 'rail_r5',
    amount: 123456,
    credited_at: now,
    confidence: 0,
    classification_path: 'llm_unavailable',
  }),
  'LLM_UNAVAILABLE'
);

assert.strictEqual(
  reasonFor('worker_reason_llm_parse_error', {
    transaction_id: 'pay_reason_llm_parse_error',
    rail_id: 'rail_r6',
    amount: 123456,
    credited_at: now,
    confidence: 0,
    classification_path: 'llm_assisted',
    parse_error: true,
  }),
  'LLM_UNAVAILABLE'
);

assert.strictEqual(
  reasonFor('worker_reason_awaiting_confirmation', {
    transaction_id: 'pay_reason_awaiting',
    rail_id: 'rail_r7',
    amount: 123456,
    credited_at: now,
    // No confidence, no fraud flags, no path recorded - label is null,
    // matching the shape of a bare pending confirmation.
  }),
  'AWAITING_WORKER_CONFIRMATION'
);

assert.strictEqual(
  reasonFor('worker_reason_unknown', {
    transaction_id: 'pay_reason_unknown',
    rail_id: 'rail_r8',
    amount: 123456,
    credited_at: now,
    // needs_review true but label is NOT null and nothing else is
    // recorded - a genuinely unexplainable state.
    label: 'something_unexpected',
  }),
  'UNKNOWN'
);

console.log('  ✓ each reason code maps correctly from the underlying transaction data');

// Priority: self-payment must win over a simultaneous fraud flag.
{
  recordTransaction({
    transaction_id: 'pay_reason_priority',
    worker_id: 'worker_reason_priority',
    rail_id: 'rail_r9',
    amount: 100000,
    credited_at: now,
    needs_review: true,
    label: null,
    confidence: 1,
    classification_path: 'deterministic',
    fraud_flags: ['round_number_amount'],
    self_payment_suspected: true,
  });
  const report = buildExceptionReport('worker_reason_priority');
  assert.strictEqual(report.exceptions[0].reason_code, 'SELF_PAYMENT_SUSPECTED');
  console.log('  ✓ self-payment takes priority over a simultaneous fraud flag');
}

console.log('✅ Unit test passed: exception report aggregation, empty-report safety, and reason-code mapping verified.');
