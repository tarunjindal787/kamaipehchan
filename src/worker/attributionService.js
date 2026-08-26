// Section 6a: each worker has a dedicated Virtual Account per employer,
// so attribution comes straight from the payment rail (virtual_account_id)
// rather than free-text notes, descriptions, or any kind of guessing.

// In-memory mapping table (prototype for DB: virtual_accounts table)
const virtualAccountRegistry = new Map();

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
