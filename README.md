# KamaiPehchan — Verifiable Income & Credit Passport

## Problem

Millions of multi-employer informal workers, gig workers, and daily wage earners receive fragmented payments across digital channels without formal pay slips. Traditional credit scoring models classify these workers as New-To-Credit (NTC) or high-risk due to the lack of structured income verification. KamaiPehchan bridges this gap by aggregating, validating, and structuring multi-source payment streams into an immutable, verifiable income and credit passport.

## Architecture

The system processes incoming financial events through a multi-stage pipeline:

```
+------------------------+      +------------------------+      +------------------------+      +------------------------+
|    Webhook Handler     | ---> |   Payment Classifier   | ---> |       ISI Engine       | ---> |    Credit Passport     |
| (Razorpay HMAC Verify) |      | (Deterministic + LLM)  |      | (Income Stability Idx) |      |   (Lender / Worker)    |
+------------------------+      +------------------------+      +------------------------+      +------------------------+
```

1. **Webhook Handler (`src/webhooks/`, `src/integrations/razorpay/`):** Listens for real-time payment and virtual account credit events, verifies cryptographic HMAC SHA-256 signatures, and deduplicates events.
2. **Payment Classifier (`src/classifier/`, `src/integrations/llm/`):** Categorizes transactions into recurring wages, gig payouts, advances, or transfers using rule-based deterministic filters with LLM-assisted fallback for ambiguous notes.
3. **ISI Engine (`src/scoring/`, `src/fraud/`):** Computes Income Stability Index (ISI), volatility metrics, employer diversity scores, and fraud anomaly checks.
4. **Credit Passport (`src/passport/`, `frontend/`):** Generates privacy-preserving, lender-ready credit passports and worker views.

## Status

**Day 1** - Webhook receiver live and verified against Razorpay test mode events.

**Day 2** - Module 1 wired end-to-end: `normalizeTransaction` -> `classifyAndRecord` (deterministic rail-history + note matching, LLM-assisted fallback, confidence gate, simulated worker confirmation prompt) -> webhook response, all called from `src/webhooks/razorpayWebhookHandler.js`. Real LLM call (`src/integrations/llm/llmClassifier.js`) implemented against Anthropic's API but untested live - no `LLM_API_KEY` configured yet, so it safely falls back to `needs_review` rather than guessing. First benchmark run (`node tests/benchmarkRunner.js`, LLM_API_KEY NOT set): `[deterministic] n=10 accuracy=100.0% avg_latency=0.1ms`, `[llm_unavailable] n=10 accuracy=100.0% avg_latency=0.0ms` - the llm_unavailable accuracy reflects the safety fallback correctly landing on `needs_review`, not real LLM reasoning. `normalizeTransaction` now handles both the `virtual_account.credited` shape and the `payment.captured` shape (fields under `payload.payment.entity.*`), extracting `rail_id` from `virtual_account_id` or `reference_id`. Verified against the real captured sample in this repo (`tests/benchmark_payloads/real_test_mode/sample_credit_event.json`): `amount`, `worker_id`, `note`, and `credited_at` now extract correctly (previously all null). **Still open:** that sample has neither `virtual_account_id` nor `reference_id`, so its `rail_id` is still `null` - it predates `reference_id`-on-Payment-Link testing entirely. Whether `reference_id` actually survives into a real webhook remains unconfirmed; that requires a real paid Payment Link webhook capture, which is still blocked on real Razorpay test-mode keys. Scoring engine not started.

---

## Getting Started

### 1. Setup Environment
Copy `.env.example` to `.env` and fill in your test credentials:
```bash
cp .env.example .env
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run Development Server
```bash
npm run dev
# or
npm start
```

### 4. Run Tunnel
```bash
npm run tunnel
```