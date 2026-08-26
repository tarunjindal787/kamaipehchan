// Prevents reprocessing the same webhook event on a network retry.
// In-memory for the prototype - swap for an atomic Redis SETNX (with
// TTL) or a unique DB constraint on event_id before this runs for real.
const processedEventIds = new Set();

function isDuplicateEvent(eventId) {
  if (!eventId) return false;
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  return false;
}

module.exports = { isDuplicateEvent };
