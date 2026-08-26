const assert = require('assert');
const { redactPassport, getIncomeBand, anonymizeRail } = require('../../src/privacy/redactPassport');

console.log('Running unit test: tests/unit/privacy.test.js');

// 1. Income band mapping tests
assert.strictEqual(getIncomeBand(null), 'No Verified Income History');
assert.strictEqual(getIncomeBand(800000), 'Under ₹10,000 / month'); // ₹8,000
assert.strictEqual(getIncomeBand(1800000), '₹10,000 - ₹25,000 / month'); // ₹18,000
assert.strictEqual(getIncomeBand(3500000), '₹25,000 - ₹50,000 / month'); // ₹35,000
assert.strictEqual(getIncomeBand(7500000), '₹50,000 - ₹1,00,000 / month'); // ₹75,000
assert.strictEqual(getIncomeBand(15000000), '₹1,00,000+ / month'); // ₹1,50,000
console.log('  ✓ getIncomeBand maps numeric paise into standardized credit brackets');

// 2. Anonymize rail identifiers
assert.strictEqual(anonymizeRail('RAIL_worker1_EMP_ZEPTO', 0), 'Verified Rail #1 (ZEPTO)');
assert.strictEqual(anonymizeRail('custom_rail_123', 1), 'Verified Rail #2');
console.log('  ✓ anonymizeRail masks internal IDs into standardized tokens');

// 3. Redact passport for lender view
const samplePassport = {
  worker_id: 'worker_privacy_test_1',
  isi_score: 88,
  confidence: 'high',
  active_employer_count: 2,
  six_month_avg_income: 2400000, // ₹24,000
  weights_used: { regularity: 0.4, retention: 0.3, variance: 0.3 },
  breakdown: {
    regularity: { score: 90, meanIntervalDays: 7, stdDevDays: 1, confidence: 'high' },
    retention: {
      score: 85,
      activeEmployerCount: 2,
      avgMonthsRetained: 6,
      retentionByRail: {
        'RAIL_worker_private_EMP_ZEPTO': { monthsActive: 6, transactionCount: 24 },
        'RAIL_worker_private_EMP_SWIGGY': { monthsActive: 5, transactionCount: 20 },
      },
    },
    variance: { score: 89, avgMonthlyIncome: 2400000, monthsObserved: 6, confidence: 'high' },
  },
  generated_at: new Date().toISOString(),
};

const lenderView = redactPassport(samplePassport, 'lender');
assert.strictEqual(lenderView.worker_id, 'worker_privacy_test_1');
assert.strictEqual(lenderView.isi_score, 88);
assert.strictEqual(lenderView.confidence, 'high');
assert.strictEqual(lenderView.income_band, '₹10,000 - ₹25,000 / month');
assert.strictEqual(lenderView.six_month_avg_income_inr, 24000);
assert.strictEqual(lenderView.privacy.redacted, true);
assert.strictEqual(lenderView.privacy.view_mode, 'lender_underwriting');

// Verify retention rails are masked
const maskedRailKeys = Object.keys(lenderView.breakdown.retention.retentionByRail);
assert.ok(maskedRailKeys.every((k) => k.startsWith('Verified Rail #')));
assert.ok(!maskedRailKeys.includes('RAIL_worker_private_EMP_ZEPTO'));
console.log('  ✓ lender view redacts raw rail identifiers, attaches income band, and masks PII');

// 4. Worker full view retains unredacted data
const workerView = redactPassport(samplePassport, 'worker');
assert.strictEqual(workerView.view_mode, 'worker_full');
assert.ok(workerView.breakdown.retention.retentionByRail['RAIL_worker_private_EMP_ZEPTO']);
console.log('  ✓ worker view retains full internal breakdown for worker self-inspection');

// 5. Insufficient data passthrough
const emptyPassport = { worker_id: 'worker_0', isi_score: null, status: 'insufficient_data' };
assert.strictEqual(redactPassport(emptyPassport, 'lender').status, 'insufficient_data');
console.log('  ✓ insufficient_data passports pass through untouched without errors');

console.log('✅ Unit test passed: Privacy and selective disclosure layer verified.');
