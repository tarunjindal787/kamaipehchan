const assert = require('assert');
const { detectAnomalies, isRoundNumber, hasUnnaturallyUniformIntervals } = require('../../src/fraud/anomalyDetector');
const { isSelfPayment } = require('../../src/fraud/selfPaymentCheck');
const { registerWorker } = require('../../src/db/workerRegistry');
const { classifyAndRecord } = require('../../src/classifier/classifyAndRecord');
const { getTransactionsByWorker } = require('../../src/db/transactionStore');

console.log('Running unit test: tests/unit/fraud.test.js');

const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

async function run() {
  // --- clean transaction, varied amount, varied intervals -> not flagged ---
  const cleanHistory = [
    { credited_at: now - 61 * DAY },
    { credited_at: now - 33 * DAY },
  ];
  const cleanTransaction = { amount: 513700, credited_at: now };
  const cleanResult = detectAnomalies(cleanTransaction, cleanHistory);
  assert.strictEqual(cleanResult.flagged, false);
  assert.deepStrictEqual(cleanResult.flags, []);
  console.log('  ✓ clean transaction (varied amount, varied intervals) -> not flagged');

  // --- exact round-number amount -> flagged 'round_number_amount' ---
  assert.strictEqual(isRoundNumber(500000), true);
  assert.strictEqual(isRoundNumber(513700), false);
  const roundResult = detectAnomalies({ amount: 500000, credited_at: now }, cleanHistory);
  assert.strictEqual(roundResult.flagged, true);
  assert.ok(roundResult.flags.includes('round_number_amount'));
  console.log("  ✓ exact round-number amount -> flagged 'round_number_amount'");

  // --- 3+ transactions with identical intervals -> flagged 'unnaturally_uniform_intervals' ---
  const uniformHistory = [
    { credited_at: now - 60 * DAY },
    { credited_at: now - 30 * DAY },
  ];
  assert.strictEqual(hasUnnaturallyUniformIntervals([...uniformHistory, { credited_at: now }]), true);
  const uniformResult = detectAnomalies({ amount: 513700, credited_at: now }, uniformHistory);
  assert.strictEqual(uniformResult.flagged, true);
  assert.ok(uniformResult.flags.includes('unnaturally_uniform_intervals'));
  console.log("  ✓ 3+ transactions with identical intervals -> flagged 'unnaturally_uniform_intervals'");

  // --- isSelfPayment: registry empty -> checked:false, not a false accusation ---
  const NO_REGISTRY_WORKER = 'worker_fraud_no_registry';
  const noRegistryResult = isSelfPayment({ worker_id: NO_REGISTRY_WORKER, payer_identifier: '+919999999999' });
  assert.deepStrictEqual(noRegistryResult, { checked: false, reason: 'no_worker_identity_on_file' });
  console.log('  ✓ isSelfPayment: no identity on file -> checked:false, no_worker_identity_on_file (not a false accusation)');

  // --- isSelfPayment: no payer_identifier on transaction -> checked:false ---
  const NO_PAYER_ID_WORKER = 'worker_fraud_no_payer_id';
  registerWorker(NO_PAYER_ID_WORKER, { phone: '+919999999999' });
  const noPayerIdResult = isSelfPayment({ worker_id: NO_PAYER_ID_WORKER, payer_identifier: null });
  assert.deepStrictEqual(noPayerIdResult, { checked: false, reason: 'no_payer_identifier' });
  console.log('  ✓ isSelfPayment: missing payer_identifier -> checked:false, no_payer_identifier');

  // --- isSelfPayment: registry populated, matching identity -> real detection works ---
  const MATCH_WORKER = 'worker_fraud_match';
  registerWorker(MATCH_WORKER, { phone: '+91 98765-43210' });
  const matchResult = isSelfPayment({ worker_id: MATCH_WORKER, payer_identifier: '+919876543210' });
  assert.deepStrictEqual(matchResult, { checked: true, isSelfPayment: true });
  console.log('  ✓ isSelfPayment: matching identity (format-insensitive) -> checked:true, isSelfPayment:true');

  // --- isSelfPayment: registry populated, no match -> checked:true, isSelfPayment:false ---
  const NO_MATCH_WORKER = 'worker_fraud_no_match';
  registerWorker(NO_MATCH_WORKER, { phone: '+919876543210' });
  const noMatchResult = isSelfPayment({ worker_id: NO_MATCH_WORKER, payer_identifier: '+911111111111' });
  assert.deepStrictEqual(noMatchResult, { checked: true, isSelfPayment: false });
  console.log('  ✓ isSelfPayment: identity on file, no match -> checked:true, isSelfPayment:false');

  // --- classifyAndRecord: a fraud-flagged transaction forces needs_review
  // even when the classifier itself was confident ---
  const FRAUD_WIRING_WORKER = 'worker_fraud_wiring_test';
  const railId = 'rail_fraud_wiring';
  const confidentTransaction = {
    rail_id: railId,
    worker_id: FRAUD_WIRING_WORKER,
    amount: 500000, // round number -> will be flagged
    note: 'salary', // exact note match -> deterministic, confidence 1, label recurring_wage
    credited_at: now,
  };

  const result = await classifyAndRecord(confidentTransaction);
  assert.strictEqual(result.needs_review, true, 'a fraud flag must force needs_review even on a confident classification');
  assert.strictEqual(result.label, 'needs_review');
  assert.ok(result.fraud_flags.includes('round_number_amount'));
  assert.strictEqual(
    result.original_label,
    'recurring_wage',
    'the classifier\'s real suspected label must survive the fraud override, not be lost to the literal string "needs_review"'
  );

  const stored = getTransactionsByWorker(FRAUD_WIRING_WORKER)[0];
  assert.strictEqual(stored.needs_review, true);
  assert.strictEqual(stored.label, null);
  console.log('  ✓ classifyAndRecord: fraud flag forces needs_review on a confident classification, original_label preserved');

  console.log('✅ Unit test passed: anomaly detection, self-payment check, and fraud wiring all verified.');
}

run().catch((err) => {
  console.error('❌ fraud test failed:', err);
  process.exit(1);
});
