/**
 * Verification Script: Smart Collect Virtual Account Rail Attribution
 *
 * Targets Razorpay Smart Collect virtual accounts. Day 1 confirmed these are
 * unavailable on Individual Razorpay accounts (MCC restriction) - kept as a
 * record of that investigation, not part of the working pipeline.
 *
 * Demonstrates:
 * 1. Same Worker (`worker_1001`) assigned two distinct Virtual Accounts:
 *    - `va_worker1001_employerA` for Employer A (Zepto Delivery)
 *    - `va_worker1001_employerB` for Employer B (Urban Company)
 * 2. Two credit events arrive with NO notes or misleading notes.
 * 3. The attribution service accurately attributes each transaction to the correct employer
 *    using ONLY the Virtual Account ID from the rail.
 */

const { registerVirtualAccount, attributePaymentFromRail } = require('../src/worker/attributionService');

console.log('===============================================================');
console.log('  KamaiPehchan - Smart Collect Rail Attribution Verification  ');
console.log('===============================================================\n');

// 1. Provision dedicated rails for Worker 1001
const workerId = 'worker_1001';

const vaA = registerVirtualAccount({
  virtualAccountId: 'va_worker1001_employerA',
  workerId,
  employerRef: 'Zepto_QuickCommerce',
  description: 'Dedicated Virtual Account for Zepto payouts',
});

const vaB = registerVirtualAccount({
  virtualAccountId: 'va_worker1001_employerB',
  workerId,
  employerRef: 'UrbanCompany_Services',
  description: 'Dedicated Virtual Account for Urban Company payouts',
});

console.log('1. Provisioned Dedicated Virtual Account Rails:');
console.log(`   - Rail A: ${vaA.virtualAccountId} -> Worker: ${vaA.workerId}, Employer: ${vaA.employerRef}`);
console.log(`   - Rail B: ${vaB.virtualAccountId} -> Worker: ${vaB.workerId}, Employer: ${vaB.employerRef}\n`);

// 2. Simulate Payment Event 1: Payout from Employer A (with empty notes)
const eventEmployerA = {
  entity: 'event',
  event: 'virtual_account.credited',
  payload: {
    virtual_account: {
      entity: {
        id: 'va_worker1001_employerA',
        status: 'active',
      },
    },
    payment: {
      entity: {
        id: 'pay_zepto_tx_001',
        amount: 600000, // Rs. 6,000.00
        currency: 'INR',
        status: 'captured',
        method: 'bank_transfer',
        notes: {}, // EMPTY NOTES - proving rail attribution doesn't need notes
      },
    },
  },
};

// 3. Simulate Payment Event 2: Payout from Employer B (with arbitrary/unrelated note)
const eventEmployerB = {
  entity: 'event',
  event: 'virtual_account.credited',
  payload: {
    virtual_account: {
      entity: {
        id: 'va_worker1001_employerB',
        status: 'active',
      },
    },
    payment: {
      entity: {
        id: 'pay_urban_tx_002',
        amount: 450000, // Rs. 4,500.00
        currency: 'INR',
        status: 'captured',
        method: 'upi',
        notes: { comment: 'weekly advance payment' }, // Arbitrary note
      },
    },
  },
};

console.log('2. Processing Incoming Webhook Events via Rail Attribution Engine:\n');

const resultA = attributePaymentFromRail(eventEmployerA);
console.log('Event 1 Result (Zepto Rail):');
console.log(JSON.stringify(resultA, null, 2));

const resultB = attributePaymentFromRail(eventEmployerB);
console.log('\nEvent 2 Result (Urban Company Rail):');
console.log(JSON.stringify(resultB, null, 2));

// 4. Assertions
console.log('\n3. Verification & Assertions:');
const passA = resultA.attributed && resultA.workerId === workerId && resultA.employerRef === 'Zepto_QuickCommerce';
const passB = resultB.attributed && resultB.workerId === workerId && resultB.employerRef === 'UrbanCompany_Services';

console.log(`   - Event 1 Attributed to Zepto via VA ID alone: ${passA ? 'PASSED ✅' : 'FAILED ❌'}`);
console.log(`   - Event 2 Attributed to Urban Company via VA ID alone: ${passB ? 'PASSED ✅' : 'FAILED ❌'}`);

if (passA && passB) {
  console.log('\nSUCCESS: Verified that multi-employer payments for the same worker');
  console.log('are 100% uniquely identified and attributed purely via payment rail Virtual Account IDs!');
}
