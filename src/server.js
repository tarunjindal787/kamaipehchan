/**
 * KamaiPehchan - Main Application Server
 *
 * Core Express server exposing:
 * - GET /health : Health check and service status probe
 * - POST /webhooks/razorpay : Real-time webhook ingestion (Day 1 & Day 2)
 * - GET /passport/:workerId : On-demand Credit Passport API (Day 3)
 */

const express = require('express');
const config = require('./config/env');
const { razorpayWebhookHandler } = require('./webhooks/razorpayWebhookHandler');
const { buildPassport } = require('./passport/buildPassport');
const { handleConfirmationReply } = require('./worker/confirmationHandler');

const app = express();

// Capture raw body buffer for cryptographically accurate HMAC-SHA256 verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kamaipehchan' });
});

// ── Webhook Ingestion Rail (Day 1 / Day 2) ───────────────────────────────────
// Listens for payment.captured and virtual_account.credited events
app.post('/webhooks/razorpay', razorpayWebhookHandler);

// ── Section 4a: On-Demand Credit Passport Endpoint (Day 3) ───────────────────
// Assembles explainable ISI score, confidence, and 6-month income average
app.get('/passport/:workerId', (req, res) => {
  const passport = buildPassport(req.params.workerId);
  if (passport.status === 'insufficient_data') {
    return res.status(404).json(passport);
  }
  return res.json(passport);
});

// Twilio sends form-encoded, not JSON, for inbound SMS webhooks - the
// global express.json() above doesn't parse this, so it's scoped here.
app.post('/worker/confirm', express.urlencoded({ extended: false }), handleConfirmationReply);

// Start listening when executed directly as the entry point
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`KamaiPehchan server running on port ${config.port}`);
    console.log(`Webhook endpoint: http://localhost:${config.port}/webhooks/razorpay`);
    console.log(`Credit Passport endpoint: http://localhost:${config.port}/passport/:workerId`);
  });
}

module.exports = app;
