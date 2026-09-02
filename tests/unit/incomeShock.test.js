const assert = require('assert');
const { detectIncomeShock, MODERATE_DROP_THRESHOLD, SEVERE_DROP_THRESHOLD, MIN_MONTHS_REQUIRED } = require('../../src/scoring/incomeShock');

console.log('Running unit test: tests/unit/incomeShock.test.js');

// Builds a UTC timestamp for `monthsAgo` calendar months before the real
// current month (monthsAgo=1 is the most recent COMPLETE month, monthsAgo=0
// is the current, in-progress month). Anchoring to the real "now" the same
// way fraud.test.js and passport.test.js do, rather than a fixed date, so
// this test stays valid regardless of when it's actually run.
function monthsAgoTimestamp(monthsAgo, day = 15) {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, day, 12, 0, 0));
  return Math.floor(d.getTime() / 1000);
}

function txn(monthsAgo, amount, rail_id = 'rail_shock_default') {
  return { rail_id, amount, credited_at: monthsAgoTimestamp(monthsAgo) };
}

// --- clean no-risk case: 4 stable months -> no shock, quiet risk_factors ---
{
  const transactions = [
    txn(4, 1000000),
    txn(3, 1000000),
    txn(2, 1000000),
    txn(1, 1000000),
  ];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.shock_detected, false);
  assert.strictEqual(result.severity, 'none');
  assert.strictEqual(result.latest_month_income, 1000000);
  assert.strictEqual(result.three_month_average, 1000000);
  assert.strictEqual(result.drop_percentage, 0);
  assert.deepStrictEqual(result.risk_factors, []);
  console.log('  ✓ 4 stable months -> shock_detected false, severity none, quiet risk_factors');
}

// --- insufficient history: fewer than 4 complete months -> honest 'none', not a silent false ---
{
  const transactions = [txn(3, 1000000), txn(2, 1000000), txn(1, 1000000)];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.shock_detected, false);
  assert.strictEqual(result.severity, 'none');
  assert.strictEqual(result.latest_month_income, null);
  assert.strictEqual(result.three_month_average, null);
  assert.strictEqual(result.drop_percentage, null);
  assert.strictEqual(result.risk_factors.length, 1);
  assert.ok(/insufficient history/i.test(result.risk_factors[0]), 'must explain insufficient history, not silently claim no shock');
  console.log(`  ✓ only 3 complete months -> severity none with an explanatory risk_factor (MIN_MONTHS_REQUIRED=${MIN_MONTHS_REQUIRED})`);
}

// --- zero transactions -> same honest insufficient-history path, no crash ---
{
  const result = detectIncomeShock([]);
  assert.strictEqual(result.shock_detected, false);
  assert.strictEqual(result.severity, 'none');
  assert.ok(/insufficient history/i.test(result.risk_factors[0]));
  console.log('  ✓ zero transactions -> insufficient history, no crash');
}

// --- the in-progress current month must never count as the "latest complete month" ---
{
  const transactions = [
    txn(4, 1000000),
    txn(3, 1000000),
    txn(2, 1000000),
    txn(1, 1000000),
    txn(0, 50), // current, in-progress month - should be ignored entirely
  ];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.latest_month_income, 1000000, 'the partial current month must not be treated as the latest complete month');
  assert.strictEqual(result.shock_detected, false);
  console.log('  ✓ in-progress current month is excluded from "latest complete month"');
}

// --- moderate severity: drop > 40% and <= 60% ---
{
  const transactions = [
    txn(4, 1000000),
    txn(3, 1000000),
    txn(2, 1000000),
    txn(1, 550000), // 45% drop from a 1,000,000 average
  ];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.three_month_average, 1000000);
  assert.strictEqual(result.latest_month_income, 550000);
  assert.strictEqual(result.drop_percentage, 45);
  assert.strictEqual(result.severity, 'moderate');
  assert.strictEqual(result.shock_detected, true);
  assert.ok(result.risk_factors.length >= 1);
  assert.ok(result.risk_factors[0].includes('45%'));
  console.log('  ✓ 45% drop -> moderate severity, shock_detected true');
}

// --- moderate/none boundary: exactly 40% drop must stay 'none' (threshold is strictly >40) ---
{
  const transactions = [
    txn(4, 1000000),
    txn(3, 1000000),
    txn(2, 1000000),
    txn(1, 600000), // exactly 40% drop
  ];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.drop_percentage, MODERATE_DROP_THRESHOLD);
  assert.strictEqual(result.severity, 'none');
  assert.strictEqual(result.shock_detected, false);
  console.log('  ✓ drop_percentage exactly 40% -> severity none (threshold is strictly greater-than)');
}

// --- moderate/none boundary: just over 40% crosses into moderate ---
{
  const transactions = [
    txn(4, 1000000),
    txn(3, 1000000),
    txn(2, 1000000),
    txn(1, 599000), // 40.1% drop
  ];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.drop_percentage, 40.1);
  assert.strictEqual(result.severity, 'moderate');
  console.log('  ✓ drop_percentage 40.1% -> severity moderate');
}

// --- severe/moderate boundary: exactly 60% drop must stay 'moderate' (threshold is strictly >60) ---
{
  const transactions = [
    txn(4, 1000000),
    txn(3, 1000000),
    txn(2, 1000000),
    txn(1, 400000), // exactly 60% drop
  ];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.drop_percentage, SEVERE_DROP_THRESHOLD);
  assert.strictEqual(result.severity, 'moderate');
  console.log('  ✓ drop_percentage exactly 60% -> severity moderate (threshold is strictly greater-than)');
}

// --- severe severity: drop > 60% ---
{
  const transactions = [
    txn(4, 1000000),
    txn(3, 1000000),
    txn(2, 1000000),
    txn(1, 300000), // 70% drop
  ];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.drop_percentage, 70);
  assert.strictEqual(result.severity, 'severe');
  assert.strictEqual(result.shock_detected, true);
  console.log('  ✓ 70% drop -> severe severity, shock_detected true');
}

// --- risk_factors cite a specific rail only when the data actually shows it stopped ---
{
  const transactions = [
    txn(4, 500000, 'rail_shock_A'),
    txn(4, 500000, 'rail_shock_B'),
    txn(3, 500000, 'rail_shock_A'),
    txn(3, 500000, 'rail_shock_B'),
    txn(2, 500000, 'rail_shock_A'),
    txn(2, 500000, 'rail_shock_B'),
    // rail_shock_A stops paying; rail_shock_B keeps paying at the same rate
    txn(1, 500000, 'rail_shock_B'),
  ];
  const result = detectIncomeShock(transactions);
  assert.strictEqual(result.three_month_average, 1000000); // A+B combined, 500000 each
  assert.strictEqual(result.latest_month_income, 500000); // only B
  assert.strictEqual(result.drop_percentage, 50);
  assert.strictEqual(result.severity, 'moderate');
  const railFactor = result.risk_factors.find((f) => f.includes('rail_shock_A'));
  assert.ok(railFactor, 'expected a risk_factor specifically citing rail_shock_A as having stopped paying');
  assert.ok(!result.risk_factors.some((f) => f.includes('rail_shock_B')), 'rail_shock_B kept paying and must not be cited as a cause');
  console.log('  ✓ risk_factors cite the specific rail that stopped paying, not the one that kept paying');
}

console.log('✅ Unit test passed: income shock detection, severity thresholds, and insufficient-history handling all verified.');
