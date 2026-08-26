// Section 7: anything below the confidence threshold gets gated to
// needs_review and is excluded from scoring until a human (worker
// confirmation) resolves it.
const CONFIDENCE_THRESHOLD = 0.70;

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
