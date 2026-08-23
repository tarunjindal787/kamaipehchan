const { CLASSIFIER_LABELS } = require('./labels');
const { getHistory } = require('../db/transactionStore');

// A note is only classified deterministically off text when it unambiguously
// identifies the category on its own. Near-misses ("salary maybe", "loan
// repay?") carry real uncertainty and must go through LLM-assisted review.
// This is an ADDITIONAL early-exit alongside rail-history matching (Section
// 6a), not the only path - most transactions won't carry a note like this.
const EXACT_NOTE_RULES = new Map([
  ['salary', CLASSIFIER_LABELS.RECURRING_WAGE],
  ['wages', CLASSIFIER_LABELS.RECURRING_WAGE],
  ['wage', CLASSIFIER_LABELS.RECURRING_WAGE],
]);

const MIN_HISTORY_COUNT = 2;
const AMOUNT_TOLERANCE = 0.1;

function classifyDeterministic(transaction) {
  const noteMatch = matchByExactNote(transaction);
  if (noteMatch) {
    return noteMatch;
  }

  return matchByRailHistory(transaction);
}

function matchByExactNote(transaction) {
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

// Section 6a: the same rail (dedicated virtual account) paying a stable
// amount repeatedly is itself strong evidence of a recurring wage - no
// reliance on notes or AI guessing.
function matchByRailHistory(transaction) {
  const railId = transaction?.rail_id;
  if (!railId || typeof transaction.amount !== 'number') {
    return null;
  }

  const history = getHistory(railId);
  if (history.length < MIN_HISTORY_COUNT) {
    return null;
  }

  const avgAmount = history.reduce((sum, t) => sum + t.amount, 0) / history.length;
  if (avgAmount <= 0) {
    return null;
  }

  const deviation = Math.abs(transaction.amount - avgAmount) / avgAmount;
  if (deviation > AMOUNT_TOLERANCE) {
    return null;
  }

  return {
    label: CLASSIFIER_LABELS.RECURRING_WAGE,
    confidence: 1,
    path: 'deterministic',
    reason:
      `Rail history match: ${history.length} prior transactions on ${railId}, ` +
      `avg=${avgAmount.toFixed(2)}, current=${transaction.amount} ` +
      `(within ${(AMOUNT_TOLERANCE * 100).toFixed(0)}%)`,
  };
}

module.exports = { classifyDeterministic };
