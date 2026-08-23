const fs = require('fs');
const path = require('path');

async function runBenchmark() {
  const hasLLMKey = !!process.env.LLM_API_KEY;
  console.log(hasLLMKey
    ? '[benchmark] LLM_API_KEY is set - testing real LLM classification.'
    : '[benchmark] WARNING: LLM_API_KEY not set - llm_assisted results below reflect the safety fallback (needs_review), not real LLM reasoning.');

  const seedPath = path.join(__dirname, 'benchmark_payloads', 'synthetic', 'seed_payloads.json');
  const fixtures = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const { classifyTransaction } = require('../src/classifier/index');
  const { applyGate } = require('../src/classifier/confidenceGate');
  const { recordTransaction } = require('../src/db/transactionStore');

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
    bucket.push({ id: fixture.id, correct, latency_ms: latency });
  }

  for (const [path, items] of Object.entries(results)) {
    if (items.length === 0) continue;
    const accuracy = items.filter((i) => i.correct).length / items.length;
    const avgLatency = items.reduce((s, i) => s + i.latency_ms, 0) / items.length;
    console.log(`[${path}] n=${items.length} accuracy=${(accuracy * 100).toFixed(1)}% avg_latency=${avgLatency.toFixed(1)}ms`);
  }
}

runBenchmark();
