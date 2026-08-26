/**
 * Single conversion point from a raw Razorpay-shaped webhook payload to the
 * normalized transaction shape used everywhere downstream:
 * { rail_id, amount, note, credited_at, worker_id }
 *
 * Handles both the virtual_account.credited shape (fields directly under
 * payload.*) and the payment.captured shape (fields under
 * payload.payment.entity.*). If the confirmed real field name for any of
 * these changes, this is the only place that needs to change.
 */
// Razorpay's payment.captured created_at is already Unix seconds; our own
// synthetic virtual_account.credited shape uses an ISO string for
// credited_at. Downstream scoring math (src/scoring/) does arithmetic
// directly on this value, so it must always come out as a number here -
// this is the only place that conversion needs to happen.
function toUnixSeconds(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
  }
  return null;
}

function normalizeTransaction(rawWebhookPayload) {
  const entity =
    rawWebhookPayload?.payload?.payment?.entity ||
    rawWebhookPayload?.payload ||
    {};

  return {
    rail_id: entity.virtual_account_id ?? entity.reference_id ?? null,
    amount: entity.amount ?? null,
    note: entity.notes?.note ?? entity.note ?? entity.description ?? '',
    credited_at: toUnixSeconds(entity.created_at ?? entity.credited_at ?? null),
    worker_id: entity.notes?.worker_id ?? entity.worker_id ?? null,
    // Real payer-side identity signal (Section 7a self-payment check).
    // Compared against the worker's registered identity downstream in
    // src/fraud/selfPaymentCheck.js - this function only extracts it.
    payer_identifier: entity.contact ?? entity.vpa ?? entity.email ?? null,
  };
}

module.exports = { normalizeTransaction };
