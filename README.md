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

**Day 2** - Module 1 (hybrid classifier) wired end-to-end: `normalize` -> `classifyAndRecord` (deterministic rail-history/note matching, LLM fallback, confidence gate, simulated worker confirmation) -> webhook response - confirmed live via direct webhook smoke tests, not just unit tests. Benchmark: 100% accuracy on both `deterministic` and `llm_unavailable` paths, but the latter reflects the safety fallback (no `LLM_API_KEY` set), not real LLM reasoning - the real Anthropic call has never been run (superseded once real Gemini credentials were configured - see Day 6's first genuine `llm_assisted` benchmark). Known gap: `rail_id` still resolves to `null` on the only real captured sample - it predates `reference_id`-on-Payment-Link testing and has neither `virtual_account_id` nor `reference_id`.

**Day 3** - Module 2 (ISI Engine) complete: regularity, retention, variance combined into an explainable 0-100 score with stated weights (40/30/30). Credit Passport assembled on-demand via `GET /passport/:workerId`, not per-webhook. Confirmed confidence level: high across multi-employer 6-month synthetic history.

**Day 4** - SMS confirmation loop (`POST /worker/confirm`, form-urlencoded) via Twilio with a simulated-log fallback - `TWILIO_*` still placeholders, real send has never actually run. Income-label scoring fix: `getConfirmedIncomeTransactionsByWorker` excludes `one_off_transfer`/`advance` from ISI even when resolved (`needs_review: false`) - only `recurring_wage`/`gig_payout` count as income. Fraud/anomaly detection (round-number amounts, unnaturally uniform intervals) wired into the classification pipeline - flags force `needs_review` regardless of classifier confidence, never an auto-reject. Worker identity registry (`src/db/workerRegistry.js`) built as a structured interface for self-payment checks and outbound notifications, still empty until a worker actually registers (Day 5).

**Day 5** - Section 5 (worker onboarding) built: `POST /worker/register` + `GET /worker/:workerId` populate the identity registry with phone/name/VPA - self-payment checks and the full SMS confirmation pipeline (phone lookup, pending-confirmation registration, reply resolution) are now verified end-to-end for registered workers, while the actual Twilio network dispatch remains safely simulated (placeholder credentials). Employer linking (`POST /worker/:workerId/employer`, `GET /worker/:workerId/employers`) closes the manual-sync gap: `reference_id` is now deterministically derived from the real registered `worker_id`, not hand-typed. Razorpay is still unconfigured, so calls return an honestly-labeled `mock: true` response with `payment_link_url: null` - the real `paymentLink.create` code path exists but has not been run against live Razorpay keys.

**Day 6** - Real Razorpay test-mode keys configured for the first time: registered a real worker, created and paid a real employer Payment Link end-to-end. **`reference_id` question closed (open since Day 1):** confirmed it exists in a real webhook, only on `payment_link.paid`. Deployed to Railway, verified against the live instance; first real `llm_assisted` Gemini benchmark - 40.0% accuracy, ~33.6s avg latency, confirmed genuine (not fallback). Twilio remains explicitly deferred. See [Detailed Findings](#detailed-findings) for the dedup collision, double-classification fix, webhook-secret incident, Gemini quota cap, benchmark validity fix, and Privacy layer corrections.

**Day 7** - Built three UI screens (worker Credit Passport, worker onboarding, lender underwriting dashboard - `public/passport.html`, `public/onboarding.html`, `public/dashboard.html`, served via `express.static`); lender view wired to the existing Privacy layer's redaction (`?view=lender`). `reference_id` for `payment_link.paid` now read directly from `payload.payment_link.entity`, not just the notes fallback. Fixed a frontend bug where onboarding sent `vpas: []` (an array) instead of the `vpa` string the backend expects - silently dropping the worker's UPI and weakening `selfPaymentCheck`. Full `API_REFERENCE.md` audit found and fixed four real drift issues (vpa field shape, `pii_stripped` -> `pii_never_collected` rename, a fabricated `/worker/confirm` JSON response, a missing mock-mode employer example); added the Cost & Infrastructure transparency section below. Honest note: the three UI screens have been verified by tracing real API data through the render logic, not by a browser screenshot.

---

## Detailed Findings

### Day 6

Fixed two real bugs found live: a dedup collision (`payment.captured` and `payment_link.paid` share the same payment ID, so the second was being silently dropped as a duplicate - now keyed by event type) and a missing `rail_id` fallback (`normalize.js` now composites `notes.worker_id` + `notes.employer_ref`, since a real webhook carries neither `virtual_account_id` nor `reference_id`) - classification now succeeds end-to-end on real webhooks, confirmed live. `employerLinking.js`'s `reference_id` construction now guarantees the full composite never exceeds Razorpay's confirmed 40-char limit (truncates the whole string, not just the employer-name slug), tested with a deliberately long worst case. LLM switched from Anthropic to Gemini (the configured key returned a real 401 from Anthropic, no auth error from Google) - real classifications now come back (native `responseMimeType`/`responseSchema` JSON mode, plus `maxOutputTokens` raised from 300 to 2048 after discovering `gemini-3.6-flash`'s internal "thinking" tokens were silently truncating every response before the visible JSON appeared). Also corrected two accuracy issues in the Privacy & Selective Disclosure layer (`src/privacy/`, added outside this session): `pii_stripped` renamed to `pii_never_collected` since `buildPassport()` never included those fields to begin with, and `anonymizeRail`'s docstring corrected to match its real behavior (employer name is intentionally preserved, not masked). Twilio remains explicitly deferred - still placeholder credentials, not touched this round. Deployed to Railway (in-memory stores make it a bad fit for serverless/Vercel); verified end-to-end against the deployed instance, not just localhost - a real webhook secret rotation initially broke signature verification (a `--stdin` piping mistake captured a stray console banner alongside the secret, corrupting it to 86 chars instead of 10 - caught by hashing the Railway-side value and comparing it to `.env`, fixed, redeployed, reverified). That same deployed run surfaced and fixed a real double-classification bug: `payment.captured` and `payment_link.paid` both fire for the same real payment, and since Day 6's dedup fix keys by event-type + payment ID (deliberately, so both still get logged for audit), both were independently triggering a full classifier call for the same rupee - `src/webhooks/classificationDedup.js` now caches the in-flight promise per payment ID (not just the final result, since real deliveries for the two event types can arrive before the first LLM call, which takes 50-100s, has even resolved) so only one real classification happens; the second event logs that it's reusing the existing result. Classification log lines now also carry a payment/event correlation ID, closing an observability gap found during that same investigation. **First real `llm_assisted` benchmark (2026-08-31),** run after Gemini credentials were live and the dedup fix deployed - `node tests/benchmarkRunner.js`: `deterministic` n=10, 100.0% accuracy, avg_latency 0.0ms (unchanged); `llm_assisted` n=10, **40.0% accuracy, avg_latency 33607.3ms (~33.6s)** - the latency confirms these are genuine Gemini network calls (matching the tens-of-seconds range observed in the real deployed webhook test), not the near-instant safety fallback. The 40% figure is real, not fallback-driven, and is honestly disappointing: several fixtures get a confident (≥0.70) `needs_review` label directly from Gemini itself - a legitimate "I can't confidently categorize this" answer - which the benchmark's correctness check scores as wrong whenever the fixture expected a specific category instead; this is a genuine LLM-quality/prompt gap worth investigating before treating this path as pilot-ready, not something fixed in this pass. (While pointing this benchmark at the real key, also caught and fixed a narrow ordering bug in `tests/benchmarkRunner.js` itself: its `LLM_API_KEY` warning check ran before the `require` that actually loads `.env`, so it printed the "not set" fallback warning even with a real key configured - the actual classification calls were unaffected, since `config.llm.apiKey` is a live getter, but the diagnostic message was wrong.)

**Gemini free-tier hard cap discovered live (2026-09-01):** while investigating the 40% figure with per-fixture verbose logging, two more real benchmark runs quietly turned into pure safety-net fallbacks - `generativelanguage.googleapis.com` caps `gemini-3.6-flash` at **20 requests/day per project** on the free tier (confirmed via a real `429 RESOURCE_EXHAUSTED`, `quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`), and Run 1 plus the two follow-up runs together used 30 calls in one day. Past the cap, `classifyWithLLM` correctly falls back to `needs_review` instead of crashing - but that fallback happened to score as a false "100% accuracy" on these particular fixtures, since their ground truth is also `needs_review`. `benchmarkRunner.js` couldn't previously tell a genuine model response apart from this fallback in its accuracy math; fixed to report `llm_assisted (real)` and `llm_assisted (fallback, excluded from accuracy)` as two separate lines, so a quota-exhausted run can never again silently masquerade as a clean number. Don't plan more than ~15 real `llm_assisted` calls against this key in a single calendar day. Run 1's real `40.0%` / `33.6s` figure above remains the only genuine measurement and stays as the documented number - whether Gemini was specifically overconfident on the fixtures it got wrong is still an open question, since verbose per-fixture logging wasn't added until after Run 1 had already finished; answering it needs one more real run once the daily quota resets.

---

## Cost & Infrastructure

This project is built entirely on free tiers - no payment method has been added to any service, and no feature has been built assuming a paid tier.

| Service | Cost | Notes |
| :--- | :--- | :--- |
| Razorpay | Free | Test Mode only (`rzp_test_...` keys) - no real transactions, no fees |
| Gemini API | Free | Free tier, 20 requests/day/project/model hard cap (confirmed live via a real `429 RESOURCE_EXHAUSTED`) |
| Railway | Free | $5 trial credit, 30 days, no card on file - real usage to date is a few cents, well within the credit |
| ngrok | Free | Basic tunneling tier - the configured credential is a tunnel authtoken (not an API key), so the plan tier isn't independently verifiable via API, but nothing in this project's usage (a single ad-hoc tunnel) suggests otherwise |
| GitHub | Free | Public repo (confirmed) |
| Twilio | Not yet configured | `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN` are unset - deferred; free trial available if added later |

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
