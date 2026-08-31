// Prevents the same underlying payment from being classified twice when
// Razorpay fires multiple event types for it (payment.captured AND
// payment_link.paid both carry the same payment ID - confirmed live,
// Day 6). eventDedup.js intentionally still treats these as distinct
// events (event-type-prefixed keys) so both get logged for audit, but
// only one of them should actually invoke the classifier.
//
// Stores the in-flight Promise, not just the resolved result, keyed by
// payment ID - real webhook deliveries for the two event types can land
// close enough together that the first hasn't resolved (LLM calls take
// 50-100s) by the time the second is checked. A second caller reuses the
// same in-flight/resolved promise instead of racing a duplicate LLM call.
// In-memory for the prototype - same caveat as eventDedup.js.
const classificationsByPaymentId = new Map();

function getOrCreateClassification(paymentId, computeFn) {
  if (!paymentId) {
    return { reused: false, promise: computeFn() };
  }

  const existing = classificationsByPaymentId.get(paymentId);
  if (existing) {
    return { reused: true, promise: existing };
  }

  const promise = computeFn();
  classificationsByPaymentId.set(paymentId, promise);
  // A failed classification shouldn't permanently poison this payment ID -
  // let a later event retry instead of reusing a stuck rejection forever.
  promise.catch(() => classificationsByPaymentId.delete(paymentId));
  return { reused: false, promise };
}

module.exports = { getOrCreateClassification };
