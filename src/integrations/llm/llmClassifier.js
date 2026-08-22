const config = require('../../config/env');
const { CLASSIFIER_LABELS } = require('../../classifier/labels');

/**
 * LLM-assisted classification for transactions the deterministic filter
 * can't confidently label. Without LLM_API_KEY configured, transactions
 * are held at needs_review for manual triage rather than guessed at.
 */
async function classifyWithLLM(transaction) {
  if (!config.llm.apiKey) {
    return {
      label: CLASSIFIER_LABELS.NEEDS_REVIEW,
      confidence: 0,
      path: 'llm_unavailable',
      reason: 'LLM_API_KEY not configured - held for manual review',
    };
  }

  // TODO (Day 2+): implement the real LLM call once LLM_API_KEY is available
  // and the prompt/response contract for ambiguous-note classification is defined.
  throw new Error('LLM classification path not yet implemented');
}

module.exports = { classifyWithLLM };
