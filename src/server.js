const express = require('express');
const config = require('./config/env');
const { razorpayWebhookHandler } = require('./webhooks/razorpayWebhookHandler');
const { buildPassport } = require('./passport/buildPassport');

const app = express();

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'kamaipehchan' });
});

app.post('/webhooks/razorpay', razorpayWebhookHandler);

// Section 4a: On-demand Credit Passport generation endpoint
app.get('/passport/:workerId', (req, res) => {
  const passport = buildPassport(req.params.workerId);
  if (passport.status === 'insufficient_data') {
    return res.status(404).json(passport);
  }
  return res.json(passport);
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`KamaiPehchan server running on port ${config.port}`);
    console.log(`Webhook endpoint: http://localhost:${config.port}/webhooks/razorpay`);
    console.log(`Credit Passport endpoint: http://localhost:${config.port}/passport/:workerId`);
  });
}

module.exports = app;
