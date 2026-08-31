const config = require('../config/env');
const { getWorkerIdentity } = require('../db/workerRegistry');
const { addEmployerRail } = require('../db/workerEmployerRailRegistry');

function slugify(name) {
  return String(name).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Razorpay rejects reference_id over 40 characters (confirmed live via a
// real 400: "reference_id: the length must be no more than 40."). Slicing
// only the employer slug isn't enough - a long worker_id alone can still
// blow the budget. This truncates the COMPOSITE: worker_id is preferred
// intact (it's the real identity), the slug shrinks first, and worker_id
// itself is only shortened as a last resort if the slug alone can't make
// it fit.
const REFERENCE_ID_MAX_LENGTH = 40;
const REFERENCE_ID_PREFIX = 'RAIL_';
const REFERENCE_ID_MIDDLE = '_EMP_';

function buildReferenceId(workerId, employerSlug) {
  const available = REFERENCE_ID_MAX_LENGTH - REFERENCE_ID_PREFIX.length - REFERENCE_ID_MIDDLE.length;

  let worker = workerId;
  let slug = employerSlug;

  if (worker.length + slug.length > available) {
    slug = slug.slice(0, Math.max(0, available - worker.length));
  }
  if (worker.length + slug.length > available) {
    worker = worker.slice(0, available - slug.length);
  }

  return `${REFERENCE_ID_PREFIX}${worker}${REFERENCE_ID_MIDDLE}${slug}`;
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
  const referenceId = buildReferenceId(workerId, slugify(employer_name));

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

module.exports = { handleAddEmployer, handleGetEmployerRails, buildReferenceId, slugify };
