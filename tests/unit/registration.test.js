const assert = require('assert');
const { handleRegister, handleGetWorker } = require('../../src/worker/registration');
const { getWorkerIdentity } = require('../../src/db/workerRegistry');

console.log('Running unit test: tests/unit/registration.test.js');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
  };
}

// --- valid phone -> 201, worker stored, retrievable via getWorkerIdentity ---
const res1 = mockRes();
handleRegister({ body: { phone: '+919876543210', name: 'Ravi Kumar' } }, res1);
assert.strictEqual(res1.statusCode, 201);
assert.ok(res1.body.worker_id, 'expected a generated worker_id in the response');
const storedIdentity = getWorkerIdentity(res1.body.worker_id);
assert.ok(storedIdentity, 'worker should be retrievable via getWorkerIdentity');
assert.strictEqual(storedIdentity.phone, '+919876543210');
assert.strictEqual(storedIdentity.name, 'Ravi Kumar');
console.log('  ✓ valid phone -> 201, worker stored in registry, retrievable via getWorkerIdentity');

// --- missing phone -> 400, not stored ---
const res2 = mockRes();
handleRegister({ body: { name: 'No Phone Worker' } }, res2);
assert.strictEqual(res2.statusCode, 400);
assert.ok(res2.body.error);
assert.strictEqual(res2.body.worker_id, undefined, 'no worker_id should be returned on failure');
console.log('  ✓ missing phone -> 400, not stored');

// --- invalid phone format -> 400 ---
const res3 = mockRes();
handleRegister({ body: { phone: 'abc' } }, res3);
assert.strictEqual(res3.statusCode, 400);
console.log('  ✓ invalid phone format ("abc") -> 400');

const res3b = mockRes();
handleRegister({ body: { phone: '12345' } }, res3b); // too short
assert.strictEqual(res3b.statusCode, 400);
console.log('  ✓ invalid phone format (too short) -> 400');

// --- GET for unregistered worker_id -> 404 ---
const res4 = mockRes();
handleGetWorker({ params: { workerId: 'worker_never_registered_reg_test' } }, res4);
assert.strictEqual(res4.statusCode, 404);
assert.ok(res4.body.error);
console.log('  ✓ GET for unregistered worker_id -> 404');

// --- GET for registered worker_id -> correct identity returned ---
const res5 = mockRes();
handleRegister({ body: { phone: '+911111111111', name: 'Test Worker', vpa: 'test@okhdfcbank' } }, res5);
const workerId5 = res5.body.worker_id;

const res5get = mockRes();
handleGetWorker({ params: { workerId: workerId5 } }, res5get);
// handleGetWorker's success path calls res.json() without an explicit
// .status() - that's Express's implicit 200, not an error path.
assert.strictEqual(res5get.statusCode, null);
assert.deepStrictEqual(res5get.body, {
  worker_id: workerId5,
  phone: '+911111111111',
  name: 'Test Worker',
  vpa: 'test@okhdfcbank',
});
console.log('  ✓ GET for registered worker_id -> correct identity returned');

// --- explicit worker_id passed in -> used instead of generated one ---
const res6 = mockRes();
handleRegister({ body: { phone: '+912222222222', worker_id: 'worker_explicit_id_test' } }, res6);
assert.strictEqual(res6.statusCode, 201);
assert.strictEqual(res6.body.worker_id, 'worker_explicit_id_test');
assert.ok(getWorkerIdentity('worker_explicit_id_test'), 'explicit worker_id should be used for storage, not a generated one');
console.log('  ✓ explicit worker_id passed in -> used instead of generated one');

console.log('✅ Unit test passed: worker registration endpoint verified.');
