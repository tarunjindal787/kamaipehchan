/**
 * Real API Test: Payment Link Rail Creation & Inspection
 * 
 * Tests:
 * 1. Calls razorpay.paymentLink.create() with a unique reference_id and notes.
 * 2. Fetches the created link via razorpay.paymentLink.fetch().
 * 3. Inspects the raw API response fields to verify what Razorpay actually stores and returns.
 */

const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function runPaymentLinkTest() {
  const timestamp = Math.floor(Date.now() / 1000);
  const referenceId = `PLINK_REF_${timestamp}`;

  console.log(`[1] Calling razorpay.paymentLink.create with reference_id: ${referenceId}...`);

  try {
    const createResponse = await razorpay.paymentLink.create({
      amount: 50000, // Rs 500.00
      currency: 'INR',
      accept_partial: false,
      reference_id: referenceId,
      description: 'Payout test for Worker 1001 (Employer: Zepto)',
      customer: {
        name: 'Zepto Delivery Partner',
        email: 'payouts@zepto.in',
        contact: '+919876543210',
      },
      notify: { sms: false, email: false },
      reminder_enable: false,
      notes: {
        worker_id: 'worker_1001',
        employer_ref: 'Zepto_QuickCommerce',
        cycle_id: '2026_W34',
      },
    });

    console.log('\n[2] FULL RAW RESPONSE from razorpay.paymentLink.create:');
    console.log(JSON.stringify(createResponse, null, 2));

    console.log(`\n[3] Calling razorpay.paymentLink.fetch('${createResponse.id}')...`);
    const fetchResponse = await razorpay.paymentLink.fetch(createResponse.id);

    console.log('\n[4] FULL RAW RESPONSE from razorpay.paymentLink.fetch:');
    console.log(JSON.stringify(fetchResponse, null, 2));

  } catch (error) {
    console.error('\n[ERROR] Raw API Error:', error);
  }
}

runPaymentLinkTest();
