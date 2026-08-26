const config = require('../config/env');
const { getWorkerIdentity } = require('../db/workerRegistry');
const { addEmployerRail } = require('../db/workerEmployerRailRegistry');

function slugify(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

function isRazorpayConfigured() {
  return !!(config.razorpay.keyId && config.razorpay.keySecret);
}

async function handleAddEmployer(req, res) {
  const { workerId } = req.params;
  const { employer_name } = req.body || {};

  if (!employer_name) {
    return res.status(400).json({ error: 'employer_name is required' });
  }
  const worker = getWorkerIdentity(workerId);
  if (!worker) {
    return res.status(404).json({ error: 'Worker not registered', worker_id: workerId });
  }

  // This IS the fix for Group 1's flagged gap: reference_id is
  // constructed FROM the real registered worker_id, so it's
  // automatically in sync - no manual step needed anymore.
  const referenceId = `RAIL_${workerId}_EMP_${slugify(employer_name)}`;

  if (!isRazorpayConfigured()) {
    console.log(`[employerLinking] Razorpay not configured - returning MOCK payment link for ${referenceId}`);
    const mockEntry = {
      employer_name,
      rail_id: referenceId,
      reference_id: referenceId,
      payment_link_url: null,
      mock: true,
      created_at: new Date().toISOString(),
    };
    addEmployerRail(workerId, mockEntry);
    return res.status(201).json({ ...mockEntry, note: 'MOCK - Razorpay test keys not configured, no real link created' });
  }

  const Razorpay = require('razorpay');
  const razorpay = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });

  try {
    const link = await razorpay.paymentLink.create({
      amount: 100, // placeholder minimum; real amount varies per payment, this just creates the reusable-reference link
      currency: 'INR',
      reference_id: referenceId,
      description: `${employer_name} - ${worker.name || workerId}`,
      notes: { worker_id: workerId, employer_ref: slugify(employer_name) },
    });
    const realEntry = {
      employer_name,
      rail_id: referenceId,
      reference_id: referenceId,
      payment_link_url: link.short_url,
      mock: false,
      created_at: new Date().toISOString(),
    };
    addEmployerRail(workerId, realEntry);
    return res.status(201).json(realEntry);
  } catch (err) {
    console.error('[employerLinking] Razorpay API call failed:', err.message);
    return res.status(502).json({ error: 'Failed to create payment link', detail: err.message });
  }
}

function handleGetEmployerRails(req, res) {
  const { getEmployerRails } = require('../db/workerEmployerRailRegistry');
  return res.json({ worker_id: req.params.workerId, rails: getEmployerRails(req.params.workerId) });
}

module.exports = { handleAddEmployer, handleGetEmployerRails };
