const { verifyWebhookSignature } = require('../integrations/razorpay/webhookVerify');
const { isDuplicateEvent } = require('./eventDedup');
const { attributePaymentFromRail } = require('../worker/attributionService');
const { normalizeTransaction } = require('./normalize');
const { classifyAndRecord } = require('../classifier/classifyAndRecord');
const config = require('../config/env');

async function razorpayWebhookHandler(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody;

  const isValid = verifyWebhookSignature(rawBody, signature, config.razorpay.webhookSecret);

  if (!isValid) {
    console.warn('[webhook] Invalid signature - rejecting request');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  const event = req.body;
  const eventId =
    event?.payload?.payment?.entity?.id ||
    event?.payload?.virtual_account?.entity?.id ||
    event?.id ||
    JSON.stringify(event).slice(0, 50);

  if (isDuplicateEvent(eventId)) {
    console.log(`[webhook] Duplicate event ${eventId} - already processed, ignoring`);
    return res.status(200).json({ status: 'duplicate_ignored' });
  }

  console.log('[webhook] Verified event received:', JSON.stringify(event, null, 2));

  // Rail-level attribution (Section 6a)
  const attribution = attributePaymentFromRail(event);
  if (attribution.attributed) {
    console.log(`[attribution] Rail-verified: Worker=${attribution.workerId}, Employer=${attribution.employerRef}, Amount=Rs.${attribution.amountInr}`);
  }

  let classification;
  try {
    const normalized = normalizeTransaction(event);
    classification = await classifyAndRecord(normalized);
    console.log('[webhook] Classification:', JSON.stringify(classification, null, 2));
  } catch (err) {
    // normalizeTransaction targets the virtual_account.credited shape; a
    // payment.captured event (or any event missing virtual_account_id)
    // normalizes to rail_id: null, which recordTransaction rejects. Fail
    // loud in the logs but still respond, rather than hanging the request.
    console.error('[webhook] Classification failed:', err.message);
    classification = { error: 'classification_failed', reason: err.message };
  }

  return res.status(200).json({
    status: 'received',
    attribution: attribution.attributed ? attribution : undefined,
    classification,
  });
}

module.exports = { razorpayWebhookHandler };
