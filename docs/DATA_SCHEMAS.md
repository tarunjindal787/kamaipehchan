# Razorpay Webhook Data Schemas

> **Verification Note:** Confirmed against real Razorpay test-mode webhook, 2026-08-22.

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
| `description` | `string` | `"#TSYkTArzAN9AGy"` | Razorpay's auto-generated receipt tag when no description is supplied. **Not** a Payment Link `reference_id` - that is a distinct field, not present anywhere in this sample, and its presence/behavior in a real webhook is still unconfirmed. |
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

## 2. Key Observations for Classifier & Worker Scoring

1. **Amount Units:** Amounts are in smallest currency units (**paise**). To calculate INR: `amount_inr = payload.payment.entity.amount / 100`.
2. **Gig Worker Identification:** Extracted directly from `payload.payment.entity.notes.worker_id` and `notes.worker_name` or `description`.
3. **Transaction Deduplication Key:** `payload.payment.entity.id` (e.g. `"pay_TSYntBXFfpM6Xq"`) is the authoritative unique identifier for deduplication.
