const { verifyWebhookSignature } = require('../integrations/razorpay/webhookVerify');
const { isDuplicateEvent } = require('./eventDedup');
const config = require('../config/env');

function razorpayWebhookHandler(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody;

  const isValid = verifyWebhookSignature(rawBody, signature, config.razorpay.webhookSecret);

  if (!isValid) {
    console.warn('[webhook] Invalid signature - rejecting request');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body;
  const eventId = event?.payload?.payment?.entity?.id || event?.id || JSON.stringify(event).slice(0, 50);

  if (isDuplicateEvent(eventId)) {
    console.log(`[webhook] Duplicate event ${eventId} - already processed, ignoring`);
    return res.status(200).json({ status: 'duplicate_ignored' });
  }

  console.log('[webhook] Verified event received:', JSON.stringify(event, null, 2));

  // TODO (Day 2+): hand off `event` to the classifier module (Module 1)

  return res.status(200).json({ status: 'received' });
}

module.exports = { razorpayWebhookHandler };
