const assert = require('assert');
const { normalizeTransaction } = require('../../src/webhooks/normalize');
const realCapturedEvent = require('../benchmark_payloads/real_test_mode/sample_credit_event.json');
const referenceIdTestEvent = require('../benchmark_payloads/real_test_mode/payment_link_reference_id_test.json');
const paymentLinkPaidRealEvent = require('../benchmark_payloads/real_test_mode/payment_link_paid_real_event.json');

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

// Real payment.captured sample (tests/benchmark_payloads/real_test_mode/sample_credit_event.json,
// captured 2026-08-22). This one predates any employer_ref in its notes
// (just gig_type/worker_id/worker_name), so it still has nothing for the
// composite fallback to build from - rail_id is correctly null here too,
// for a different reason than it used to be (see below - reference_id
// itself is now confirmed to never appear on payment.captured at all).
const realResult = normalizeTransaction(realCapturedEvent);
assert.strictEqual(
  realResult.rail_id,
  null,
  'this specific sample has no virtual_account_id, reference_id, or notes.employer_ref'
);
assert.strictEqual(realResult.amount, 50000);
assert.strictEqual(realResult.worker_id, 'WRK-001');
assert.strictEqual(realResult.note, '#TSYkTArzAN9AGy');
assert.strictEqual(realResult.credited_at, 1787346001);
assert.strictEqual(realResult.payer_identifier, '+917877722029', 'payer_identifier should come from the real contact field');
console.log(
  '  ✓ real payment.captured sample (2026-08-22): amount/worker_id/note/credited_at extracted correctly; ' +
    'rail_id null (this sample predates notes.employer_ref, not a bug)'
);

// Real paid Payment Link webhook (tests/benchmark_payloads/real_test_mode/
// payment_link_reference_id_test.json, captured 2026-08-30) - a genuine
// end-to-end test: registered a real worker, created a real employer
// Payment Link via /worker/:workerId/employer, paid it with a real test
// card, captured the actual payment.captured webhook. THE DAY 1 QUESTION
// IS NOW CLOSED: reference_id does not appear anywhere in
// payload.payment.entity for a real payment.captured event, confirmed
// directly from this raw payload, not inferred. notes.worker_id and
// notes.employer_ref are what's actually load-bearing, since we set
// those ourselves at Payment Link creation - that's what the composite
// rail_id fallback in normalize.js now uses.
const referenceIdTestResult = normalizeTransaction(referenceIdTestEvent);
assert.strictEqual(
  referenceIdTestEvent.payload.payment.entity.reference_id,
  undefined,
  'confirms reference_id is genuinely absent from the raw payload, not just unread'
);
assert.strictEqual(referenceIdTestResult.rail_id, 'worker_4f85989b_ZEPTO');
assert.strictEqual(referenceIdTestResult.worker_id, 'worker_4f85989b');
assert.strictEqual(referenceIdTestResult.amount, 100);
console.log(
  '  ✓ real paid Payment Link webhook (2026-08-30): reference_id confirmed absent from ' +
    'payload.payment.entity; rail_id resolves via the notes-based composite fallback ' +
    '("worker_4f85989b_ZEPTO") instead of null - closes the gap open since Day 1'
);

// Hypothetical payment-link shape with reference_id present. Kept to prove
// the reference_id fallback tier itself is implemented correctly, in case
// a future event type (e.g. payment_link.paid, still unverified as of
// 2026-08-30 - see docs/DATA_SCHEMAS.md) does carry it on
// payload.payment_link.entity rather than payload.payment.entity.
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
    '(fallback logic only - reference_id itself is confirmed absent in practice)'
);

// Real payment_link.paid webhook (tests/benchmark_payloads/real_test_mode/
// payment_link_paid_real_event.json, captured live 2026-08-31 for
// pay_TWHdBlsg5L3TGm / RAIL_worker_973712b5_EMP_ZEPTOTESTDEPLOY) - the
// event this composite fallback was originally built for actually DOES
// carry reference_id, just on payload.payment_link.entity, a sibling of
// payload.payment.entity that normalizeTransaction never read. Confirms
// rail_id now resolves directly from that field for payment_link.paid,
// not the notes-based composite (which would produce a different string:
// "worker_973712b5_ZEPTOTESTDEPLOY", not "RAIL_worker_973712b5_EMP_ZEPTOTESTDEPLOY").
assert.strictEqual(
  paymentLinkPaidRealEvent.payload.payment_link.entity.reference_id,
  'RAIL_worker_973712b5_EMP_ZEPTOTESTDEPLOY',
  'sanity check: the fixture actually carries the real confirmed reference_id'
);
const paymentLinkPaidResult = normalizeTransaction(paymentLinkPaidRealEvent);
assert.strictEqual(
  paymentLinkPaidResult.rail_id,
  'RAIL_worker_973712b5_EMP_ZEPTOTESTDEPLOY',
  'rail_id must come directly from payload.payment_link.entity.reference_id, not the notes-based composite fallback'
);
assert.notStrictEqual(
  paymentLinkPaidResult.rail_id,
  'worker_973712b5_ZEPTOTESTDEPLOY',
  'must not silently fall back to the composite format when the real reference_id is present'
);
assert.strictEqual(paymentLinkPaidResult.worker_id, 'worker_973712b5');
assert.strictEqual(paymentLinkPaidResult.amount, 100);
console.log(
  '  ✓ real payment_link.paid webhook (2026-08-31): rail_id resolves directly from ' +
    'payload.payment_link.entity.reference_id, not the notes-based composite fallback'
);

console.log(
  '✅ Unit test passed: normalizeTransaction covers virtual_account, real payment.captured ' +
    '(including the real reference_id-investigation payload), the real payment_link.paid ' +
    'direct reference_id read, and the notes-based fallback.'
);
