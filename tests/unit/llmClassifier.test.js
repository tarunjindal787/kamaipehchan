const assert = require('assert');

console.log('Running unit test: tests/unit/llmClassifier.test.js');

async function run() {
  // Require first, delete after: config/env.js's require('dotenv').config()
  // only runs on this first require and won't override an already-set
  // process.env var - but deleting LLM_API_KEY BEFORE this require would
  // re-open the door for dotenv to inject the real .env value right back
  // in, which is exactly what happened once .env stopped being a placeholder.
  const { classifyWithLLM } = require('../../src/integrations/llm/llmClassifier');
  const { CLASSIFIER_LABELS } = require('../../src/classifier/labels');

  // --- Scenario 1: LLM_API_KEY unset -> safe fallback, no real API call ---
  delete process.env.LLM_API_KEY;

  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called when LLM_API_KEY is unset');
  };

  const unsetResult = await classifyWithLLM({
    rail_id: 'va_test_unset',
    amount: 1234,
    note: 'unclear',
    credited_at: '2026-01-01T00:00:00Z',
  });

  assert.strictEqual(fetchCalled, false, 'fetch must not be called when LLM_API_KEY is unset');
  assert.strictEqual(unsetResult.label, CLASSIFIER_LABELS.NEEDS_REVIEW);
  assert.strictEqual(unsetResult.confidence, 0);
  assert.strictEqual(unsetResult.path, 'llm_unavailable');

  console.log('  ✓ LLM_API_KEY unset -> needs_review fallback, no API call made');

  // --- Scenario 2: LLM_API_KEY set (fake, fetch is mocked - never hits the
  // real API), model returns malformed JSON -> needs_review + parse_error ---
  process.env.LLM_API_KEY = 'sk-ant-fake-test-key-do-not-use';

  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'text', text: 'Sure, here you go:\n```json\n{not valid json' }],
    }),
    text: async () => 'unused',
  });

  const malformedResult = await classifyWithLLM({
    rail_id: 'va_test_malformed',
    amount: 4321,
    note: 'unclear',
    credited_at: '2026-01-02T00:00:00Z',
  });

  assert.strictEqual(malformedResult.label, CLASSIFIER_LABELS.NEEDS_REVIEW);
  assert.strictEqual(malformedResult.confidence, 0);
  assert.strictEqual(malformedResult.path, 'llm_assisted');
  assert.strictEqual(malformedResult.parse_error, true);
  assert.strictEqual(typeof malformedResult.latency_ms, 'number');

  console.log('  ✓ Malformed LLM JSON response -> needs_review with parse_error flag');

  delete process.env.LLM_API_KEY;
  console.log('✅ Unit test passed: LLM classifier fallback and parse-error paths verified.');
}

run().catch((err) => {
  console.error('❌ llmClassifier test failed:', err);
  process.exit(1);
});
