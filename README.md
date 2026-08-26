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

1. **Webhook Ingestion (`src/webhooks/`, `src/integrations/razorpay/`):** Listens for real-time payment and virtual account credit events, verifies cryptographic HMAC SHA-256 signatures, and deduplicates events.
2. **Payment Classifier (`src/classifier/`, `src/integrations/llm/`):** Categorizes transactions into recurring wages, gig payouts, advances, or transfers using rule-based deterministic filters with LLM-assisted fallback for ambiguous notes.
3. **Fraud & Anomaly Detection (`src/fraud/`):** Detects round-number manipulation, artificial interval uniformity, and self-funding loops via worker VPA identity checks.
4. **ISI Engine (`src/scoring/`):** Computes the explainable Income Stability Index (ISI) across Regularity (40%), Retention (30%), and Variance (30%).
5. **Credit Passport & Privacy Layer (`src/passport/`, `src/privacy/`):** Generates privacy-preserving, lender-ready credit passports with selective disclosure (`?view=lender` vs `?view=worker`).
6. **Worker Onboarding & Rail Linking (`src/worker/`, `src/db/`):** Provides automated worker registration and deterministic employer payment rail creation (`reference_id = RAIL_<workerId>_EMP_<slug>`).

---

## Status

**Day 1** - Webhook receiver live, HMAC-SHA256 verified (timing-safe), deduplicated - re-verified by direct execution, not just code review. `reference_id`-in-webhook still unconfirmed (blocked on real test-mode keys); the one real captured sample also carries a placeholder-looking `account_id` ("acc_test_dummy"), whose authenticity as a genuine capture is unverified.

**Day 2** - Module 1 (hybrid classifier) wired end-to-end: `normalize` -> `classifyAndRecord` (deterministic rail-history/note matching, LLM fallback, confidence gate, simulated worker confirmation) -> webhook response - confirmed live via direct webhook smoke tests, not just unit tests. Benchmark: 100% accuracy on both `deterministic` and `llm_unavailable` paths, but the latter reflects the safety fallback (no `LLM_API_KEY` set), not real LLM reasoning - the real Anthropic call has never been run. Known gap: `rail_id` still resolves to `null` on the only real captured sample - it predates `reference_id`-on-Payment-Link testing and has neither `virtual_account_id` nor `reference_id`.

**Day 3** - Module 2 (ISI Engine) complete: regularity, retention, variance combined into an explainable 0-100 score with stated weights (40/30/30). Credit Passport assembled on-demand via `GET /passport/:workerId`, not per-webhook. Confirmed confidence level: high across multi-employer 6-month synthetic history.

**Day 4** - SMS confirmation loop (`POST /worker/confirm`, form-urlencoded) via Twilio with a simulated-log fallback - `TWILIO_*` still placeholders, real send has never actually run. Income-label scoring fix: `getConfirmedIncomeTransactionsByWorker` excludes `one_off_transfer`/`advance` from ISI even when resolved (`needs_review: false`) - only `recurring_wage`/`gig_payout` count as income. Fraud/anomaly detection (round-number amounts, unnaturally uniform intervals) wired into the classification pipeline - flags force `needs_review` regardless of classifier confidence, never an auto-reject. Worker identity registry (`src/db/workerRegistry.js`) built as a structured interface for self-payment checks and outbound notifications, still empty until a worker actually registers (Day 5).

**Day 5** - Section 5 (worker onboarding) built: `POST /worker/register` + `GET /worker/:workerId` populate the identity registry with phone/name/VPA - self-payment checks and the full SMS confirmation pipeline (phone lookup, pending-confirmation registration, reply resolution) are now verified end-to-end for registered workers, while the actual Twilio network dispatch remains safely simulated (placeholder credentials). Employer linking (`POST /worker/:workerId/employer`, `GET /worker/:workerId/employers`) closes the manual-sync gap: `reference_id` is now deterministically derived from the real registered `worker_id`, not hand-typed. Razorpay is still unconfigured, so calls return an honestly-labeled `mock: true` response with `payment_link_url: null` - the real `paymentLink.create` code path exists but has not been run against live Razorpay keys.

---

## API Endpoints

See the full [API Reference](docs/API_REFERENCE.md) for request/response schemas and curl examples.

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service uptime and health check |
| `POST` | `/webhooks/razorpay` | Real-time Razorpay payment and virtual account webhook ingestion |
| `GET` | `/passport/:workerId` | On-demand Credit Passport (`?view=lender` or `?view=worker`) |
| `POST` | `/worker/register` | Worker onboarding & identity registration |
| `GET` | `/worker/:workerId` | Retrieve registered worker identity profile |
| `POST` | `/worker/:workerId/employer` | Create linked employer payment rail (`RAIL_<workerId>_EMP_<slug>`) |
| `GET` | `/worker/:workerId/employers` | List all linked employer rails for a worker |
| `POST` | `/worker/confirm` | Inbound Twilio SMS confirmation webhook |

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

### 3. Run Test Suite (13 Unit Test Suites)
```bash
npm test
```

### 4. Run Development Server
```bash
npm run dev
# or
npm start
```

### 5. Run Tunnel
```bash
npm run tunnel
```