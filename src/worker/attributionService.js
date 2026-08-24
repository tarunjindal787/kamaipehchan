/**
 * KamaiPehchan - Rail-Level Employer Attribution Service (Day 1)
 *
 * Implements Section 6a: Employer attribution guaranteed by the payment rail.
 * Each worker has a dedicated Virtual Account per employer (e.g. Swiggy, Zepto, Blinkit).
 * Incoming webhook events are attributed strictly via virtual_account_id lookup in the
 * registry, with ZERO reliance on free-text notes, descriptions, or AI guessing.
 */

// In-memory mapping table (prototype for DB: virtual_accounts table)
const virtualAccountRegistry = new Map();

/**
 * Registers or provisions a dedicated Virtual Account for a (worker, employer) pair.
 *
 * @param {Object} params
 * @param {string} params.virtualAccountId - Unique Virtual Account ID (e.g. 'va_worker1_zepto')
 * @param {string} params.workerId - Unique worker identifier
 * @param {string} params.employerRef - Verified employer identifier (e.g. 'Zepto')
 * @param {string} [params.description] - Optional human-readable rail description
 * @returns {Object} Registered record
 */
function registerVirtualAccount({ virtualAccountId, workerId, employerRef, description }) {
  const record = {
    virtualAccountId,
    workerId,
    employerRef,
    description: description || `Dedicated collection rail for ${employerRef}`,
    createdAt: new Date().toISOString(),
  };
  virtualAccountRegistry.set(virtualAccountId, record);
  return record;
}

/**
 * Attributes an incoming payment strictly by the payment rail's Virtual Account ID.
 * Completely ignores unverified payer notes or heuristic text matching.
 *
 * @param {Object} event - Raw or normalized webhook event payload
 * @returns {Object} Attribution outcome { attributed: boolean, workerId, employerRef, amountInr, ... }
 */
function attributePaymentFromRail(event) {
  // Extract virtual account identifier from Razorpay webhook payload
  const vaId =
    event?.payload?.virtual_account?.entity?.id ||
    event?.payload?.payment?.entity?.virtual_account_id ||
    event?.payload?.virtual_account_id;

  if (!vaId) {
    return {
      attributed: false,
      reason: 'No virtual_account_id found in payment rail payload',
      workerId: null,
      employerRef: null,
    };
  }

  const mapping = virtualAccountRegistry.get(vaId);

  if (!mapping) {
    return {
      attributed: false,
      reason: `Unregistered virtual account: ${vaId}`,
      virtualAccountId: vaId,
      workerId: null,
      employerRef: null,
    };
  }

  const amountPaise = event?.payload?.payment?.entity?.amount || event?.payload?.amount || 0;
  const amountInr = amountPaise / 100;
  const paymentId = event?.payload?.payment?.entity?.id || event?.id;

  return {
    attributed: true,
    attributionSource: 'RAZORPAY_VIRTUAL_ACCOUNT_RAIL',
    virtualAccountId: vaId,
    workerId: mapping.workerId,
    employerRef: mapping.employerRef,
    amountInr,
    paymentId,
    verifiedAt: new Date().toISOString(),
  };
}

module.exports = {
  virtualAccountRegistry,
  registerVirtualAccount,
  attributePaymentFromRail,
};
