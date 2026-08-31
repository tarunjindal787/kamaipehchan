const { verifyWebhookSignature } = require('../integrations/razorpay/webhookVerify');
const { isDuplicateEvent } = require('./eventDedup');
const { getOrCreateClassification } = require('./classificationDedup');
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
  // The same underlying payment ID, independent of event type - used to
  // dedup *classification* below (one LLM/deterministic call per real
  // payment), separately from eventId's per-event-type dedup (one log
  // entry per real event, for audit).
  const paymentId =
    event?.payload?.payment?.entity?.id ||
    event?.payload?.virtual_account?.entity?.id ||
    null;

  // Prefixed with event type (Day 6 fix): payment.captured and
  // payment_link.paid both carry payload.payment.entity.id for the same
  // underlying payment, so the bare ID collided across genuinely
  // different event types - the second one was silently dropped as a
  // "duplicate" of the first.
  const eventId = `${event?.event}:${
    paymentId || event?.id || JSON.stringify(event).slice(0, 50)
  }`;

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

  const correlation = `payment=${paymentId || 'unknown'} event=${event?.event}`;

  let classification;
  try {
    const { reused, promise } = getOrCreateClassification(paymentId, () => {
      const normalized = normalizeTransaction(event);
      return classifyAndRecord(normalized);
    });

    if (reused) {
      console.log(`[webhook] Payment ${paymentId} already classified by an earlier event - skipping re-classification, reusing existing result (${correlation})`);
    }

    classification = await promise;

    if (!reused) {
      console.log(`[webhook] Classification (${correlation}):`, JSON.stringify(classification, null, 2));
    }
  } catch (err) {
    // normalizeTransaction handles both virtual_account.credited and
    // payment.captured shapes, but an event with neither virtual_account_id
    // nor reference_id still normalizes to rail_id: null, which
    // recordTransaction rejects. Fail loud in the logs but still respond,
    // rather than hanging the request.
    console.error(`[webhook] Classification failed (${correlation}):`, err.message);
    classification = { error: 'classification_failed', reason: err.message };
  }

  return res.status(200).json({
    status: 'received',
    attribution: attribution.attributed ? attribution : undefined,
    classification,
  });
}

module.exports = { razorpayWebhookHandler };
