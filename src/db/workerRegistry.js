// Day 5 (Section 5): worker onboarding now populates this via
// src/worker/registration.js. Everything that reads from it
// (selfPaymentCheck, notifier) still degrades honestly to "can't
// check" / "no phone on file" for any worker who hasn't registered.
const registry = new Map();

function registerWorker(worker_id, identity) {
  registry.set(worker_id, identity); // { phone, vpa, email }
}

function getWorkerIdentity(worker_id) {
  return registry.get(worker_id) || null;
}

function isValidPhone(phone) {
  return typeof phone === 'string' && /^\+?[0-9]{10,15}$/.test(phone.trim());
}

module.exports = { registerWorker, getWorkerIdentity, isValidPhone };
