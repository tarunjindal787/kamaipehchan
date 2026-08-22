const { CLASSIFIER_LABELS } = require('./labels');
const { classifyDeterministic } = require('./deterministicClassifier');
const { classifyWithLLM } = require('../integrations/llm/llmClassifier');

/**
 * Categorizes a normalized transaction (see tests/benchmark_payloads/synthetic
 * for the expected shape) into recurring wages, gig payouts, advances,
 * transfers, or needs_review. Tries the deterministic rule filter first;
 * anything it can't confidently label falls through to LLM-assisted review.
 */
async function classifyTransaction(transaction) {
  const deterministic = classifyDeterministic(transaction);
  if (deterministic) {
    return deterministic;
  }

  return classifyWithLLM(transaction);
}

module.exports = { classifyTransaction, CLASSIFIER_LABELS };
