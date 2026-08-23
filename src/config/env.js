require('dotenv').config();

// .env.example ships "your_x_here" placeholders; treat those as unset so
// downstream code doesn't mistake a copy-pasted template for a real value.
function isPlaceholder(value) {
  return typeof value === 'string' && /^your_.*_here$/i.test(value.trim());
}

function getEnv(key) {
  const value = process.env[key];
  return isPlaceholder(value) ? undefined : value;
}

const required = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];
const missing = required.filter((key) => !getEnv(key));

if (missing.length > 0) {
  console.warn(`[config] Warning: missing env vars: ${missing.join(', ')}. Some features will not work until these are set in .env`);
}

module.exports = {
  port: process.env.PORT || 3000,
  razorpay: {
    keyId: getEnv('RAZORPAY_KEY_ID'),
    keySecret: getEnv('RAZORPAY_KEY_SECRET'),
    webhookSecret: getEnv('RAZORPAY_WEBHOOK_SECRET'),
  },
  llm: {
    // Live getter (not a snapshotted value) so tests can toggle
    // LLM_API_KEY at runtime within a single process.
    get apiKey() {
      return getEnv('LLM_API_KEY') || null;
    },
  },
};
