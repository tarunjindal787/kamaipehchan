/**
 * Checks whether the payer identity plausibly traces back to the
 * worker's own identity - the most direct collusion pattern named in
 * Section 7a. Compares the transaction's real payer_identifier
 * (contact/vpa/email from the raw webhook) against the worker's
 * registered identity (src/db/workerRegistry.js) - not against
 * worker_id itself, which is an arbitrary label, not a comparable
 * identity signal. This is a heuristic, not a KYC-grade check.
 */
const { getWorkerIdentity } = require('../db/workerRegistry');

function isSelfPayment(transaction) {
  const workerIdentity = getWorkerIdentity(transaction.worker_id);
  if (!transaction.payer_identifier || !workerIdentity) {
    return { checked: false, reason: !workerIdentity ? 'no_worker_identity_on_file' : 'no_payer_identifier' };
  }
  const normalize = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const candidates = [workerIdentity.phone, workerIdentity.vpa, workerIdentity.email].filter(Boolean);
  const match = candidates.some((c) => normalize(c) === normalize(transaction.payer_identifier));
  return { checked: true, isSelfPayment: match };
}

module.exports = { isSelfPayment };
