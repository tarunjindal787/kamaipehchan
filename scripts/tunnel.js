const ngrok = require('@ngrok/ngrok');
require('dotenv').config();

(async function () {
  try {
    if (!process.env.NGROK_AUTHTOKEN) {
      throw new Error('NGROK_AUTHTOKEN is not set. Add it to your .env file.');
    }

    const listener = await ngrok.forward({
      addr: 3000,
      authtoken: process.env.NGROK_AUTHTOKEN,
    });

    console.log(`NGROK_TUNNEL_URL=${listener.url()}`);
    console.log(`WEBHOOK_URL=${listener.url()}/webhooks/razorpay`);

    // Keep the tunnel process running indefinitely
    process.stdin.resume();
  } catch (err) {
    console.error('Error establishing ngrok tunnel:', err);
  }
})();
