const express = require('express');
const config = require('./config/env');
const { razorpayWebhookHandler } = require('./webhooks/razorpayWebhookHandler');

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

app.listen(config.port, () => {
  console.log(`KamaiPehchan server running on port ${config.port}`);
  console.log(`Webhook endpoint: http://localhost:${config.port}/webhooks/razorpay`);
});
