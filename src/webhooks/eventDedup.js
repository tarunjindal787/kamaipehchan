/**
 * KamaiPehchan - Webhook Event Idempotency & Deduplication (Day 1)
 *
 * Prevents duplicate processing of payment webhook events (e.g. on network retries).
 *
 * NOTE: In-memory store for the prototype. In production, back this with
 * an atomic Redis key (SETNX with TTL) or a unique DB constraint on event_id.
 */

const processedEventIds = new Set();

/**
 * Checks if an event ID has already been processed.
 * If new, registers the event ID and returns false.
 *
 * @param {string} eventId - Unique event or payment entity identifier
 * @returns {boolean} True if duplicate, false if new event
 */
function isDuplicateEvent(eventId) {
  if (!eventId) return false;
  if (processedEventIds.has(eventId)) return true;
  processedEventIds.add(eventId);
  return false;
}

module.exports = { isDuplicateEvent };
