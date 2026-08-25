const assert = require('assert');
const { registerWorker, getWorkerIdentity } = require('../../src/db/workerRegistry');

console.log('Running unit test: tests/unit/workerRegistry.test.js');

// Unregistered worker -> null, not a crash
assert.strictEqual(getWorkerIdentity('worker_never_registered'), null);
console.log('  ✓ unregistered worker -> null, not a crash');

// Register then retrieve -> exact round-trip
const identity = { phone: '+919876543210', vpa: 'worker@okhdfcbank', email: 'worker@example.com' };
registerWorker('worker_registry_test', identity);
assert.deepStrictEqual(getWorkerIdentity('worker_registry_test'), identity);
console.log('  ✓ registerWorker then getWorkerIdentity -> exact round-trip');

// Re-registering overwrites, doesn't merge
registerWorker('worker_registry_test', { phone: '+911111111111' });
assert.deepStrictEqual(getWorkerIdentity('worker_registry_test'), { phone: '+911111111111' });
console.log('  ✓ re-registering a worker overwrites the prior identity');

console.log('✅ Unit test passed: worker identity registry verified.');
