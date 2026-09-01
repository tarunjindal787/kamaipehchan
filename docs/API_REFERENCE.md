# KamaiPehchan API Reference

Complete documentation for all HTTP endpoints exposed by the KamaiPehchan server.

---

## Table of Contents

1. [System & Health](#1-system--health)
   - `GET /health`
2. [Webhook Ingestion](#2-webhook-ingestion)
   - `POST /webhooks/razorpay`
3. [Credit Passport](#3-credit-passport)
   - `GET /passport/:workerId`
4. [Worker Onboarding & Identity](#4-worker-onboarding--identity)
   - `POST /worker/register`
   - `GET /worker/:workerId`
5. [Employer Linking & Payment Rails](#5-employer-linking--payment-rails)
   - `POST /worker/:workerId/employer`
   - `GET /worker/:workerId/employers`
6. [Worker SMS Confirmation Loop](#6-worker-sms-confirmation-loop)
   - `POST /worker/confirm`

---

## 1. System & Health

### `GET /health`
Returns the operational health status and uptime of the KamaiPehchan service.

#### Response (`200 OK`)
```json
{
  "status": "ok",
  "service": "kamaipehchan",
  "uptime_seconds": 124,
  "timestamp": "2026-08-27T01:00:00.000Z"
}
```

---

## 2. Webhook Ingestion

### `POST /webhooks/razorpay`
Ingests real-time Razorpay payment and virtual account credit events. Cryptographically verifies HMAC-SHA256 signature, deduplicates duplicate transmissions, executes rail-level attribution, and routes through the hybrid classifier.

#### Headers
- `X-Razorpay-Signature`: HMAC SHA-256 signature generated with the configured webhook secret.

#### Request Body
Standard Razorpay webhook payload (`payment.captured` or `virtual_account.credited`).

#### Response (`200 OK`)
```json
{
  "status": "received",
  "attribution": {
    "attributed": true,
    "attributionSource": "RAZORPAY_VIRTUAL_ACCOUNT_RAIL",
    "virtualAccountId": "va_worker1_zepto",
    "workerId": "worker_1001",
    "employerRef": "Zepto_QuickCommerce",
    "amountInr": 5000,
    "paymentId": "pay_xyz123",
    "verifiedAt": "2026-08-27T01:00:00.000Z"
  },
  "classification": {
    "label": "recurring_wage",
    "confidence": 1,
    "path": "deterministic",
    "needs_review": false
  }
}
```

---

## 3. Credit Passport

### `GET /passport/:workerId`
Assembles the Income Stability Index (ISI) and Credit Passport for a worker on-demand.

#### Query Parameters
- `view` *(optional)*: `worker` (default, full details) | `lender` (privacy-redacted selective disclosure).

#### Response (`200 OK` - Lender View: `?view=lender`)
```json
{
  "worker_id": "worker_kailash_401",
  "isi_score": 82,
  "confidence": "high",
  "active_employer_count": 2,
  "six_month_avg_income_inr": 52200,
  "income_band": "₹50,000 - ₹1,00,000 / month",
  "weights_used": {
    "regularity": 0.4,
    "retention": 0.3,
    "variance": 0.3
  },
  "breakdown": {
    "regularity": {
      "score": 93,
      "consistency_rating": "HIGH"
    },
    "retention": {
      "score": 65,
      "activeEmployerCount": 2,
      "avgMonthsRetained": 5,
      "retentionByRail": {
        "Verified Rail #1 (ZEPTO)": { "monthsActive": 5, "transactionCount": 12 },
        "Verified Rail #2 (SWIGGY)": { "monthsActive": 5, "transactionCount": 12 }
      }
    },
    "variance": {
      "score": 84,
      "stability_rating": "STABLE",
      "monthsObserved": 6
    }
  },
  "privacy": {
    "redacted": true,
    "view_mode": "lender_underwriting",
    "pii_never_collected": ["phone", "vpa_address", "bank_account_number", "raw_transaction_ids"]
  },
  "generated_at": "2026-08-27T01:00:00.000Z"
}
```

#### Response (`404 Not Found` - Worker with No Confirmed Data)
```json
{
  "worker_id": "worker_unseen_999",
  "isi_score": null,
  "status": "insufficient_data",
  "reason": "no_confirmed_transactions"
}
```

---

## 4. Worker Onboarding & Identity

### `POST /worker/register`
Registers a worker's identity (phone, name, UPI VPA).

#### Request Body
```json
{
  "phone": "+919876543210",
  "name": "Ravi Kumar",
  "vpa": "ravi@okhdfcbank"
}
```

#### Response (`201 Created`)
```json
{
  "worker_id": "worker_9d4ce850",
  "phone": "+919876543210",
  "name": "Ravi Kumar",
  "vpa": "ravi@okhdfcbank"
}
```

### `GET /worker/:workerId`
Fetches a registered worker's profile.

---

## 5. Employer Linking & Payment Rails

### `POST /worker/:workerId/employer`
Creates a dedicated employer payment collection rail for the worker, deriving an immutable `reference_id = RAIL_<workerId>_EMP_<slug>`.

#### Request Body
```json
{
  "employer_name": "Zepto"
}
```

#### Response (`201 Created`)
```json
{
  "employer_name": "Zepto",
  "rail_id": "RAIL_worker_9d4ce850_EMP_ZEPTO",
  "reference_id": "RAIL_worker_9d4ce850_EMP_ZEPTO",
  "payment_link_url": "https://rzp.io/rzp/...",
  "mock": false,
  "created_at": "2026-08-27T01:00:00.000Z"
}
```

### `GET /worker/:workerId/employers`
Returns all active employer payment rails registered for the worker.

---

## 6. Worker SMS Confirmation Loop

### `POST /worker/confirm`
Inbound Twilio webhook (URL-encoded form) handling worker SMS responses for transactions held in `needs_review`.

#### Form Fields
- `From`: Worker's mobile number (e.g. `+919876543210`)
- `Body`: Worker reply text (`"1"` for haan/wage confirmation, `"2"` for personal transfer)

#### Response (`200 OK`)
```json
{
  "status": "resolved",
  "worker_id": "worker_9d4ce850",
  "label": "recurring_wage",
  "needs_review": false
}
```
