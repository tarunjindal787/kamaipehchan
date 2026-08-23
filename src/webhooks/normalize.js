/**
 * Single conversion point from a raw Razorpay-shaped webhook payload to the
 * normalized transaction shape used everywhere downstream:
 * { rail_id, amount, note, credited_at, worker_id }
 *
 * If the confirmed real field name for any of these changes (e.g. once a
 * live virtual_account.credited payload is captured), this is the only
 * place that needs to change.
 */
function normalizeTransaction(rawWebhookPayload) {
  const payload = rawWebhookPayload?.payload || {};

  return {
    rail_id: payload.virtual_account_id ?? null,
    amount: payload.amount ?? null,
    note: payload.note ?? '',
    credited_at: payload.credited_at ?? null,
    worker_id: payload.worker_id ?? null,
  };
}

module.exports = { normalizeTransaction };
