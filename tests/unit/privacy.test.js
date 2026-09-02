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
  income_shock: {
    shock_detected: true,
    severity: 'moderate',
    latest_month_income: 1200000,
    three_month_average: 2400000,
    drop_percentage: 50,
    risk_factors: [
      'Latest confirmed month (2026-06) income is 50% below the prior 3-month average.',
      'Rail RAIL_worker_private_EMP_SWIGGY had confirmed payments through 2026-05 but none in 2026-06.',
    ],
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
// pii_never_collected, not pii_stripped - buildPassport() never includes
// these fields to begin with, so nothing is actively removed here.
assert.deepStrictEqual(
  lenderView.privacy.pii_never_collected,
  ['phone', 'vpa_address', 'bank_account_number', 'raw_transaction_ids']
);
assert.strictEqual(lenderView.privacy.pii_stripped, undefined, 'the old, inaccurate field name must not reappear');

// Verify retention rails are masked - the employer name is intentionally
// preserved (see anonymizeRail's docstring), only the internal
// worker/rail identifier is replaced.
const maskedRailKeys = Object.keys(lenderView.breakdown.retention.retentionByRail);
assert.ok(maskedRailKeys.every((k) => k.startsWith('Verified Rail #')));
assert.ok(!maskedRailKeys.includes('RAIL_worker_private_EMP_ZEPTO'));
assert.ok(maskedRailKeys.some((k) => k.includes('(ZEPTO)')), 'employer name should survive the masking, by design');
console.log('  ✓ lender view masks internal rail identifiers (employer name intentionally preserved), attaches income band, states pii_never_collected accurately');

// income_shock.risk_factors can name a raw rail_id (src/scoring/incomeShock.js) -
// the lender view must mask it the same way retentionByRail is masked, not
// leak it through as plain text.
assert.strictEqual(lenderView.income_shock.shock_detected, true);
assert.strictEqual(lenderView.income_shock.severity, 'moderate');
const maskedRiskFactor = lenderView.income_shock.risk_factors[1];
assert.ok(!maskedRiskFactor.includes('RAIL_worker_private_EMP_SWIGGY'), 'raw rail_id must not leak into the lender view via risk_factors text');
assert.ok(maskedRiskFactor.includes('(SWIGGY)'), 'employer name should survive masking, same as retentionByRail');
console.log('  ✓ lender view masks raw rail_id references embedded in income_shock.risk_factors text');

// 4. Worker full view retains unredacted data
const workerView = redactPassport(samplePassport, 'worker');
assert.strictEqual(workerView.view_mode, 'worker_full');
assert.ok(workerView.breakdown.retention.retentionByRail['RAIL_worker_private_EMP_ZEPTO']);
assert.ok(
  workerView.income_shock.risk_factors[1].includes('RAIL_worker_private_EMP_SWIGGY'),
  'worker view is unredacted, so the raw rail_id should be untouched'
);
console.log('  ✓ worker view retains full internal breakdown for worker self-inspection');

// 5. Insufficient data passthrough
const emptyPassport = { worker_id: 'worker_0', isi_score: null, status: 'insufficient_data' };
assert.strictEqual(redactPassport(emptyPassport, 'lender').status, 'insufficient_data');
console.log('  ✓ insufficient_data passports pass through untouched without errors');

console.log('✅ Unit test passed: Privacy and selective disclosure layer verified.');
