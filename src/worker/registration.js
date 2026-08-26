const { registerWorker, getWorkerIdentity, isValidPhone } = require('../db/workerRegistry');
const crypto = require('crypto');

function generateWorkerId() {
  return `worker_${crypto.randomBytes(4).toString('hex')}`;
}

// The worker_id returned here is what src/worker/employerLinking.js
// derives reference_id from when a Payment Link is created for this
// worker - registering first is what keeps that reference_id in sync,
// automatically, rather than someone hand-typing it later.
function handleRegister(req, res) {
  const { phone, name, vpa, worker_id } = req.body || {};

  if (!phone || !isValidPhone(phone)) {
    return res.status(400).json({ error: 'A valid phone number is required (e.g. +919876543210)' });
  }

  const finalWorkerId = worker_id || generateWorkerId();
  registerWorker(finalWorkerId, { phone: phone.trim(), name: name || null, vpa: vpa || null });

  console.log(`[registration] Worker ${finalWorkerId} registered with phone ${phone}`);
  return res.status(201).json({ worker_id: finalWorkerId, phone, name: name || null, vpa: vpa || null });
}

function handleGetWorker(req, res) {
  const identity = getWorkerIdentity(req.params.workerId);
  if (!identity) {
    return res.status(404).json({ error: 'Worker not found', worker_id: req.params.workerId });
  }
  return res.json({ worker_id: req.params.workerId, ...identity });
}

module.exports = { handleRegister, handleGetWorker };
