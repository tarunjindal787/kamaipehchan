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

**Day 1** - Webhook receiver live and verified against Razorpay test mode events. Classifier and scoring engine in progress.

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