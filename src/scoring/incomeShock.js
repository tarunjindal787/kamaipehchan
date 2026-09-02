/**
 * Income Shock Detector - flags a sudden drop in a worker's combined
 * monthly income, using the same per-month totals varianceCalc.js
 * already computes (groupByMonth). No new data, no new detection
 * inputs - pure aggregation over confirmed income transactions.
 *
 * "Prior 3 months" means the 3 most recent CALENDAR months that have
 * at least one confirmed transaction, not necessarily 3 contiguous
 * months - same scoping as varianceCalc.js's monthsObserved, which
 * also just aggregates whatever months are present rather than
 * gap-filling zeros for months with no data at all. A month with
 * genuinely zero income across every rail is indistinguishable here
 * from a month with no data collected for it.
 */
const { groupByMonth } = require('./varianceCalc');

const MODERATE_DROP_THRESHOLD = 40;
const SEVERE_DROP_THRESHOLD = 60;
const MIN_MONTHS_REQUIRED = 4;

function monthKeyOf(creditedAtSeconds) {
  const date = new Date(creditedAtSeconds * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Only cite a rail as a specific cause when the data actually shows it:
// the rail paid in at least one of the prior 3 months but has zero
// confirmed transactions in the latest month. Never a guess.
function railsThatStoppedPaying(transactions, latestMonthKey, priorMonthKeys) {
  const monthsPaidByRail = {};
  for (const t of transactions) {
    if (!t.rail_id) continue;
    const key = monthKeyOf(t.credited_at);
    if (!monthsPaidByRail[t.rail_id]) monthsPaidByRail[t.rail_id] = new Set();
    monthsPaidByRail[t.rail_id].add(key);
  }

  const stopped = [];
  for (const railId of Object.keys(monthsPaidByRail)) {
    const monthsPaid = monthsPaidByRail[railId];
    const paidInLatest = monthsPaid.has(latestMonthKey);
    const priorMonthsPaid = priorMonthKeys.filter((k) => monthsPaid.has(k)).sort();
    if (priorMonthsPaid.length > 0 && !paidInLatest) {
      const lastPaidMonth = priorMonthsPaid[priorMonthsPaid.length - 1];
      stopped.push(`Rail ${railId} had confirmed payments through ${lastPaidMonth} but none in ${latestMonthKey}.`);
    }
  }
  return stopped;
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function detectIncomeShock(confirmedIncomeTransactions) {
  const byMonth = groupByMonth(confirmedIncomeTransactions);
  // The in-progress calendar month is never "complete" - comparing its
  // still-accruing partial total against full prior months would read
  // as a false drop every single month, before it's actually over.
  const thisMonth = currentMonthKey();
  const monthKeys = Object.keys(byMonth)
    .filter((key) => key !== thisMonth)
    .sort();

  if (monthKeys.length < MIN_MONTHS_REQUIRED) {
    return {
      shock_detected: false,
      severity: 'none',
      latest_month_income: null,
      three_month_average: null,
      drop_percentage: null,
      risk_factors: [
        `Insufficient history: ${monthKeys.length} month(s) of confirmed income on file, at least ${MIN_MONTHS_REQUIRED} required to evaluate an income shock.`,
      ],
    };
  }

  const latestMonthKey = monthKeys[monthKeys.length - 1];
  const priorMonthKeys = monthKeys.slice(-4, -1);

  const latest_month_income = byMonth[latestMonthKey];
  const three_month_average = Math.round(
    priorMonthKeys.reduce((sum, key) => sum + byMonth[key], 0) / priorMonthKeys.length
  );

  const drop_percentage =
    Math.round(((three_month_average - latest_month_income) / three_month_average) * 1000) / 10;

  const severity =
    drop_percentage > SEVERE_DROP_THRESHOLD ? 'severe' : drop_percentage > MODERATE_DROP_THRESHOLD ? 'moderate' : 'none';
  const shock_detected = severity !== 'none';

  const risk_factors = shock_detected
    ? [
        `Latest confirmed month (${latestMonthKey}) income is ${drop_percentage}% below the prior 3-month average.`,
        ...railsThatStoppedPaying(confirmedIncomeTransactions, latestMonthKey, priorMonthKeys),
      ]
    : [];

  return { shock_detected, severity, latest_month_income, three_month_average, drop_percentage, risk_factors };
}

module.exports = { detectIncomeShock, MODERATE_DROP_THRESHOLD, SEVERE_DROP_THRESHOLD, MIN_MONTHS_REQUIRED };
