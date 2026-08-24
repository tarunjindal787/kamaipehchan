const assert = require('assert');
const { buildPassport, sixMonthAverageIncome } = require('../../src/passport/buildPassport');
const { recordTransaction } = require('../../src/db/transactionStore');

console.log('Running unit test: tests/unit/passport.test.js');

// 1. Worker with zero confirmed transactions -> insufficient_data
const zeroWorker = 'worker_passport_zero_test';
const zeroPassport = buildPassport(zeroWorker);

assert.strictEqual(zeroPassport.worker_id, zeroWorker);
assert.strictEqual(zeroPassport.isi_score, null);
assert.strictEqual(zeroPassport.status, 'insufficient_data');
assert.strictEqual(zeroPassport.reason, 'no_confirmed_transactions');
console.log('  ✓ zero confirmed transactions -> insufficient_data status, not a crash or a fake score');

// 2. Worker with confirmed transactions -> correct passport shape with all fields populated
const activeWorker = 'worker_passport_active_test';
const now = Math.floor(Date.now() / 1000);
const monthSeconds = 30 * 86400;

// Record confirmed transactions across 2 rails over recent months
recordTransaction({
  rail_id: 'rail_zepto_p1',
  worker_id: activeWorker,
  amount: 25000,
  credited_at: now - 90 * 86400,
  needs_review: false,
  note: 'payout',
});
recordTransaction({
  rail_id: 'rail_zepto_p1',
  worker_id: activeWorker,
  amount: 25000,
  credited_at: now - 60 * 86400,
  needs_review: false,
  note: 'payout',
});
recordTransaction({
  rail_id: 'rail_swiggy_p2',
  worker_id: activeWorker,
  amount: 15000,
  credited_at: now - 30 * 86400,
  needs_review: false,
  note: 'payout',
});

const passport = buildPassport(activeWorker);

assert.strictEqual(passport.worker_id, activeWorker);
assert.strictEqual(typeof passport.isi_score, 'number');
assert.ok(passport.isi_score >= 0 && passport.isi_score <= 100);
assert.ok(['high', 'medium', 'low'].includes(passport.confidence));
assert.strictEqual(passport.active_employer_count, 2);
assert.strictEqual(typeof passport.six_month_avg_income, 'number');
assert.ok(passport.six_month_avg_income > 0);
assert.deepStrictEqual(passport.weights_used, {
  regularity: 0.4,
  retention: 0.3,
  variance: 0.3,
});
assert.ok(passport.breakdown, 'breakdown object must be present');
assert.ok(passport.breakdown.regularity, 'breakdown.regularity must be present');
assert.ok(passport.breakdown.retention, 'breakdown.retention must be present');
assert.ok(passport.breakdown.variance, 'breakdown.variance must be present');
assert.ok(typeof passport.generated_at === 'string' && !isNaN(Date.parse(passport.generated_at)));

console.log('  ✓ confirmed worker -> correct passport shape with all fields populated');
console.log('✅ Unit test passed: Credit Passport assembly verified.');
