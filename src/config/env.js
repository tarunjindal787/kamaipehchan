require('dotenv').config();

const required = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.warn(`[config] Warning: missing env vars: ${missing.join(', ')}. Some features will not work until these are set in .env`);
}

module.exports = {
  port: process.env.PORT || 3000,
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
  },
};
