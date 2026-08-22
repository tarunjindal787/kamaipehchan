const { CLASSIFIER_LABELS } = require('./labels');

// Deliberately exact-match and conservative: a note is only classified
// deterministically when it unambiguously identifies the category on its
// own. Near-misses ("salary maybe", "loan repay?") carry real uncertainty
// and must go through LLM-assisted review instead of a fuzzy keyword match.
const EXACT_NOTE_RULES = new Map([
  ['salary', CLASSIFIER_LABELS.RECURRING_WAGE],
  ['wages', CLASSIFIER_LABELS.RECURRING_WAGE],
  ['wage', CLASSIFIER_LABELS.RECURRING_WAGE],
]);

function classifyDeterministic(transaction) {
  const note = (transaction?.note || '').trim().toLowerCase();
  const label = EXACT_NOTE_RULES.get(note);

  if (!label) {
    return null;
  }

  return {
    label,
    confidence: 1,
    path: 'deterministic',
    reason: `Exact note match: "${note}"`,
  };
}

module.exports = { classifyDeterministic };
