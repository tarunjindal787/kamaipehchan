const assert = require('assert');
const {
  recordTransaction,
  getTransactionsByWorker,
  getConfirmedTransactionsByWorker,
  getConfirmedIncomeTransactionsByWorker,
} = require('../../src/db/transactionStore');
const { registerWorker } = require('../../src/db/workerRegistry');
const { sendConfirmationPrompt, isTwilioConfigured } = require('../../src/worker/notifier');
const { handleConfirmationReply } = require('../../src/worker/confirmationHandler');

console.log('Running unit test: tests/unit/confirmationFlow.test.js');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    send(data) { this.body = data; return this; },
  };
}

const now = Math.floor(Date.now() / 1000);

async function run() {
  // --- 1. getConfirmedIncomeTransactionsByWorker excludes one_off_transfer
  // even when needs_review is false (the step-1 bug fix) ---
  const INCOME_FILTER_WORKER = 'worker_income_filter_test';
  recordTransaction({
    rail_id: 'rail_income_filter_1',
    worker_id: INCOME_FILTER_WORKER,
    amount: 500000,
    note: 'personal loan repayment',
    credited_at: now,
    needs_review: false,
    label: 'one_off_transfer',
  });

  assert.strictEqual(
    getConfirmedIncomeTransactionsByWorker(INCOME_FILTER_WORKER).length,
    0,
    'a confirmed one_off_transfer must not count as income'
  );
  assert.strictEqual(
    getConfirmedTransactionsByWorker(INCOME_FILTER_WORKER).length,
    1,
    'the old getConfirmedTransactionsByWorker must still return it - label-blind by design'
  );
  console.log('  ✓ getConfirmedIncomeTransactionsByWorker excludes one_off_transfer despite needs_review: false');

  // --- 2. reply "1" -> resolves to suspected_label, needs_review false ---
  // Phone number now comes from the worker identity registry, not worker_id -
  // register an identity first so sendConfirmationPrompt actually creates a
  // pending entry (it no longer does so without a real phone on file).
  const REPLY_1_WORKER = 'worker_reply_1_test';
  const REPLY_1_PHONE = '+910000000001';
  registerWorker(REPLY_1_WORKER, { phone: REPLY_1_PHONE });
  await sendConfirmationPrompt(
    { rail_id: 'rail_reply_1', worker_id: REPLY_1_WORKER, amount: 500000, note: '', credited_at: now },
    { label: 'needs_review', original_label: 'recurring_wage' }
  );

  const res1 = mockRes();
  handleConfirmationReply({ body: { From: REPLY_1_PHONE, Body: '1' } }, res1);

  const resolved1 = getTransactionsByWorker(REPLY_1_WORKER).find((t) => t.confirmed_via_reply);
  assert.ok(resolved1, 'expected a confirmed_via_reply transaction after reply "1"');
  assert.strictEqual(resolved1.label, 'recurring_wage');
  assert.strictEqual(resolved1.needs_review, false);
  assert.strictEqual(res1.statusCode, 200);
  console.log('  ✓ reply "1" -> resolves to suspected_label ("recurring_wage"), needs_review: false');

  // --- 3. reply "2" -> resolves to one_off_transfer, excluded from income
  // despite needs_review: false ---
  const REPLY_2_WORKER = 'worker_reply_2_test';
  const REPLY_2_PHONE = '+910000000002';
  registerWorker(REPLY_2_WORKER, { phone: REPLY_2_PHONE });
  await sendConfirmationPrompt(
    { rail_id: 'rail_reply_2', worker_id: REPLY_2_WORKER, amount: 500000, note: '', credited_at: now },
    { label: 'needs_review', original_label: 'recurring_wage' }
  );

  const res2 = mockRes();
  handleConfirmationReply({ body: { From: REPLY_2_PHONE, Body: '2' } }, res2);

  const resolved2 = getTransactionsByWorker(REPLY_2_WORKER).find((t) => t.confirmed_via_reply);
  assert.ok(resolved2, 'expected a confirmed_via_reply transaction after reply "2"');
  assert.strictEqual(resolved2.label, 'one_off_transfer');
  assert.strictEqual(resolved2.needs_review, false);
  assert.strictEqual(
    getConfirmedIncomeTransactionsByWorker(REPLY_2_WORKER).length,
    0,
    'one_off_transfer must be excluded from income transactions despite needs_review: false'
  );
  console.log('  ✓ reply "2" -> resolves to one_off_transfer, excluded from income transactions');

  // --- 4. unrecognized reply -> transaction stays pending (not resolved) ---
  const UNRECOGNIZED_WORKER = 'worker_unrecognized_reply_test';
  const UNRECOGNIZED_PHONE = '+910000000003';
  registerWorker(UNRECOGNIZED_WORKER, { phone: UNRECOGNIZED_PHONE });
  await sendConfirmationPrompt(
    { rail_id: 'rail_unrecognized', worker_id: UNRECOGNIZED_WORKER, amount: 500000, note: '', credited_at: now },
    { label: 'needs_review', original_label: 'gig_payout' }
  );

  const resGarbage = mockRes();
  handleConfirmationReply({ body: { From: UNRECOGNIZED_PHONE, Body: 'maybe?' } }, resGarbage);
  assert.strictEqual(resGarbage.statusCode, 200);
  assert.strictEqual(
    getTransactionsByWorker(UNRECOGNIZED_WORKER).some((t) => t.confirmed_via_reply),
    false,
    'an unrecognized reply must not resolve anything'
  );

  // Prove it actually stayed pending (not silently dropped): a valid reply
  // sent right after must still resolve it.
  const resValidFollowUp = mockRes();
  handleConfirmationReply({ body: { From: UNRECOGNIZED_PHONE, Body: '1' } }, resValidFollowUp);
  const resolvedAfterGarbage = getTransactionsByWorker(UNRECOGNIZED_WORKER).find((t) => t.confirmed_via_reply);
  assert.ok(resolvedAfterGarbage, 'a valid reply after an unrecognized one must still resolve the pending entry');
  assert.strictEqual(resolvedAfterGarbage.label, 'gig_payout');
  console.log('  ✓ unrecognized reply leaves the transaction pending; a later valid reply still resolves it');

  // --- 5. no phone on file -> simulated, not a crash, no pending registered ---
  const NO_PHONE_WORKER = 'worker_no_phone_test';
  const noPhoneResult = await sendConfirmationPrompt(
    { rail_id: 'rail_no_phone', worker_id: NO_PHONE_WORKER, amount: 500000, note: '', credited_at: now },
    { label: 'needs_review', original_label: 'recurring_wage' }
  );
  assert.deepStrictEqual(noPhoneResult, { sent: true, simulated: true, reason: 'no_phone_on_file' });
  // No pending entry exists for this worker under any phone-shaped key -
  // confirm a reply naming the worker_id as "From" (the old, wrong fallback)
  // finds nothing, since it was never registered that way.
  const resNoPending = mockRes();
  handleConfirmationReply({ body: { From: NO_PHONE_WORKER, Body: '1' } }, resNoPending);
  assert.strictEqual(resNoPending.statusCode, 200);
  assert.strictEqual(
    getTransactionsByWorker(NO_PHONE_WORKER).some((t) => t.confirmed_via_reply),
    false
  );
  console.log('  ✓ no phone on file -> simulated, not a crash, no pending confirmation ever registered');

  // --- 6. sendConfirmationPrompt with TWILIO_CONFIGURED false -> simulated
  // log path, never attempts a real Twilio call ---
  assert.strictEqual(isTwilioConfigured(), false, 'expected Twilio to be unconfigured in this test environment');

  const SIM_WORKER = 'worker_sim_test';
  registerWorker(SIM_WORKER, { phone: '+910000000099' });
  const simResult = await sendConfirmationPrompt(
    { rail_id: 'rail_sim', worker_id: SIM_WORKER, amount: 100000, note: '', credited_at: now },
    { label: 'needs_review', original_label: 'recurring_wage' }
  );
  assert.deepStrictEqual(simResult, { sent: true, simulated: true });
  console.log('  ✓ TWILIO_CONFIGURED false -> simulated log path, no real Twilio call attempted');

  console.log('✅ Unit test passed: confirmation flow (income filter, reply resolution, phone/Twilio fallback) verified.');
}

run().catch((err) => {
  console.error('❌ confirmationFlow test failed:', err);
  process.exit(1);
});
