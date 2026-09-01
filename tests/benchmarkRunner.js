const fs = require('fs');
const path = require('path');

async function runBenchmark() {
  // The requires below (via src/classifier/index -> .../config/env.js) are
  // what actually load .env - they must run before checking LLM_API_KEY,
  // otherwise this check always sees an empty process.env and prints the
  // fallback warning even when a real key is configured (config.llm.apiKey
  // itself is a live getter and resolves correctly regardless - this was
  // only ever a bug in this diagnostic message, not the classifier calls
  // below it, confirmed live when a real Gemini key was first configured).
  const { classifyTransaction } = require('../src/classifier/index');
  const { applyGate } = require('../src/classifier/confidenceGate');
  const { recordTransaction } = require('../src/db/transactionStore');
  const config = require('../src/config/env');

  const hasLLMKey = !!config.llm.apiKey;
  console.log(hasLLMKey
    ? '[benchmark] LLM_API_KEY is set - testing real LLM classification.'
    : '[benchmark] WARNING: LLM_API_KEY not set - llm_assisted results below reflect the safety fallback (needs_review), not real LLM reasoning.');

  const seedPath = path.join(__dirname, 'benchmark_payloads', 'synthetic', 'seed_payloads.json');
  const fixtures = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const results = { deterministic: [], llm_assisted: [], llm_unavailable: [] };

  for (const fixture of fixtures) {
    for (const histItem of fixture.history || []) {
      recordTransaction(histItem);
    }
    const start = Date.now();
    const raw = await classifyTransaction(fixture.transaction);
    const latency = Date.now() - start;
    const gated = applyGate(raw);

    const correct = gated.needs_review
      ? fixture.label === 'needs_review'
      : gated.label === fixture.label;

    const bucket = results[gated.path] || (results[gated.path] = []);
    // llm_assisted can silently BE the safety-net fallback (quota
    // exhaustion, network failure, or a malformed response -> held at
    // needs_review) rather than a genuine model response - confirmed live
    // (Day 6: a Gemini free-tier quota exhaustion mid-run scored a false
    // "100% accuracy" this way, since these particular fixtures' ground
    // truth also happens to be needs_review). raw.parse_error is already
    // llmClassifier.js's own signal for exactly this - split on it so a
    // fallback-only run can never again silently masquerade as a clean
    // accuracy number.
    bucket.push({ id: fixture.id, correct, latency_ms: latency, fallback: !!raw.parse_error });
  }

  for (const [pathName, items] of Object.entries(results)) {
    if (items.length === 0) continue;

    if (pathName === 'llm_assisted') {
      const real = items.filter((i) => !i.fallback);
      const fallback = items.filter((i) => i.fallback);

      if (real.length > 0) {
        const accuracy = real.filter((i) => i.correct).length / real.length;
        const avgLatency = real.reduce((s, i) => s + i.latency_ms, 0) / real.length;
        console.log(`[llm_assisted (real)] n=${real.length} accuracy=${(accuracy * 100).toFixed(1)}% avg_latency=${avgLatency.toFixed(1)}ms`);
      }
      if (fallback.length > 0) {
        console.log(`[llm_assisted (fallback, excluded from accuracy)] n=${fallback.length} - request failed or was quota-exhausted and silently held at needs_review; not genuine model reasoning`);
      }
      continue;
    }

    const accuracy = items.filter((i) => i.correct).length / items.length;
    const avgLatency = items.reduce((s, i) => s + i.latency_ms, 0) / items.length;
    console.log(`[${pathName}] n=${items.length} accuracy=${(accuracy * 100).toFixed(1)}% avg_latency=${avgLatency.toFixed(1)}ms`);
  }
}

runBenchmark();
