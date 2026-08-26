const crypto = require('crypto');

// timingSafeEqual instead of === so a mismatched signature can't leak
// timing information about how much of it was correct.
function verifyWebhookSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret || !rawBody) return false;

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(signatureHeader, 'utf8')
    );
  } catch (err) {
    return false;
  }
}

module.exports = { verifyWebhookSignature };
