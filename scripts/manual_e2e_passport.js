/**
 * Manual End-to-End Test for Credit Passport API (GET /passport/:workerId)
 *
 * Seeds 6 months of synthetic transactions for a worker across 2 employer rails,
 * sends an HTTP GET request to /passport/:workerId, and outputs the full JSON response.
 */

const http = require('http');
const app = require('../src/server');
const { recordTransaction } = require('../src/db/transactionStore');

const WORKER_ID = 'worker_kailash_401';
const TEST_PORT = 4129;

// Seed 6 months of weekly/bi-weekly transactions across 2 employer rails
const now = Math.floor(Date.now() / 1000);
const monthSec = 30 * 86400;

console.log(`Seeding 6 months of transactions for ${WORKER_ID}...`);

for (let m = 6; m >= 1; m--) {
  const monthBase = now - m * monthSec;

  // Zepto rail payouts
  recordTransaction({
    rail_id: 'rail_zepto_quick',
    worker_id: WORKER_ID,
    amount: 1450000, // paise (₹14,500)
    note: 'Zepto weekly payout',
    credited_at: monthBase + 5 * 86400,
    needs_review: false,
    label: 'recurring_wage',
  });
  recordTransaction({
    rail_id: 'rail_zepto_quick',
    worker_id: WORKER_ID,
    amount: 1520000, // paise (₹15,200)
    note: 'Zepto weekly payout',
    credited_at: monthBase + 19 * 86400,
    needs_review: false,
    label: 'recurring_wage',
  });

  // Swiggy rail payouts
  recordTransaction({
    rail_id: 'rail_swiggy_instamart',
    worker_id: WORKER_ID,
    amount: 1100000, // paise (₹11,000)
    note: 'Swiggy Instamart payout',
    credited_at: monthBase + 12 * 86400,
    needs_review: false,
    label: 'gig_payout',
  });
  recordTransaction({
    rail_id: 'rail_swiggy_instamart',
    worker_id: WORKER_ID,
    amount: 1150000, // paise (₹11,500)
    note: 'Swiggy Instamart payout',
    credited_at: monthBase + 26 * 86400,
    needs_review: false,
    label: 'gig_payout',
  });
}

const server = app.listen(TEST_PORT, () => {
  http.get(`http://localhost:${TEST_PORT}/passport/${WORKER_ID}`, (res) => {
    let raw = '';
    res.on('data', (chunk) => { raw += chunk; });
    res.on('end', () => {
      console.log(`\nHTTP GET /passport/${WORKER_ID} -> Status: ${res.statusCode}`);
      console.log('JSON RESPONSE:\n');
      console.log(JSON.stringify(JSON.parse(raw), null, 2));

      // Also test non-existent worker
      http.get(`http://localhost:${TEST_PORT}/passport/worker_unseen_999`, (res2) => {
        let raw2 = '';
        res2.on('data', (chunk) => { raw2 += chunk; });
        res2.on('end', () => {
          console.log(`\nHTTP GET /passport/worker_unseen_999 -> Status: ${res2.statusCode}`);
          console.log('JSON RESPONSE (No data):\n');
          console.log(JSON.stringify(JSON.parse(raw2), null, 2));

          server.close();
          process.exit(0);
        });
      });
    });
  }).on('error', (err) => {
    console.error('Request failed:', err);
    server.close();
    process.exit(1);
  });
});
