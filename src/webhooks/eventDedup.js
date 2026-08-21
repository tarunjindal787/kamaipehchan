// In-memory idempotency store for Day 1 prototype only.
// Replace with a persistent store (DB/Redis) beyond the demo stage -
// this resets on server restart and won't work across multiple instances.
const processedEventIds = new Set();

function isDuplicateEvent(eventId) {
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  return false;
}

module.exports = { isDuplicateEvent };
