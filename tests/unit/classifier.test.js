const assert = require('assert');
const { classifyTransaction, CLASSIFIER_LABELS } = require('../../src/classifier');
const seedPayloads = require('../benchmark_payloads/synthetic/seed_payloads.json');

console.log('Running unit test: tests/unit/classifier.test.js');

async function run() {
  for (const seed of seedPayloads) {
    const transaction = seed.payload.payload;
    const result = await classifyTransaction(transaction);

    if (seed.expected_path === 'deterministic') {
      assert.strictEqual(
        result.path,
        'deterministic',
        `${seed.id}: expected deterministic path, got ${result.path}`
      );
      assert.strictEqual(
        result.label,
        seed.label,
        `${seed.id}: expected label ${seed.label}, got ${result.label}`
      );
    } else {
      // expected_path === 'llm_assisted': the deterministic filter must not
      // claim these. Without a configured LLM_API_KEY, they correctly fall
      // to needs_review instead of exercising the real (unconfigured) LLM path.
      assert.notStrictEqual(
        result.path,
        'deterministic',
        `${seed.id}: should not be classified deterministically`
      );
      assert.strictEqual(
        result.label,
        CLASSIFIER_LABELS.NEEDS_REVIEW,
        `${seed.id}: expected needs_review without LLM configured`
      );
    }
  }

  console.log(
    `✅ Unit test passed: ${seedPayloads.length} classifier fixtures verified ` +
      '(10 deterministic, 10 correctly routed away from deterministic).'
  );
}

run().catch((err) => {
  console.error('❌ Classifier test failed:', err);
  process.exit(1);
});
