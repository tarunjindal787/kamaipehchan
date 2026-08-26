/**
 * KamaiPehchan - Privacy & Selective Disclosure Layer
 *
 * Section 8: Implements privacy-preserving data redaction for third-party credit appraisals.
 *
 * Provides view-level selective disclosure:
 * - 'full' (Worker View): Unredacted access to individual employer rails, transaction histories, and raw metrics.
 * - 'lender' (Lender/Underwriter View): Privacy-preserving credit assessment.
 *   - Masks specific employer rail IDs with anonymized tokens (e.g. "Employer Rail #1").
 *   - Computes income stability bands while hiding raw private metadata.
 *   - Strips any PII (phone numbers, full names, bank VPAs) before data leaves the trust boundary.
 */

/**
 * Anonymizes an employer rail ID into a deterministic, non-reversible label.
 *
 * @param {string} railId - e.g. "RAIL_worker_123_EMP_ZEPTO"
 * @param {number} index - Numerical index for clean presentation
 * @returns {string} e.g. "Verified Employer Rail #1 (ZEPTO)" or "Verified Employer Rail #1"
 */
function anonymizeRail(railId, index) {
  if (!railId) return `Employer Rail #${index + 1}`;
  const parts = railId.split('_EMP_');
  const employerTag = parts.length > 1 ? ` (${parts[1]})` : '';
  return `Verified Rail #${index + 1}${employerTag}`;
}

/**
 * Maps a numeric average income to a standardized credit bracket.
 *
 * @param {number|null} amountPaise - Amount in paise
 * @returns {string} Human-readable income bracket
 */
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
  if (redactedRetention.retentionByRail) {
    const sanitizedRails = {};
    Object.keys(redactedRetention.retentionByRail).forEach((railId, idx) => {
      const maskedName = anonymizeRail(railId, idx);
      sanitizedRails[maskedName] = {
        monthsActive: redactedRetention.retentionByRail[railId].monthsActive,
        transactionCount: redactedRetention.retentionByRail[railId].transactionCount,
      };
    });
    redactedRetention.retentionByRail = sanitizedRails;
  }

  return {
    worker_id: passport.worker_id,
    isi_score: passport.isi_score,
    confidence: passport.confidence,
    active_employer_count: passport.active_employer_count,
    six_month_avg_income_inr: passport.six_month_avg_income ? Math.round(passport.six_month_avg_income / 100) : null,
    income_band: getIncomeBand(passport.six_month_avg_income),
    weights_used: passport.weights_used,
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
    privacy: {
      redacted: true,
      view_mode: 'lender_underwriting',
      pii_stripped: ['phone', 'vpa_address', 'bank_account_number', 'raw_transaction_ids'],
    },
    generated_at: passport.generated_at,
  };
}

module.exports = {
  redactPassport,
  getIncomeBand,
  anonymizeRail,
};
