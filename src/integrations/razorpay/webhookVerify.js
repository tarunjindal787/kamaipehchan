/**
 * KamaiPehchan - Webhook Signature Verification (Day 1)
 *
 * Implements cryptographic HMAC-SHA256 signature verification for incoming
 * Razorpay webhook events using a timing-safe buffer comparison to prevent
 * timing attack vulnerabilities.
 */

const crypto = require('crypto');

/**
 * Verifies that the raw HTTP body matches the X-Razorpay-Signature header.
 *
 * @param {string|Buffer} rawBody - Exact raw HTTP request body string
 * @param {string} signatureHeader - Value of the X-Razorpay-Signature header
 * @param {string} webhookSecret - Configured secret from Razorpay Dashboard
 * @returns {boolean} True if signature is cryptographically valid, false otherwise
 */
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
