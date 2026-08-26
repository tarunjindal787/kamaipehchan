/**
 * Manual E2E test: worker registration closing the registry gap.
 *
 * Registers a real test worker, builds a transaction for that worker
 * with a round-number amount (trips the fraud anomaly flag) and a
 * payer_identifier matching the worker's own registered phone (trips
 * the self-payment check), runs it through classifyAndRecord(), and
 * explicitly confirms three things that were never true before this:
 *   (a) the fraud flag fired
 *   (b) selfPaymentCheck internals show checked:true, not checked:false
 *   (c) the notifier log shows the REAL phone number, not "no phone on file"
 */
const { handleRegister } = require('../src/worker/registration');
const { classifyAndRecord } = require('../src/classifier/classifyAndRecord');
const { isSelfPayment } = require('../src/fraud/selfPaymentCheck');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

async function run() {
  const TEST_PHONE = '+919812345670';

  console.log('--- Step 1: register a real test worker ---');
  const registerRes = mockRes();
  handleRegister({ body: { phone: TEST_PHONE, name: 'E2E Test Worker' } }, registerRes);
  console.log('Registration response:', JSON.stringify(registerRes.body, null, 2));
  const workerId = registerRes.body.worker_id;

  console.log('\n--- Step 2: build a transaction for this worker (round-number amount, payer_identifier = own phone) ---');
  const transaction = {
    rail_id: 'rail_e2e_registration',
    worker_id: workerId,
    amount: 500000, // round number -> trips anomalyDetector
    note: 'salary',
    credited_at: Math.floor(Date.now() / 1000),
    payer_identifier: TEST_PHONE, // matches the worker's own registered phone -> self-payment
  };
  console.log('Transaction:', JSON.stringify(transaction, null, 2));

  console.log('\n--- Step 3: run it through classifyAndRecord() ---');
  const result = await classifyAndRecord(transaction);
  console.log('classifyAndRecord result:', JSON.stringify(result, null, 2));

  console.log('\n--- Step 4: explicit confirmation of the three things that were never true before ---');

  console.log('\n(a) Did the fraud flag fire?');
  const fraudFired = Array.isArray(result.fraud_flags) && result.fraud_flags.includes('round_number_amount');
  console.log('  fraud_flags:', result.fraud_flags);
  console.log('  CONFIRMED:', fraudFired);

  console.log('\n(b) Does selfPaymentCheck show checked:true (not checked:false)?');
  const selfPayDirect = isSelfPayment(transaction);
  console.log('  isSelfPayment(transaction) direct call:', JSON.stringify(selfPayDirect));
  console.log('  result.self_payment_suspected (from classifyAndRecord):', result.self_payment_suspected);
  console.log('  CONFIRMED checked:true:', selfPayDirect.checked === true);
  console.log('  CONFIRMED isSelfPayment:true:', selfPayDirect.isSelfPayment === true);

  console.log('\n(c) Did the notifier log show the REAL phone number, not "no phone on file"?');
  console.log('  (see [notifier] line above/below this - it should show', TEST_PHONE, 'not a "no phone on file" message)');
}

run().catch((err) => {
  console.error('E2E REGISTRATION TEST ERROR:', err);
  process.exit(1);
});
