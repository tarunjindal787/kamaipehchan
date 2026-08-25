// Minimal, honest stub. Empty until worker onboarding (Section 5) is
// actually built - this surfaced as a missing dependency while wiring
// the self-payment fraud check, not as a Day 4 scope item. Everything
// that reads from this (selfPaymentCheck, notifier) degrades honestly
// to "can't check" / "no phone on file" rather than guessing, for
// every real worker until onboarding populates this.
const registry = new Map();

function registerWorker(worker_id, identity) {
  registry.set(worker_id, identity); // { phone, vpa, email }
}

function getWorkerIdentity(worker_id) {
  return registry.get(worker_id) || null;
}

module.exports = { registerWorker, getWorkerIdentity };
