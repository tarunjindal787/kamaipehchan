const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'tests', 'benchmark_payloads', 'synthetic');
fs.mkdirSync(outDir, { recursive: true });

const payloads = [];

// 1. History-based match: 3 consistent monthly transactions on the same
// rail, then a current transaction with a vague note whose amount is
// within 10% of the historical average. Proves the rail-history path
// (Section 6a) works without relying on note text at all.
for (let i = 1; i <= 5; i++) {
  const railId = `va_worker${1000 + i}_employerA`;
  const workerId = `worker_${1000 + i}`;
  const baseAmount = 600000;
  const history = [1, 2, 3].map((month) => ({
    rail_id: railId,
    amount: baseAmount,
    note: '',
    credited_at: `2026-0${month}-01T09:15:00Z`,
    worker_id: workerId,
  }));

  payloads.push({
    id: `history_match_${i}`,
    label: 'recurring_wage',
    expected_path: 'deterministic',
    history,
    transaction: {
      rail_id: railId,
      amount: baseAmount + i * 1000, // small drift, still within 10%
      note: '',
      credited_at: '2026-04-01T09:15:00Z',
      worker_id: workerId,
    },
  });
}

// 2. Note-based match: note literally says "salary" (or a close variant),
// but history is insufficient (<2 prior transactions, and where present,
// a different amount). Proves the note early-exit works independently of
// rail history.
const NOTE_LABELS = ['salary', 'wages', 'wage', 'Salary', 'SALARY'];
for (let i = 1; i <= 5; i++) {
  const railId = `va_worker${1100 + i}_employerA`;
  const workerId = `worker_${1100 + i}`;
  const currentAmount = 600000 + i * 1000;
  const history =
    i % 2 === 0
      ? [
          {
            rail_id: railId,
            amount: currentAmount * 3, // deliberately inconsistent - note must still win
            note: '',
            credited_at: '2026-01-01T09:15:00Z',
            worker_id: workerId,
          },
        ]
      : [];

  payloads.push({
    id: `note_match_${i}`,
    label: 'recurring_wage',
    expected_path: 'deterministic',
    history,
    transaction: {
      rail_id: railId,
      amount: currentAmount,
      note: NOTE_LABELS[i - 1],
      credited_at: '2026-02-01T09:15:00Z',
      worker_id: workerId,
    },
  });
}

// 3. No-history fallthrough: fewer than 2 prior transactions and a vague
// note - must NOT be classified deterministically, regardless of amount.
const VAGUE_NOTES_NO_HISTORY = ['', 'thx', 'payment', 'urgent', 'gift'];
for (let i = 1; i <= 5; i++) {
  const railId = `va_worker${1200 + i}_employerB`;
  const workerId = `worker_${1200 + i}`;
  const history =
    i % 2 === 0
      ? [{ rail_id: railId, amount: 5000, note: '', credited_at: '2026-01-11T14:00:00Z', worker_id: workerId }]
      : [];

  payloads.push({
    id: `no_history_${i}`,
    label: 'needs_review',
    expected_path: 'llm_assisted',
    history,
    transaction: {
      rail_id: railId,
      amount: 5000 + i * 137,
      note: VAGUE_NOTES_NO_HISTORY[i - 1],
      credited_at: '2026-02-11T14:01:00Z',
      worker_id: workerId,
    },
  });
}

// 4. Amount-mismatch fallthrough: sufficient consistent history (>=2), but
// the current amount deviates well beyond the 10% tolerance - must fall
// through to needs_review despite having enough history.
const VAGUE_NOTES_MISMATCH = ['adjust', 'rent share', 'loan repay?', 'salary maybe', 'for work'];
for (let i = 1; i <= 5; i++) {
  const railId = `va_worker${1300 + i}_employerB`;
  const workerId = `worker_${1300 + i}`;
  const baseAmount = 5000 + i * 100;
  const history = [1, 2].map((month) => ({
    rail_id: railId,
    amount: baseAmount,
    note: '',
    credited_at: `2026-0${month}-15T14:00:00Z`,
    worker_id: workerId,
  }));

  payloads.push({
    id: `amount_mismatch_${i}`,
    label: 'needs_review',
    expected_path: 'llm_assisted',
    history,
    transaction: {
      rail_id: railId,
      amount: baseAmount * 3, // well beyond 10% tolerance
      note: VAGUE_NOTES_MISMATCH[i - 1],
      credited_at: '2026-03-15T14:00:00Z',
      worker_id: workerId,
    },
  });
}

fs.writeFileSync(path.join(outDir, 'seed_payloads.json'), JSON.stringify(payloads, null, 2));
console.log(`Seeded ${payloads.length} synthetic payloads to ${outDir}/seed_payloads.json`);
