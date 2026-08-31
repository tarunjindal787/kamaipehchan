const assert = require('assert');
const crypto = require('crypto');

// Fixed test secret, set before any require pulls in config/env.js - dotenv
// only fills in vars that aren't already set, so this stays deterministic
// regardless of what's actually in .env (same pattern as llmClassifier.test.js).
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_for_dedup_test';

const config = require('../../src/config/env');
const { razorpayWebhookHandler } = require('../../src/webhooks/razorpayWebhookHandler');
const { getOrCreateClassification } = require('../../src/webhooks/classificationDedup');
const { getHistory } = require('../../src/db/transactionStore');

console.log('Running unit test: tests/unit/webhookHandler.test.js');

function sign(rawBody) {
  return crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
}

function makeReq(eventBody) {
  const rawBody = JSON.stringify(eventBody);
  return { headers: { 'x-razorpay-signature': sign(rawBody) }, rawBody, body: eventBody };
}

function makeRes() {
  const res = { statusCode: null, jsonBody: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.jsonBody = body;
    return res;
  };
  return res;
}

function captureLogs(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  return fn().finally(() => {
    console.log = original;
  }).then((result) => ({ result, lines }));
}

// Reproduces the exact real scenario (Day 6 real deployment run): the same
// payment ID arrives twice, once as payment.captured and once as
// payment_link.paid - a "salary" note routes both through the deterministic
// classifier (instant, no real LLM call, no reliance on network/credentials).
const PAYMENT_ID = 'pay_test_dedup_001';
const RAIL_ID = 'worker_test_dedup_TESTEMP'; // notes.worker_id + '_' + notes.employer_ref

const paymentCapturedEvent = {
  event: 'payment.captured',
  payload: {
    payment: {
      entity: {
        id: PAYMENT_ID,
        amount: 100,
        notes: { worker_id: 'worker_test_dedup', employer_ref: 'TESTEMP', note: 'salary' },
        created_at: 1700000000,
      },
    },
  },
};

const paymentLinkPaidEvent = {
  event: 'payment_link.paid',
  payload: {
    payment: {
      entity: {
        id: PAYMENT_ID,
        amount: 100,
        notes: { worker_id: 'worker_test_dedup', employer_ref: 'TESTEMP', note: 'salary' },
        created_at: 1700000000,
      },
    },
    payment_link: {
      entity: { reference_id: 'RAIL_worker_test_dedup_EMP_TESTEMP', status: 'paid' },
    },
  },
};

async function run() {
  // 1. First event: real classification runs.
  const res1 = makeRes();
  await razorpayWebhookHandler(makeReq(paymentCapturedEvent), res1);
  assert.strictEqual(res1.statusCode, 200);
  assert.strictEqual(res1.jsonBody.classification.label, 'recurring_wage');
  assert.strictEqual(res1.jsonBody.classification.path, 'deterministic');
  console.log('  ✓ first event (payment.captured) classifies for real');

  // 2. Second event, same payment ID, different event type: eventDedup must
  // NOT treat it as a duplicate (it's a genuinely different event type -
  // the Day 6 fix), but classification must be skipped and reused.
  const { result: res2, lines } = await captureLogs(async () => {
    const res = makeRes();
    await razorpayWebhookHandler(makeReq(paymentLinkPaidEvent), res);
    return res;
  });
  assert.strictEqual(res2.statusCode, 200);
  assert.ok(
    lines.some((l) => l.includes('Verified event received')),
    'second event must still be logged as verified, not silently eventId-deduped'
  );
  assert.ok(
    lines.some((l) => l.includes('already classified by an earlier event')),
    'second event must log that classification was skipped and reused'
  );
  assert.deepStrictEqual(
    res2.jsonBody.classification,
    res1.jsonBody.classification,
    'second event must reuse the exact first classification result'
  );
  console.log('  ✓ second event (payment_link.paid) reuses the existing result, does not re-classify');

  // 3. The transaction store proves only ONE recordTransaction call happened
  // for this rail, not two - the actual bug this fix closes.
  assert.strictEqual(
    getHistory(RAIL_ID).length,
    1,
    'the same real payment must only be recorded once, regardless of how many event types fired for it'
  );
  console.log('  ✓ transactionStore has exactly one entry for this rail - no double-counting');

  // 4. classification log lines now carry a payment/event correlation ID
  // (the observability gap flagged during the Day 6 deployed-instance test).
  const { lines: firstEventLines } = await captureLogs(async () => {
    const res = makeRes();
    await razorpayWebhookHandler(
      makeReq({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_correlation_002',
              amount: 100,
              notes: { worker_id: 'worker_test_correlation', employer_ref: 'TESTEMP2', note: 'wages' },
              created_at: 1700000001,
            },
          },
        },
      }),
      res
    );
    return res;
  });
  assert.ok(
    firstEventLines.some((l) => l.includes('Classification (payment=pay_test_correlation_002 event=payment.captured)')),
    'classification log line must include the payment ID and event type for correlation'
  );
  console.log('  ✓ classification log lines carry payment/event correlation IDs');

  // 5. classificationDedup module in isolation: concurrent calls with the
  // same payment ID must invoke computeFn exactly once and both resolve to
  // the same value - this is what actually closes the real race (both
  // real webhook deliveries logged "Verified event received" back-to-back,
  // long before either classification call had resolved).
  let computeCalls = 0;
  const slowCompute = () =>
    new Promise((resolve) => {
      computeCalls += 1;
      setTimeout(() => resolve({ value: 'computed-once' }), 20);
    });

  const first = getOrCreateClassification('pay_race_test', slowCompute);
  const second = getOrCreateClassification('pay_race_test', slowCompute);
  assert.strictEqual(first.reused, false);
  assert.strictEqual(second.reused, true);
  const [r1, r2] = await Promise.all([first.promise, second.promise]);
  assert.strictEqual(computeCalls, 1, 'computeFn must only run once for concurrent calls with the same payment ID');
  assert.deepStrictEqual(r1, r2);
  console.log('  ✓ classificationDedup closes the concurrent race - one real computation, both callers get the same result');

  // 6. A failed classification must not permanently poison the payment ID -
  // a later event for the same payment should be able to retry.
  let failThenSucceedCalls = 0;
  const failThenSucceed = () => {
    failThenSucceedCalls += 1;
    if (failThenSucceedCalls === 1) return Promise.reject(new Error('simulated failure'));
    return Promise.resolve({ value: 'succeeded-on-retry' });
  };

  await assert.rejects(getOrCreateClassification('pay_retry_test', failThenSucceed).promise);
  const retried = await getOrCreateClassification('pay_retry_test', failThenSucceed).promise;
  assert.strictEqual(failThenSucceedCalls, 2, 'a failed classification must allow a later event to retry');
  assert.deepStrictEqual(retried, { value: 'succeeded-on-retry' });
  console.log('  ✓ a failed classification does not permanently block retries for the same payment ID');

  console.log('✅ Unit test passed: double-classification fix verified end-to-end, matching the real Day 6 deployment scenario.');
}

run().catch((err) => {
  console.error('❌ Webhook handler dedup test failed:', err);
  process.exit(1);
});
