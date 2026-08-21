const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'tests', 'benchmark_payloads', 'synthetic');
fs.mkdirSync(outDir, { recursive: true });

const payloads = [];

for (let i = 1; i <= 10; i++) {
  payloads.push({
    id: `clean_${i}`,
    label: 'recurring_wage',
    expected_path: 'deterministic',
    payload: {
      event: 'virtual_account.credited',
      payload: {
        virtual_account_id: `va_worker${1000 + i}_employerA`,
        worker_id: `worker_${1000 + i}`,
        employer_ref: 'employer_A',
        amount: 600000,
        currency: 'INR',
        payer_upi_vpa: `employerA_${i}@okhdfcbank`,
        note: 'salary',
        credited_at: `2026-0${(i % 6) + 1}-01T09:15:00Z`,
      },
    },
  });
}

const ambiguousNotes = ['', 'thx', 'for work', 'loan repay?', 'salary maybe', 'payment', 'urgent', 'gift', 'rent share', 'adjust'];
for (let i = 1; i <= 10; i++) {
  payloads.push({
    id: `ambiguous_${i}`,
    label: 'needs_review',
    expected_path: 'llm_assisted',
    payload: {
      event: 'virtual_account.credited',
      payload: {
        virtual_account_id: `va_worker${2000 + i}_employerB`,
        worker_id: `worker_${2000 + i}`,
        employer_ref: 'employer_B',
        amount: 5000 + i * 137,
        currency: 'INR',
        payer_upi_vpa: `payerB_${i}@okaxis`,
        note: ambiguousNotes[i - 1],
        credited_at: `2026-0${(i % 6) + 1}-${10 + i}T14:0${i % 6}:00Z`,
      },
    },
  });
}

fs.writeFileSync(path.join(outDir, 'seed_payloads.json'), JSON.stringify(payloads, null, 2));
console.log(`Seeded ${payloads.length} synthetic payloads to ${outDir}/seed_payloads.json`);
