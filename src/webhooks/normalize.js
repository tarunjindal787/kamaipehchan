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
function normalizeTransaction(rawWebhookPayload) {
  const entity =
    rawWebhookPayload?.payload?.payment?.entity ||
    rawWebhookPayload?.payload ||
    {};

  return {
    rail_id: entity.virtual_account_id ?? entity.reference_id ?? null,
    amount: entity.amount ?? null,
    note: entity.notes?.note ?? entity.note ?? entity.description ?? '',
    credited_at: entity.created_at ?? entity.credited_at ?? null,
    worker_id: entity.notes?.worker_id ?? entity.worker_id ?? null,
  };
}

module.exports = { normalizeTransaction };
