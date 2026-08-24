/**
 * KamaiPehchan - Classifier Confidence Gate (Day 2)
 *
 * Section 7: Enforces strict confidence thresholds on transaction classifications.
 * Any classification below the confidence threshold (0.70) is gated into
 * `needs_review: true`.
 *
 * Transactions marked with `needs_review: true` are NEVER included in scoring
 * calculations until verified by human-in-the-loop / worker confirmation.
 */

const CONFIDENCE_THRESHOLD = 0.70;

/**
 * Evaluates classification result against confidence threshold.
 *
 * @param {Object} result - Classification result { label, confidence, path, reason }
 * @returns {Object} Gated result with needs_review boolean flag
 */
function applyGate(result) {
  if (result.confidence >= CONFIDENCE_THRESHOLD) {
    return { ...result, needs_review: false };
  }

  return {
    ...result,
    label: 'needs_review',
    needs_review: true,
    original_label: result.label,
  };
}

module.exports = { applyGate, CONFIDENCE_THRESHOLD };
