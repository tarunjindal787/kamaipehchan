const assert = require('assert');
const { normalizeTransaction } = require('../../src/webhooks/normalize');
const realCapturedEvent = require('../benchmark_payloads/real_test_mode/sample_credit_event.json');

console.log('Running unit test: tests/unit/normalize.test.js');

// virtual_account.credited shape - fields directly under payload.*
const vaEvent = {
  event: 'virtual_account.credited',
  payload: {
    virtual_account_id: 'va_test_1',
    worker_id: 'worker_test_1',
    amount: 600000,
    note: 'salary',
    credited_at: '2026-01-01T09:15:00Z',
  },
};

const vaResult = normalizeTransaction(vaEvent);
assert.strictEqual(vaResult.rail_id, 'va_test_1');
assert.strictEqual(vaResult.amount, 600000);
assert.strictEqual(vaResult.note, 'salary');
// credited_at must always come out as Unix seconds (a number), never the raw
// ISO string, so downstream scoring math can safely do arithmetic on it.
assert.strictEqual(typeof vaResult.credited_at, 'number');
assert.strictEqual(vaResult.credited_at, Math.floor(Date.parse('2026-01-01T09:15:00Z') / 1000));
assert.strictEqual(vaResult.worker_id, 'worker_test_1');
console.log('  ✓ virtual_account.credited shape normalizes correctly (credited_at converted to Unix seconds)');

// Real payment.captured sample (tests/benchmark_payloads/real_test_mode/sample_credit_event.json).
// KNOWN GAP: this sample predates reference_id-on-Payment-Link testing and has
// neither virtual_account_id nor reference_id, so rail_id is correctly null here.
// This documents the actual unresolved open question (does reference_id survive
// into a real webhook) rather than hiding it - still unconfirmed, blocked on
// real Razorpay keys and an actual paid Payment Link webhook capture.
const realResult = normalizeTransaction(realCapturedEvent);
assert.strictEqual(
  realResult.rail_id,
  null,
  'known gap: this real sample has no virtual_account_id or reference_id'
);
assert.strictEqual(realResult.amount, 50000);
assert.strictEqual(realResult.worker_id, 'WRK-001');
assert.strictEqual(realResult.note, '#TSYkTArzAN9AGy');
assert.strictEqual(realResult.credited_at, 1787346001);
assert.strictEqual(realResult.payer_identifier, '+917877722029', 'payer_identifier should come from the real contact field');
console.log(
  '  ✓ real payment.captured sample: amount/worker_id/note/credited_at extracted correctly; ' +
    'rail_id documented as null (known gap, not a bug - see comment above)'
);

// Hypothetical payment-link shape with reference_id present. No real webhook
// sample with this field exists yet, so this only proves the fallback logic
// itself is correct - NOT that a real Razorpay webhook actually looks like this.
const paymentLinkEvent = {
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: 'pay_hypothetical',
        amount: 50000,
        reference_id: 'PLINK_REF_12345',
        notes: { worker_id: 'worker_hypothetical' },
        created_at: 1787346001,
      },
    },
  },
};

const plResult = normalizeTransaction(paymentLinkEvent);
assert.strictEqual(plResult.rail_id, 'PLINK_REF_12345');
assert.strictEqual(plResult.amount, 50000);
assert.strictEqual(plResult.worker_id, 'worker_hypothetical');
console.log(
  '  ✓ hypothetical reference_id-bearing payload normalizes rail_id correctly ' +
    '(fallback logic only - untested against a real webhook)'
);

console.log(
  '✅ Unit test passed: normalizeTransaction covers virtual_account, real payment.captured, ' +
    'and reference_id shapes.'
);
