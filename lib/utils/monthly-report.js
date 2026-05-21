// Monthly financial report aggregator
// Returns structured P&L, Cash Flow, and per-account activity for a given month (YYYY-MM)

// Categorization rules
const OPEX_CATEGORIES = new Set([
  'Gaji', 'Sewa', 'Marketing', 'Listrik/Air', 'Internet',
  'Transport', 'Operasional Kantor', 'Lainnya',
]);
const FINANCING_CATEGORIES = new Set(['Investment', 'Loan']);
const OTHER_INCOME_CATEGORIES = new Set(['Komisi', 'Bunga Bank', 'Refund']);

function inMonth(dateStr, month) {
  if (!dateStr) return false;
  return dateStr.slice(0, 7) === month;
}

export function buildMonthlyReport({ month, payments, hppLunas, accEntries, accounts }) {
  // === REVENUE ===
  const tripRevenue = (payments || [])
    .filter((p) => inMonth(p.paid_at, month))
    .reduce((s, p) => s + (p.amount || 0), 0);

  const otherIncomeManual = (accEntries || []).filter(
    (e) => e.type === 'in' && inMonth(e.date, month) && OTHER_INCOME_CATEGORIES.has(e.category)
  );
  const otherIncomeAmount = otherIncomeManual.reduce((s, e) => s + (e.amount || 0), 0);

  const financingInflow = (accEntries || []).filter(
    (e) => e.type === 'in' && inMonth(e.date, month) && FINANCING_CATEGORIES.has(e.category)
  );
  const financingInAmount = financingInflow.reduce((s, e) => s + (e.amount || 0), 0);

  // Other income not categorized (treat as misc)
  const uncatIn = (accEntries || []).filter(
    (e) => e.type === 'in' && inMonth(e.date, month) && !OTHER_INCOME_CATEGORIES.has(e.category) && !FINANCING_CATEGORIES.has(e.category)
  );
  const uncatInAmount = uncatIn.reduce((s, e) => s + (e.amount || 0), 0);

  // === COGS (HPP lunas in this month) ===
  // HPP items where payoff_date is in month
  const hppInMonth = (hppLunas || []).filter((it) => inMonth(it.payoff_date || it.dp_date, month));
  const cogs = hppInMonth.reduce((s, it) => s + (it.total_amount || 0), 0);

  // Break down HPP by category
  const cogsByCategory = {};
  for (const it of hppInMonth) {
    const cat = it.category || 'Lainnya';
    cogsByCategory[cat] = (cogsByCategory[cat] || 0) + (it.total_amount || 0);
  }

  // === OPEX (Operating Expenses — manual entries) ===
  const opexEntries = (accEntries || []).filter(
    (e) => e.type === 'out' && inMonth(e.date, month) && (OPEX_CATEGORIES.has(e.category) || !e.category)
  );
  const opex = opexEntries.reduce((s, e) => s + (e.amount || 0), 0);

  const opexByCategory = {};
  for (const e of opexEntries) {
    const cat = e.category || 'Lainnya';
    opexByCategory[cat] = (opexByCategory[cat] || 0) + (e.amount || 0);
  }

  // === Other outflows (non-operating) ===
  const uncatOut = (accEntries || []).filter(
    (e) => e.type === 'out' && inMonth(e.date, month) && !OPEX_CATEGORIES.has(e.category) && e.category
  );
  const uncatOutAmount = uncatOut.reduce((s, e) => s + (e.amount || 0), 0);

  // === Income Statement totals ===
  const totalRevenue = tripRevenue + otherIncomeAmount + uncatInAmount;
  const grossProfit = totalRevenue - cogs;
  const operatingProfit = grossProfit - opex;
  const netProfit = operatingProfit - uncatOutAmount + financingInAmount;

  // === CASH FLOW (per account in this month) ===
  const accountFlow = {};
  for (const a of (accounts || [])) {
    accountFlow[a.id] = { account: a, in: 0, out: 0, net: 0, count: 0 };
  }
  for (const e of (accEntries || [])) {
    if (!inMonth(e.date, month)) continue;
    if (!e.account_id || !accountFlow[e.account_id]) continue;
    if (e.type === 'in') {
      accountFlow[e.account_id].in += e.amount || 0;
      accountFlow[e.account_id].net += e.amount || 0;
    } else {
      accountFlow[e.account_id].out += e.amount || 0;
      accountFlow[e.account_id].net -= e.amount || 0;
    }
    accountFlow[e.account_id].count++;
  }

  const totalCashIn = tripRevenue + otherIncomeAmount + financingInAmount + uncatInAmount;
  const totalCashOut = cogs + opex + uncatOutAmount;
  const netCashFlow = totalCashIn - totalCashOut;

  return {
    month,
    // Income Statement
    tripRevenue,
    otherIncome: otherIncomeAmount + uncatInAmount,
    otherIncomeBreakdown: [...otherIncomeManual, ...uncatIn],
    totalRevenue,
    cogs,
    cogsByCategory,
    grossProfit,
    grossMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    opex,
    opexByCategory,
    operatingProfit,
    operatingMargin: totalRevenue > 0 ? (operatingProfit / totalRevenue) * 100 : 0,
    financingIn: financingInAmount,
    otherOut: uncatOutAmount,
    netProfit,
    netMargin: totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0,

    // Cash Flow
    totalCashIn,
    totalCashOut,
    netCashFlow,
    accountFlow,

    // Activity count
    paymentCount: (payments || []).filter((p) => inMonth(p.paid_at, month)).length,
    hppCount: hppInMonth.length,
    manualEntryCount: (accEntries || []).filter((e) => inMonth(e.date, month)).length,
  };
}
