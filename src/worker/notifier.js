const config = require('../config/env');
const { registerPending } = require('./pendingConfirmations');

// Routed through config/env.js's placeholder-aware getEnv, not raw
// process.env - a copy-pasted .env.example placeholder is truthy as a
// plain string, which would otherwise make this incorrectly report
// "configured" and attempt a real Twilio call with garbage credentials.
function isTwilioConfigured() {
  return !!(config.twilio.accountSid && config.twilio.authToken && config.twilio.phoneNumber);
}

let twilioClient = null;
function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (!isTwilioConfigured()) return null;
  twilioClient = require('twilio')(config.twilio.accountSid, config.twilio.authToken);
  return twilioClient;
}

// KNOWN LIMITATION: uses transaction.worker_phone if present, else
// falls back to worker_id (which is NOT a real phone number). Real
// SMS sending will only work once worker records have real phone
// numbers attached - out of scope for this step, flagged here so it's
// not silently assumed to work.
async function sendConfirmationPrompt(transaction, classificationResult) {
  const amount = (transaction.amount / 100).toFixed(0);
  const message = `Is Rs.${amount} aapki monthly salary hai? Reply 1 for haan, 2 for personal/loan transfer.`;
  const phoneNumber = transaction.worker_phone || transaction.worker_id;

  registerPending(phoneNumber, { ...transaction, suspected_label: classificationResult.original_label || classificationResult.label });

  const client = getTwilioClient();
  if (!client) {
    console.log(`[notifier] SIMULATED (Twilio not configured) to ${phoneNumber}: "${message}"`);
    return { sent: true, simulated: true };
  }

  try {
    await client.messages.create({ body: message, from: config.twilio.phoneNumber, to: phoneNumber });
    return { sent: true, simulated: false };
  } catch (err) {
    console.error('[notifier] Twilio send failed, falling back to log:', err.message);
    console.log(`[notifier] SIMULATED (send failed) to ${phoneNumber}: "${message}"`);
    return { sent: false, simulated: true, error: err.message };
  }
}

module.exports = { sendConfirmationPrompt, isTwilioConfigured };
