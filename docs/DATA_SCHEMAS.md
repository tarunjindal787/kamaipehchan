# Razorpay Webhook Data Schemas

> **Verification Note:** `payment.captured` confirmed against a real Razorpay test-mode webhook, 2026-08-22. `payment_link.paid` and the `reference_id` question (open since Day 1) confirmed 2026-08-31 via a real registered worker, a real employer Payment Link, and a real paid test transaction end-to-end.

---

## 1. `payment.captured` Webhook Payload Schema

Below is the verified schema structure received from Razorpay upon a successful payment capture event.

### Root Object

| Field | Type | Description |
| :--- | :--- | :--- |
| `entity` | `string` | Always `"event"` |
| `account_id` | `string` | The Razorpay merchant account ID |
| `event` | `string` | The event name, e.g. `"payment.captured"` |
| `contains` | `string[]` | Array of entities contained in the payload, e.g. `["payment"]` |
| `payload` | `object` | Container for the event entities |
| `created_at` | `integer` | Epoch timestamp (seconds) when the event was generated |

---

### `payload.payment.entity` Object

| Field | Type | Example / Format | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | `"pay_TSYntBXFfpM6Xq"` | Unique payment identifier |
| `entity` | `string` | `"payment"` | Entity type |
| `amount` | `integer` | `50000` | Payment amount in **paise** (50000 = ₹500.00) |
| `currency` | `string` | `"INR"` | ISO 3-letter currency code |
| `status` | `string` | `"captured"` | Payment state (`"captured"`, `"authorized"`, `"failed"`) |
| `order_id` | `string` | `"order_TSYlaYghtOxQyu"` | Associated order ID (if created with an order/payment link) |
| `invoice_id` | `string \| null` | `null` | Associated invoice ID if applicable |
| `international` | `boolean` | `false` | Whether payment is from an international card/instrument |
| `method` | `string` | `"netbanking"`, `"upi"`, `"card"` | Payment method used |
| `amount_refunded` | `integer` | `0` | Refunded amount in paise |
| `refund_status` | `string \| null` | `null` | Status of refund if any |
| `captured` | `boolean` | `true` | Boolean flag confirming capture |
| `description` | `string` | `"#TSYkTArzAN9AGy"` | Razorpay's auto-generated receipt tag when no description is supplied. **Not** a Payment Link `reference_id` - confirmed 2026-08-31: `reference_id` never appears anywhere under `payload.payment.entity`, in either `payment.captured` or `payment_link.paid`. See Section 3 below - it does exist, but only on `payload.payment_link.entity.reference_id`. |
| `card_id` | `string \| null` | `null` | Card ID if method was card |
| `bank` | `string \| null` | `"UTBI"` | Bank code if netbanking / virtual account transfer |
| `wallet` | `string \| null` | `null` | Wallet provider if wallet method |
| `vpa` | `string \| null` | `null` | Virtual Payment Address if UPI |
| `email` | `string` | `"customer@example.com"` | Payer email |
| `contact` | `string` | `"+917877722029"` | Payer contact phone number |
| `notes` | `object` | `{"worker_id": "WRK-001", "worker_name": "Test Worker 1", "gig_type": "delivery"}` | Custom metadata key-value pairs attached during payment creation |
| `fee` | `integer` | `1298` | Razorpay platform fee in paise |
| `tax` | `integer` | `198` | Tax on fee in paise |
| `error_code` | `string \| null` | `null` | Error code if failed |
| `error_description` | `string \| null` | `null` | Error description if failed |
| `error_source` | `string \| null` | `null` | Error source |
| `error_step` | `string \| null` | `null` | Error step |
| `error_reason` | `string \| null` | `null` | Error reason |
| `acquirer_data` | `object` | `{"bank_transaction_id": "7353849"}` | Acquirer/bank reference metadata |
| `created_at` | `integer` | `1787346001` | Epoch timestamp of payment creation |

---

## 2. `payment_link.paid` Webhook Payload Schema

Confirmed 2026-08-31 against a real Payment Link created via `POST /worker/:workerId/employer`, paid with a real test-mode netbanking transaction. Unlike `payment.captured`, this event's `contains` array lists three entities (`["payment_link", "order", "payment"]`), and the payload carries all three side by side:

| Field | Type | Description |
| :--- | :--- | :--- |
| `payload.payment.entity` | `object` | Same shape as Section 1 above. `reference_id` is **absent** here too - it does not travel with the payment entity regardless of which event carries it. |
| `payload.order.entity` | `object` | The underlying order. Notably has `receipt`, which holds the same value as the Payment Link's `reference_id` (e.g. `"RAIL_worker_17f9461b_EMP_OLA"`) - a second, coincidental place the value shows up. |
| `payload.payment_link.entity` | `object` | The Payment Link itself, including **`reference_id`** - confirmed present, e.g. `"reference_id": "RAIL_worker_17f9461b_EMP_OLA"`. This is the only place in a real webhook where `reference_id` actually appears. |

## 3. THE `reference_id` ANSWER (Day 1 question, closed 2026-08-31)

`reference_id` **does exist in a real webhook** - but only on `payment_link.paid`'s `payload.payment_link.entity.reference_id`. It is **never** present on `payload.payment.entity`, in either event type. `normalize.js` currently does not read `payload.payment_link.entity` at all (its `entity` resolution only ever looks at `payload.payment.entity` or `payload.*`), so as of this writing it still doesn't consume the confirmed field directly - it relies on a separate notes-based fallback (`notes.worker_id` + `notes.employer_ref`, composited into `rail_id`) that produces an equivalent value in this system today, since we set both directly at Payment Link creation. Wiring `normalize.js` to also check `payload.payment_link.entity.reference_id` for `payment_link.paid` events specifically remains an open architectural refinement, not a blocker.

## 4. Key Observations for Classifier & Worker Scoring

1. **Amount Units:** Amounts are in smallest currency units (**paise**). To calculate INR: `amount_inr = payload.payment.entity.amount / 100`.
2. **Gig Worker Identification:** Extracted directly from `payload.payment.entity.notes.worker_id` and `notes.worker_name` or `description`. Confirmed live: `notes.employer_ref` (set by `employerLinking.js`) survives into the real webhook unchanged, which is what makes the `normalize.js` rail_id fallback work.
3. **Transaction Deduplication Key:** the bare payment ID (`payload.payment.entity.id`) is **not** sufficient on its own - `payment.captured` and `payment_link.paid` for the same transaction both carry it, and were being wrongly treated as duplicates of each other. Confirmed live 2026-08-31 and fixed by prefixing the dedup key with the event type (`` `${event.event}:${id}` ``) in `razorpayWebhookHandler.js`.
4. **`reference_id` length limit:** confirmed live - Razorpay rejects `reference_id` over 40 characters (`"reference_id: the length must be no more than 40."`). `employerLinking.js`'s `RAIL_<worker_id>_EMP_<SLUG>` construction does not currently guard the total length, only the employer-name slug portion - a real, reproducible bug for longer employer names, not yet fixed.
