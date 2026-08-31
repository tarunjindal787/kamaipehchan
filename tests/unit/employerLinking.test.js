const assert = require('assert');
const { handleRegister } = require('../../src/worker/registration');
const { handleAddEmployer, buildReferenceId } = require('../../src/worker/employerLinking');

console.log('Running unit test: tests/unit/employerLinking.test.js');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

async function run() {
  // --- unregistered worker_id -> 404 ---
  const res1 = mockRes();
  await handleAddEmployer(
    { params: { workerId: 'worker_never_registered_empl_test' }, body: { employer_name: 'Zepto' } },
    res1
  );
  assert.strictEqual(res1.statusCode, 404);
  assert.ok(res1.body.error);
  console.log('  ✓ unregistered worker_id -> 404');

  // Register a real worker for the remaining tests.
  const registerRes = mockRes();
  handleRegister({ body: { phone: '+919812340001', name: 'Employer Link Test Worker' } }, registerRes);
  const workerId = registerRes.body.worker_id;

  // --- missing employer_name -> 400 ---
  const res2 = mockRes();
  await handleAddEmployer({ params: { workerId }, body: {} }, res2);
  assert.strictEqual(res2.statusCode, 400);
  assert.ok(res2.body.error);
  console.log('  ✓ missing employer_name -> 400');

  // Save and clear Razorpay keys to test the mock path deterministically
  const origKey = process.env.RAZORPAY_KEY_ID;
  const origSecret = process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;

  try {
    // --- Razorpay NOT configured (mock fallback state) -> 201, mock:true, payment_link_url:null ---
    const res3 = mockRes();
    await handleAddEmployer({ params: { workerId }, body: { employer_name: 'Zepto' } }, res3);
    assert.strictEqual(res3.statusCode, 201);
    assert.strictEqual(res3.body.mock, true);
    assert.strictEqual(res3.body.payment_link_url, null);
    assert.ok(res3.body.note && res3.body.note.toLowerCase().includes('mock'), 'response must clearly self-label as mock');
    console.log('  ✓ Razorpay not configured -> 201, mock:true, payment_link_url:null, clearly labeled');

    // --- reference_id is deterministically built from the real worker_id ---
    // This is the actual fix for the manual-sync gap - test it explicitly.
    assert.strictEqual(res3.body.reference_id, `RAIL_${workerId}_EMP_ZEPTO`);
    assert.strictEqual(res3.body.rail_id, res3.body.reference_id);

    // Calling it again for a different employer on the SAME worker must derive
    // a different, still-deterministic reference_id from the same worker_id.
    const res4 = mockRes();
    await handleAddEmployer({ params: { workerId }, body: { employer_name: 'Swiggy Instamart' } }, res4);
    assert.strictEqual(res4.body.reference_id, `RAIL_${workerId}_EMP_SWIGGYINSTAMART`);
    assert.notStrictEqual(res4.body.reference_id, res3.body.reference_id);
    console.log('  ✓ reference_id is deterministically derived from the real registered worker_id');
  } finally {
    if (origKey !== undefined) process.env.RAZORPAY_KEY_ID = origKey;
    if (origSecret !== undefined) process.env.RAZORPAY_KEY_SECRET = origSecret;
  }

  // --- reference_id never exceeds Razorpay's 40-char limit, even with a
  // deliberately long worker_id AND a long employer name (confirmed live:
  // Razorpay actually rejects anything over 40 with a real 400) ---
  const longWorkerId = 'worker_a_very_long_explicit_identifier_someone_chose';
  const longSlug = 'AnExtremelyLongEmployerNameThatWouldNeverFit'.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const longRefId = buildReferenceId(longWorkerId, longSlug);
  assert.ok(longRefId.length <= 40, `reference_id must be <= 40 chars, got ${longRefId.length}: "${longRefId}"`);
  assert.ok(longRefId.startsWith('RAIL_'));
  assert.ok(longRefId.includes('_EMP_'));
  console.log(`  ✓ long worker_id + long employer name -> composite truncated to ${longRefId.length} chars, never exceeds 40`);

  // Short inputs must be completely unaffected - no needless truncation.
  const shortRefId = buildReferenceId('worker_abc123', 'ZEPTO');
  assert.strictEqual(shortRefId, 'RAIL_worker_abc123_EMP_ZEPTO');
  console.log('  ✓ short worker_id + short employer name -> unaffected, no needless truncation');

  console.log('✅ Unit test passed: employer linking endpoint verified (Razorpay-unconfigured / mock path).');
}

run().catch((err) => {
  console.error('❌ employerLinking test failed:', err);
  process.exit(1);
});
