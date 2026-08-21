const assert = require('assert');
const { registerVirtualAccount, attributePaymentFromRail } = require('../../src/worker/attributionService');

console.log('Running unit test: tests/unit/attribution.test.js');

const workerId = 'worker_test_999';

// Setup 2 distinct rails for the same worker
registerVirtualAccount({
  virtualAccountId: 'va_worker999_employerX',
  workerId,
  employerRef: 'Swiggy_Delivery',
});

registerVirtualAccount({
  virtualAccountId: 'va_worker999_employerY',
  workerId,
  employerRef: 'Zomato_Hyperpure',
});

// Event 1 (Swiggy Rail) - NO notes
const event1 = {
  event: 'virtual_account.credited',
  payload: {
    virtual_account: { entity: { id: 'va_worker999_employerX' } },
    payment: { entity: { id: 'pay_swiggy_001', amount: 800000 } },
  },
};

// Event 2 (Zomato Rail) - Misleading note
const event2 = {
  event: 'virtual_account.credited',
  payload: {
    virtual_account: { entity: { id: 'va_worker999_employerY' } },
    payment: { entity: { id: 'pay_zomato_002', amount: 550000, notes: { tip: 'friend transfer' } } },
  },
};

const res1 = attributePaymentFromRail(event1);
assert.strictEqual(res1.attributed, true);
assert.strictEqual(res1.workerId, workerId);
assert.strictEqual(res1.employerRef, 'Swiggy_Delivery');
assert.strictEqual(res1.amountInr, 8000);

const res2 = attributePaymentFromRail(event2);
assert.strictEqual(res2.attributed, true);
assert.strictEqual(res2.workerId, workerId);
assert.strictEqual(res2.employerRef, 'Zomato_Hyperpure');
assert.strictEqual(res2.amountInr, 5500);

console.log('✅ Unit test passed: Multi-employer attribution via Virtual Account ID verified!');
