const assert = require('assert');
const { calculateRegularity } = require('../../src/scoring/regularity');
const { calculateRetention } = require('../../src/scoring/employerRetention');
const { recordTransaction, getConfirmedTransactionsByWorker } = require('../../src/db/transactionStore');

console.log('Running unit test: tests/unit/scoring.test.js');

const DAY = 86400;
const BASE_TS = 1700000000;

// --- calculateRegularity: consistent monthly interval -> high score ---
const consistent = [
  { credited_at: BASE_TS },
  { credited_at: BASE_TS + 30 * DAY },
  { credited_at: BASE_TS + 60 * DAY },
];
const consistentResult = calculateRegularity(consistent);
assert.strictEqual(consistentResult.score, 100);
assert.strictEqual(consistentResult.confidence, 'high');
assert.strictEqual(consistentResult.sampleSize, 3);
assert.strictEqual(consistentResult.meanIntervalDays, 30);
console.log('  ✓ consistent monthly intervals -> score 100, confidence high');

// --- calculateRegularity: erratic intervals -> low score ---
const erratic = [
  { credited_at: BASE_TS },
  { credited_at: BASE_TS + 5 * DAY },
  { credited_at: BASE_TS + 65 * DAY },
  { credited_at: BASE_TS + 75 * DAY },
];
const erraticResult = calculateRegularity(erratic);
assert.ok(erraticResult.score < 20, `expected a low score for erratic intervals, got ${erraticResult.score}`);
assert.strictEqual(erraticResult.confidence, 'high');
assert.strictEqual(erraticResult.sampleSize, 4);
console.log(`  ✓ erratic intervals -> low score (${erraticResult.score})`);

// --- calculateRegularity: single transaction -> insufficient_history ---
const single = [{ credited_at: BASE_TS }];
const singleResult = calculateRegularity(single);
assert.deepStrictEqual(singleResult, {
  score: 0,
  confidence: 'low',
  reason: 'insufficient_history',
  sampleSize: 1,
});
console.log('  ✓ single transaction -> insufficient_history');

// --- calculateRetention: 3 employer rails with different tenures ---
const confirmedTransactionsByRail = {
  rail_A: [
    { credited_at: BASE_TS },
    { credited_at: BASE_TS + 30 * DAY },
    { credited_at: BASE_TS + 60 * DAY },
  ],
  rail_B: [
    { credited_at: BASE_TS },
    { credited_at: BASE_TS + 180 * DAY },
  ],
  rail_C: [{ credited_at: BASE_TS }],
};
const retentionResult = calculateRetention(confirmedTransactionsByRail);
assert.strictEqual(retentionResult.activeEmployerCount, 3);
assert.deepStrictEqual(retentionResult.retentionByRail.rail_A, { monthsActive: 2, transactionCount: 3 });
assert.deepStrictEqual(retentionResult.retentionByRail.rail_B, { monthsActive: 6, transactionCount: 2 });
assert.deepStrictEqual(retentionResult.retentionByRail.rail_C, { monthsActive: 1, transactionCount: 1 });
assert.strictEqual(retentionResult.avgMonthsRetained, 3);
console.log('  ✓ 3 employer rails with different tenures -> correct activeEmployerCount and per-rail months');

// --- getConfirmedTransactionsByWorker: Section 7 safeguard ---
// Must be tested directly, not just added: an unconfirmed (needs_review)
// transaction must never come back from this function.
const SCORING_WORKER = 'worker_scoring_test';
recordTransaction({
  rail_id: 'va_scoring_test_1',
  worker_id: SCORING_WORKER,
  amount: 600000,
  note: 'salary',
  credited_at: BASE_TS,
  needs_review: false,
  label: 'recurring_wage',
});
recordTransaction({
  rail_id: 'va_scoring_test_1',
  worker_id: SCORING_WORKER,
  amount: 5000,
  note: 'gift',
  credited_at: BASE_TS + 10 * DAY,
  needs_review: true,
  label: null,
});
recordTransaction({
  rail_id: 'va_scoring_test_2',
  worker_id: SCORING_WORKER,
  amount: 300000,
  note: 'gig payout',
  credited_at: BASE_TS + 20 * DAY,
  needs_review: false,
  label: 'gig_payout',
});

const confirmed = getConfirmedTransactionsByWorker(SCORING_WORKER);
assert.strictEqual(confirmed.length, 2, 'expected only the 2 confirmed transactions, not the needs_review one');
assert.ok(
  confirmed.every((t) => t.needs_review === false),
  'getConfirmedTransactionsByWorker must never return a needs_review transaction'
);
assert.deepStrictEqual(
  confirmed.map((t) => t.amount).sort(),
  [300000, 600000],
  'expected exactly the two confirmed amounts, excluding the needs_review one'
);
console.log('  ✓ getConfirmedTransactionsByWorker excludes needs_review transactions (Section 7 safeguard)');

console.log('✅ Unit test passed: regularity, retention, and confirmed-only filter all verified.');
