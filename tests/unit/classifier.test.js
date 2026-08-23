const assert = require('assert');
const { classifyTransaction, CLASSIFIER_LABELS } = require('../../src/classifier');
const { recordTransaction } = require('../../src/db/transactionStore');
const seedPayloads = require('../benchmark_payloads/synthetic/seed_payloads.json');

console.log('Running unit test: tests/unit/classifier.test.js');

async function run() {
  const counts = { history_match: 0, note_match: 0, no_history: 0, amount_mismatch: 0 };

  for (const seed of seedPayloads) {
    for (const priorTransaction of seed.history) {
      recordTransaction(priorTransaction);
    }

    const result = await classifyTransaction(seed.transaction);

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

    const category = Object.keys(counts).find((key) => seed.id.startsWith(key));
    if (category) counts[category] += 1;
  }

  console.log(
    `✅ Unit test passed: ${seedPayloads.length} classifier fixtures verified - ` +
      `${counts.history_match} same-rail-history matches, ` +
      `${counts.note_match} note-based matches, ` +
      `${counts.no_history} no-history fallthroughs, ` +
      `${counts.amount_mismatch} amount-mismatch fallthroughs.`
  );
}

run().catch((err) => {
  console.error('❌ Classifier test failed:', err);
  process.exit(1);
});
