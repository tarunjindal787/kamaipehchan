const ngrok = require('@ngrok/ngrok');

(async function () {
  try {
    const listener = await ngrok.forward({
      addr: 3000,
      authtoken: process.env.NGROK_AUTHTOKEN || '3IExyH0IV0r3Qgb6xiLTguyEypM_AMKpKASDqPafBz2g6wbN',
    });

    console.log(`NGROK_TUNNEL_URL=${listener.url()}`);
    console.log(`WEBHOOK_URL=${listener.url()}/webhooks/razorpay`);

    // Keep the tunnel process running indefinitely
    process.stdin.resume();
  } catch (err) {
    console.error('Error establishing ngrok tunnel:', err);
  }
})();
