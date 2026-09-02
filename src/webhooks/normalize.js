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
const { buildReferenceId } = require('../worker/employerLinking');

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

  // Confirmed live (Day 6): payment_link.paid carries the real reference_id,
  // but only on payload.payment_link.entity - a sibling of payload.payment.entity,
  // never something `entity` above resolves to. Check it first for this event
  // type specifically. payment.captured (confirmed absent) and everything else
  // still falls through to the notes-based composite below.
  const paymentLinkReferenceId =
    rawWebhookPayload?.event === 'payment_link.paid'
      ? rawWebhookPayload?.payload?.payment_link?.entity?.reference_id
      : null;

  return {
    // Confirmed live (Day 6): a real payment.captured event carries neither
    // virtual_account_id nor reference_id - notes.worker_id + notes.employer_ref
    // are what's actually load-bearing, since we control those ourselves at
    // Payment Link creation regardless of which event type fires.
    rail_id:
      paymentLinkReferenceId ??
      entity.virtual_account_id ??
      entity.reference_id ??
      (entity.notes?.worker_id && entity.notes?.employer_ref
        ? buildReferenceId(entity.notes.worker_id, entity.notes.employer_ref)
        : null),
    // The same underlying payment ID across every event type Razorpay fires
    // for it (confirmed live: payment.captured and payment_link.paid both
    // carry it on payload.payment.entity.id) - this is what the exception
    // report keys transactions by, since nothing else in this shape
    // uniquely identifies one payment.
    transaction_id: entity.id ?? null,
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
