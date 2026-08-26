/**
 * Manual test: employer linking with current real config (Razorpay unconfigured).
 * Registers a worker, calls the employer-linking endpoint for "Zepto" over
 * a REAL HTTP request through the actual running server (not a direct
 * function call) - this also verifies the route-scoped express.json()
 * middleware doesn't corrupt req.body given the global one already parses it.
 */
const app = require('../src/server');

async function run() {
  const server = app.listen(3096, async () => {
    try {
      const registerRes = await fetch('http://localhost:3096/worker/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+919812340099', name: 'Manual Test Worker' }),
      });
      const registerBody = await registerRes.json();
      console.log('--- POST /worker/register ---');
      console.log('status:', registerRes.status);
      console.log(JSON.stringify(registerBody, null, 2));
      const workerId = registerBody.worker_id;

      const employerRes = await fetch(`http://localhost:3096/worker/${workerId}/employer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employer_name: 'Zepto' }),
      });
      const employerBody = await employerRes.json();
      console.log('\n--- POST /worker/:workerId/employer ("Zepto") ---');
      console.log('status:', employerRes.status);
      console.log(JSON.stringify(employerBody, null, 2));

      console.log('\n--- Confirmation ---');
      console.log('req.body parsed correctly through the double express.json() middleware:', employerBody.employer_name === 'Zepto');
      console.log('Honestly labeled as mock (not disguised as real):', employerBody.mock === true && typeof employerBody.note === 'string' && employerBody.note.includes('MOCK'));
      console.log('payment_link_url is null (no real link was created):', employerBody.payment_link_url === null);
    } catch (err) {
      console.error('MANUAL TEST ERROR:', err);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

run();
