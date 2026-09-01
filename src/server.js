/**
 * KamaiPehchan - Main Application Server
 *
 * Core Express server exposing:
 * - GET /health : Health check and service status probe
 * - POST /webhooks/razorpay : Real-time webhook ingestion (Day 1 & Day 2)
 * - GET /passport/:workerId : On-demand Credit Passport API (Day 3 & Day 4/5 Privacy Layer)
 * - POST /worker/confirm : Inbound SMS confirmation replies (Day 4)
 * - POST /worker/register, GET /worker/:workerId : Worker onboarding (Day 5)
 * - POST /worker/:workerId/employer, GET /worker/:workerId/employers : Employer linking (Day 5)
 */

const path = require('path');
const express = require('express');
const config = require('./config/env');
const { razorpayWebhookHandler } = require('./webhooks/razorpayWebhookHandler');
const { buildPassport } = require('./passport/buildPassport');
const { redactPassport } = require('./privacy/redactPassport');
const { handleConfirmationReply } = require('./worker/confirmationHandler');
const { handleRegister, handleGetWorker } = require('./worker/registration');
const { handleAddEmployer, handleGetEmployerRails } = require('./worker/employerLinking');

const app = express();

// Security: basic headers & payload size limit
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Capture raw body buffer for cryptographically accurate HMAC-SHA256 verification
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Static demo UI (public/passport.html) - self-contained, no build step,
// fetches GET /passport/:workerId client-side.
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'kamaipehchan',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// ── Webhook Ingestion Rail (Day 1 / Day 2) ───────────────────────────────────
// Listens for payment.captured and virtual_account.credited events
app.post('/webhooks/razorpay', razorpayWebhookHandler);

// ── Section 4a & 8: Credit Passport Endpoint (Day 3 & Privacy Layer) ─────────
// Assembles explainable ISI score, confidence, and 6-month income average
// Supports ?view=lender (privacy-redacted) and ?view=worker (full detail)
app.get('/passport/:workerId', (req, res) => {
  const passport = buildPassport(req.params.workerId);
  if (passport.status === 'insufficient_data') {
    return res.status(404).json(passport);
  }
  const viewMode = req.query.view || 'worker';
  return res.json(redactPassport(passport, viewMode));
});

// Twilio sends form-encoded, not JSON, for inbound SMS webhooks - the
// global express.json() above doesn't parse this, so it's scoped here.
app.post('/worker/confirm', express.urlencoded({ extended: false }), handleConfirmationReply);

// ── Section 5: Worker Onboarding & Employer Linking (Day 5) ──────────────────
app.post('/worker/register', handleRegister);
app.get('/worker/:workerId', handleGetWorker);
app.post('/worker/:workerId/employer', express.json(), handleAddEmployer);
app.get('/worker/:workerId/employers', handleGetEmployerRails);

// ── Centralized 404 Handler ──────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.originalUrl });
});

// ── Centralized Global Error Handler ─────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
});

// Start listening when executed directly as the entry point
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`KamaiPehchan server running on port ${config.port}`);
    console.log(`Webhook endpoint: http://localhost:${config.port}/webhooks/razorpay`);
    console.log(`Credit Passport endpoint: http://localhost:${config.port}/passport/:workerId`);
  });
}

module.exports = app;
