const { peekPending, resolvePending } = require('./pendingConfirmations');
const { recordTransaction } = require('../db/transactionStore');

// Resolves FORWARD only - Section 7: never rewrites past ISI scores,
// only sets this transaction's own label/needs_review going forward.
function handleConfirmationReply(req, res) {
  const phoneNumber = req.body.From;
  const replyBody = (req.body.Body || '').trim();

  if (!phoneNumber) return res.status(400).json({ error: 'Missing From' });

  // Peek first, not resolve - an unrecognized reply must leave the entry
  // in place for a later valid reply. Popping it unconditionally here
  // would silently discard the pending confirmation on any typo.
  const transaction = peekPending(phoneNumber);
  if (!transaction) {
    console.log(`[confirmation] No pending entry for ${phoneNumber} - ignored`);
    return res.status(200).send('');
  }

  let label, needsReview;
  if (replyBody === '1') {
    label = transaction.suspected_label || 'recurring_wage';
    needsReview = false;
  } else if (replyBody === '2') {
    label = 'one_off_transfer';
    needsReview = false; // resolved - but excluded from ISI via INCOME_LABELS filter, not via needs_review
  } else {
    console.log(`[confirmation] Unrecognized reply "${replyBody}" from ${phoneNumber} - left pending`);
    return res.status(200).send('');
  }

  resolvePending(phoneNumber); // only consume the pending slot once we've committed to resolving it
  recordTransaction({ ...transaction, label, needs_review: needsReview, confirmed_via_reply: true });
  console.log(`[confirmation] Resolved ${phoneNumber}: label=${label}, needs_review=${needsReview}`);
  return res.status(200).send('');
}

module.exports = { handleConfirmationReply };
