const CONFIRMATION_TIMEOUT_MS = 48 * 60 * 60 * 1000; // 48h, Section 7
const pending = new Map();

function registerPending(phoneNumber, transaction) {
  pending.set(phoneNumber, { transaction, expiresAt: Date.now() + CONFIRMATION_TIMEOUT_MS });
}

// Read-only lookup - does NOT consume the pending slot. Use this to decide
// how to handle a reply before committing to resolving it; an unrecognized
// reply must be able to leave the entry in place for a later valid reply.
function peekPending(phoneNumber) {
  const entry = pending.get(phoneNumber);
  return entry ? entry.transaction : null;
}

function resolvePending(phoneNumber) {
  const entry = pending.get(phoneNumber);
  if (!entry) return null;
  pending.delete(phoneNumber);
  return entry.transaction;
}

// Section 7: unanswered transactions stay needs_review=true forever -
// this just cleans up stale map entries, it doesn't change any
// transaction's status (that's already true in transactionStore).
function sweepExpired() {
  const now = Date.now();
  let count = 0;
  for (const [phone, entry] of pending.entries()) {
    if (entry.expiresAt <= now) { pending.delete(phone); count++; }
  }
  return count;
}

module.exports = { registerPending, peekPending, resolvePending, sweepExpired, CONFIRMATION_TIMEOUT_MS };
