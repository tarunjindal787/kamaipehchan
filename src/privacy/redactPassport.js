/**
 * KamaiPehchan - Privacy & Selective Disclosure Layer
 *
 * Section 8: Implements privacy-preserving data redaction for third-party credit appraisals.
 *
 * Provides view-level selective disclosure:
 * - 'full' (Worker View): Unredacted access to individual employer rails, transaction histories, and raw metrics.
 * - 'lender' (Lender/Underwriter View): Privacy-preserving credit assessment.
 *   - Masks the internal worker/rail identifier with an anonymized token
 *     (e.g. "Verified Rail #1") - the employer name itself is intentionally
 *     preserved (e.g. "Verified Rail #1 (ZEPTO)"), not hidden. See
 *     anonymizeRail() below for why.
 *   - Computes income stability bands while hiding raw private metadata.
 *   - buildPassport()'s output never contains phone numbers, full names, or
 *     bank VPAs in the first place - there's nothing to strip here, see
 *     pii_never_collected below.
 */

/**
 * Masks the internal worker/rail identifier portion of a rail ID, replacing
 * it with a clean positional label. The employer name is deliberately
 * NOT masked - "RAIL_worker_123_EMP_ZEPTO" becomes "Verified Rail #1 (ZEPTO)",
 * not a fully anonymous "Employer Rail #1". This is a deliberate design
 * choice (a lender arguably needs to know which employers back a worker's
 * income for "verified income" to mean anything), not an oversight - but
 * it is pending explicit confirmation that this is the intended privacy
 * boundary, not yet signed off on.
 *
 * @param {string} railId - e.g. "RAIL_worker_123_EMP_ZEPTO"
 * @param {number} index - Numerical index for clean presentation
 * @returns {string} e.g. "Verified Rail #1 (ZEPTO)" or "Verified Rail #1"
 */
function anonymizeRail(railId, index) {
  if (!railId) return `Employer Rail #${index + 1}`;
  const parts = railId.split('_EMP_');
  const employerTag = parts.length > 1 ? ` (${parts[1]})` : '';
  return `Verified Rail #${index + 1}${employerTag}`;
}

// income_shock.risk_factors (src/scoring/incomeShock.js) are plain strings
// that can name a raw rail_id (e.g. "Rail RAIL_worker_123_EMP_ZEPTO had
// confirmed payments..."). The lender view must never see that raw
// identifier - anonymizeRail() above is exactly how retentionByRail keys
// are already masked, so the same railId -> maskedName mapping is reused
// here rather than re-deriving the mapping differently.
function maskRailReferences(text, railIdToMasked) {
  let masked = text;
  for (const [railId, maskedName] of Object.entries(railIdToMasked)) {
    if (railId) masked = masked.split(railId).join(maskedName);
  }
  return masked;
}

// Bracket boundaries (₹10k/25k/50k/1L) are a placeholder heuristic, not a
// validated credit-bureau standard - flag for review during the pilot
// (Section 10), same caveat as isiEngine.js's weights and regularity.js's
// formula.
function getIncomeBand(amountPaise) {
  if (amountPaise === null || amountPaise === undefined) return 'No Verified Income History';
  const amountInr = Math.round(amountPaise / 100);

  if (amountInr < 10000) return 'Under ₹10,000 / month';
  if (amountInr < 25000) return '₹10,000 - ₹25,000 / month';
  if (amountInr < 50000) return '₹25,000 - ₹50,000 / month';
  if (amountInr < 100000) return '₹50,000 - ₹1,00,000 / month';
  return '₹1,00,000+ / month';
}

/**
 * Formats and redacts a Credit Passport according to the requested view scope.
 *
 * @param {Object} passport - Full passport object from buildPassport()
 * @param {'full'|'lender'|'worker'} [view='full'] - Disclosure scope
 * @returns {Object} Formatted / redacted Credit Passport
 */
function redactPassport(passport, view = 'full') {
  if (!passport || passport.status === 'insufficient_data') {
    return passport;
  }

  // If full or worker view requested, return unredacted passport
  if (view === 'full' || view === 'worker') {
    return {
      ...passport,
      view_mode: 'worker_full',
      income_band: getIncomeBand(passport.six_month_avg_income),
    };
  }

  // Lender-safe privacy-preserving view
  const redactedRetention = { ...passport.breakdown.retention };
  const railIdToMasked = {};
  if (redactedRetention.retentionByRail) {
    const sanitizedRails = {};
    Object.keys(redactedRetention.retentionByRail).forEach((railId, idx) => {
      const maskedName = anonymizeRail(railId, idx);
      railIdToMasked[railId] = maskedName;
      sanitizedRails[maskedName] = {
        monthsActive: redactedRetention.retentionByRail[railId].monthsActive,
        transactionCount: redactedRetention.retentionByRail[railId].transactionCount,
      };
    });
    redactedRetention.retentionByRail = sanitizedRails;
  }

  const incomeShock = passport.income_shock
    ? {
        ...passport.income_shock,
        risk_factors: (passport.income_shock.risk_factors || []).map((f) => maskRailReferences(f, railIdToMasked)),
      }
    : passport.income_shock;

  return {
    worker_id: passport.worker_id,
    isi_score: passport.isi_score,
    confidence: passport.confidence,
    active_employer_count: passport.active_employer_count,
    six_month_avg_income_inr: passport.six_month_avg_income ? Math.round(passport.six_month_avg_income / 100) : null,
    income_band: getIncomeBand(passport.six_month_avg_income),
    weights_used: passport.weights_used,
    // consistency_rating / stability_rating cutoffs (80/50) are a
    // placeholder heuristic, not validated against real pilot data -
    // flag for review during the pilot (Section 10), same caveat as
    // isiEngine.js's weights and regularity.js's formula.
    breakdown: {
      regularity: {
        score: passport.breakdown.regularity.score,
        consistency_rating: passport.breakdown.regularity.score >= 80 ? 'HIGH' : passport.breakdown.regularity.score >= 50 ? 'MODERATE' : 'IRREGULAR',
      },
      retention: {
        score: redactedRetention.score,
        activeEmployerCount: redactedRetention.activeEmployerCount,
        avgMonthsRetained: redactedRetention.avgMonthsRetained,
        retentionByRail: redactedRetention.retentionByRail,
      },
      variance: {
        score: passport.breakdown.variance.score,
        stability_rating: passport.breakdown.variance.score >= 80 ? 'STABLE' : passport.breakdown.variance.score >= 50 ? 'MODERATE' : 'VOLATILE',
        monthsObserved: passport.breakdown.variance.monthsObserved || 6,
      },
    },
    income_shock: incomeShock,
    privacy: {
      redacted: true,
      view_mode: 'lender_underwriting',
      // buildPassport()'s output never contains these fields to begin
      // with (see src/passport/buildPassport.js) - there's nothing
      // actively "stripped" here. This states what's absent, not a
      // claim of removal.
      pii_never_collected: ['phone', 'vpa_address', 'bank_account_number', 'raw_transaction_ids'],
    },
    generated_at: passport.generated_at,
  };
}

module.exports = {
  redactPassport,
  getIncomeBand,
  anonymizeRail,
};
