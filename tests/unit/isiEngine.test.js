const assert = require('assert');
const { calculateISI } = require('../../src/scoring/isiEngine');
const { recordTransaction } = require('../../src/db/transactionStore');

console.log('Running unit test: tests/unit/isiEngine.test.js');

const WORKER_ID = 'worker_isi_test';

// 3 confirmed transactions across 2 rails, over 3 distinct calendar months.
const ts1 = Math.floor(Date.UTC(2026, 0, 15) / 1000); // Jan 2026
const ts2 = Math.floor(Date.UTC(2026, 1, 15) / 1000); // Feb 2026
const ts3 = Math.floor(Date.UTC(2026, 2, 15) / 1000); // Mar 2026

recordTransaction({
  rail_id: 'rail_isi_1',
  worker_id: WORKER_ID,
  amount: 500000,
  note: 'salary',
  credited_at: ts1,
  needs_review: false,
  label: 'recurring_wage',
});
recordTransaction({
  rail_id: 'rail_isi_1',
  worker_id: WORKER_ID,
  amount: 510000,
  note: 'salary',
  credited_at: ts2,
  needs_review: false,
  label: 'recurring_wage',
});
recordTransaction({
  rail_id: 'rail_isi_2',
  worker_id: WORKER_ID,
  amount: 200000,
  note: 'gig payout',
  credited_at: ts3,
  needs_review: false,
  label: 'gig_payout',
});

const result = calculateISI(WORKER_ID);

assert.strictEqual(typeof result.isi_score, 'number');
assert.ok(result.isi_score >= 0 && result.isi_score <= 100, `isi_score out of range: ${result.isi_score}`);
console.log(`  ✓ isi_score is a number between 0-100 (${result.isi_score})`);

assert.ok(result.breakdown, 'breakdown must be present');
assert.ok(result.breakdown.regularity, 'breakdown.regularity must be present');
assert.ok(result.breakdown.retention, 'breakdown.retention must be present');
assert.ok(result.breakdown.variance, 'breakdown.variance must be present');
assert.strictEqual(result.breakdown.regularity.byRail.length, 2, 'expected regularity scores for 2 rails');
assert.strictEqual(result.breakdown.retention.activeEmployerCount, 2);
console.log('  ✓ breakdown.regularity, breakdown.retention, breakdown.variance all present with correct rail counts');

// Hardcode the expected literal weights here rather than comparing against
// the WEIGHTS constant imported from isiEngine.js - weights_used IS that
// same object reference, so comparing against it would always pass no
// matter what someone changes it to later. This is the actual drift check.
assert.deepStrictEqual(result.weights_used, { regularity: 0.4, retention: 0.3, variance: 0.3 });
console.log('  ✓ weights_used matches the documented weights exactly (hardcoded expectation, not the same reference)');

console.log('✅ Unit test passed: ISI engine combiner verified end-to-end.');
