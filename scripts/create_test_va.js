const Razorpay = require('razorpay');
require('dotenv').config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

async function createVirtualAccount() {
  try {
    console.log('Creating Virtual Account for Test Worker 1...');
    const va = await razorpay.virtualAccounts.create({
      receivers: {
        types: ['bank_account', 'vpa'],
      },
      description: 'Virtual Account for Test Worker 1',
      notes: {
        worker_name: 'Test Worker 1',
        worker_id: 'WRK-001',
        purpose: 'Gig worker income tracking',
      },
    });

    console.log('Virtual Account Created Successfully:');
    console.log(JSON.stringify(va, null, 2));
  } catch (error) {
    console.error('Error creating virtual account:', error);
  }
}

createVirtualAccount();
