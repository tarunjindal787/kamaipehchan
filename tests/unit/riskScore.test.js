const assert = require('assert');
const { calculateRiskScore, WEIGHTS } = require('../../src/fraud/riskScore');

console.log('Running unit test: tests/unit/riskScore.test.js');

const NOT_SELF_PAY = { checked: true, isSelfPayment: false };
const NO_FLAGS = { flagged: false, flags: [] };
const HISTORY = [{ credited_at: 1 }, { credited_at: 2 }]; // non-empty rail history

// --- clean transaction: no signals -> 0, LOW, no factors ---
{
  const result = calculateRiskScore({ amount: 513700 }, HISTORY, NO_FLAGS, NOT_SELF_PAY);
  assert.strictEqual(result.risk_score, 0);
  assert.strictEqual(result.risk_level, 'LOW');
  assert.deepStrictEqual(result.contributing_factors, []);
  console.log('  ✓ clean transaction (no signals) -> risk_score 0, LOW, no contributing factors');
}

// --- self_payment_suspected: +50 individually ---
{
  const result = calculateRiskScore(
    { amount: 513700 },
    HISTORY,
    NO_FLAGS,
    { checked: true, isSelfPayment: true }
  );
  assert.strictEqual(result.risk_score, WEIGHTS.self_payment_suspected);
  assert.strictEqual(result.risk_score, 50);
  assert.strictEqual(result.risk_level, 'MEDIUM');
  assert.strictEqual(result.contributing_factors.length, 1);
  assert.strictEqual(result.contributing_factors[0].factor, 'self_payment_suspected');
  assert.strictEqual(result.contributing_factors[0].points, 50);
  console.log('  ✓ self_payment_suspected -> +50, MEDIUM');
}

// --- unnaturally_uniform_intervals: +30 individually ---
{
  const result = calculateRiskScore(
    { amount: 513700 },
    HISTORY,
    { flagged: true, flags: ['unnaturally_uniform_intervals'] },
    NOT_SELF_PAY
  );
  assert.strictEqual(result.risk_score, WEIGHTS.unnaturally_uniform_intervals);
  assert.strictEqual(result.risk_score, 30);
  assert.strictEqual(result.risk_level, 'LOW');
  assert.deepStrictEqual(result.contributing_factors.map((f) => f.factor), ['unnaturally_uniform_intervals']);
  console.log('  ✓ unnaturally_uniform_intervals -> +30, LOW');
}

// --- round_number_amount: +25 individually ---
{
  const result = calculateRiskScore(
    { amount: 500000 },
    HISTORY,
    { flagged: true, flags: ['round_number_amount'] },
    NOT_SELF_PAY
  );
  assert.strictEqual(result.risk_score, WEIGHTS.round_number_amount);
  assert.strictEqual(result.risk_score, 25);
  assert.strictEqual(result.risk_level, 'LOW');
  assert.deepStrictEqual(result.contributing_factors.map((f) => f.factor), ['round_number_amount']);
  console.log('  ✓ round_number_amount -> +25, LOW');
}

// --- first_payment_on_this_rail: empty rail history AND amount > Rs 25,000 -> +30 ---
{
  const result = calculateRiskScore({ amount: 2600000 }, [], NO_FLAGS, NOT_SELF_PAY);
  assert.strictEqual(result.risk_score, WEIGHTS.first_payment_on_this_rail);
  assert.strictEqual(result.risk_score, 30);
  assert.strictEqual(result.risk_level, 'LOW');
  assert.deepStrictEqual(result.contributing_factors.map((f) => f.factor), ['first_payment_on_this_rail']);
  console.log('  ✓ first_payment_on_this_rail (empty history, amount > Rs 25,000) -> +30, LOW');
}

// --- no_history_on_rail: empty rail history on its own (amount <= Rs 25,000) -> +15,
// and must NOT also fire first_payment_on_this_rail (same underlying signal) ---
{
  const result = calculateRiskScore({ amount: 2000000 }, [], NO_FLAGS, NOT_SELF_PAY);
  assert.strictEqual(result.risk_score, WEIGHTS.no_history_on_rail);
  assert.strictEqual(result.risk_score, 15);
  assert.strictEqual(result.risk_level, 'LOW');
  assert.deepStrictEqual(result.contributing_factors.map((f) => f.factor), ['no_history_on_rail']);
  console.log('  ✓ no_history_on_rail (empty history, amount <= Rs 25,000) -> +15, LOW, not double-counted with first_payment_on_this_rail');
}

// --- boundary at exactly Rs 25,000: not "> 2500000", so no_history_on_rail applies, not first_payment ---
{
  const result = calculateRiskScore({ amount: 2500000 }, [], NO_FLAGS, NOT_SELF_PAY);
  assert.deepStrictEqual(result.contributing_factors.map((f) => f.factor), ['no_history_on_rail']);
  console.log('  ✓ amount exactly Rs 25,000 with empty history -> no_history_on_rail, not first_payment_on_this_rail (threshold is strictly >)');
}

// --- risk_level MEDIUM boundary: two signals summing to exactly 40 ---
{
  // round_number_amount (25) + no_history_on_rail (15) = 40
  const result = calculateRiskScore(
    { amount: 2500000 }, // round AND empty-history-but-not-large-first-payment
    [],
    { flagged: true, flags: ['round_number_amount'] },
    NOT_SELF_PAY
  );
  assert.strictEqual(result.risk_score, 40);
  assert.strictEqual(result.risk_level, 'MEDIUM');
  console.log('  ✓ risk_score exactly 40 -> MEDIUM (>=40 threshold)');
}

// --- risk_level HIGH threshold: self_payment (50) + round_number (25) = 75 ---
{
  const result = calculateRiskScore(
    { amount: 500000 },
    HISTORY,
    { flagged: true, flags: ['round_number_amount'] },
    { checked: true, isSelfPayment: true }
  );
  assert.strictEqual(result.risk_score, 75);
  assert.strictEqual(result.risk_level, 'HIGH');
  assert.strictEqual(result.contributing_factors.length, 2);
  console.log('  ✓ risk_score 75 (self_payment + round_number) -> HIGH');
}

// --- cap at 100: stacking every independent factor exceeds 100 raw, capped ---
{
  // self_payment (50) + uniform_intervals (30) + round_number (25) + first_payment_on_this_rail (30) = 135 raw
  const result = calculateRiskScore(
    { amount: 2600000 }, // round? 2600000 % 100000 === 0 -> also round_number
    [], // empty history -> first_payment (amount > 2.5L)
    { flagged: true, flags: ['unnaturally_uniform_intervals', 'round_number_amount'] },
    { checked: true, isSelfPayment: true }
  );
  const rawSum = result.contributing_factors.reduce((s, f) => s + f.points, 0);
  assert.strictEqual(rawSum, 135, 'sanity check: uncapped factor sum should exceed 100');
  assert.strictEqual(result.risk_score, 100, 'risk_score must be capped at 100');
  assert.strictEqual(result.risk_level, 'HIGH');
  console.log('  ✓ stacked factors (135 raw) -> risk_score capped at 100, HIGH');
}

console.log('✅ Unit test passed: fraud risk score weighting, thresholds, and cap-at-100 all verified.');
