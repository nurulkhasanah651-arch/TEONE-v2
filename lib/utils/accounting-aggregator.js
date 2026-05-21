// Shared helper to compute accounting positions from raw data

export function aggregateAccountBalances(accounts, accEntries) {
  // Returns: { accountId: { account, balance, inSum, outSum, entryCount } }
  const map = {};
  for (const a of accounts) {
    map[a.id] = { account: a, balance: a.starting_balance || 0, inSum: 0, outSum: 0, entryCount: 0 };
  }
  for (const e of (accEntries || [])) {
    if (!e.account_id || !map[e.account_id]) continue;
    if (e.type === 'in') {
      map[e.account_id].balance += e.amount || 0;
      map[e.account_id].inSum += e.amount || 0;
    } else if (e.type === 'out') {
      map[e.account_id].balance -= e.amount || 0;
      map[e.account_id].outSum += e.amount || 0;
    }
    map[e.account_id].entryCount++;
  }
  return map;
}

// Compute piutang (receivables) — money peserta owes
// = sum of (price_paid - actual_paid) for all passengers with positive balance
export function computePiutang(passengers, payments) {
  const paidByPassenger = {};
  for (const p of (payments || [])) {
    paidByPassenger[p.passenger_id] = (paidByPassenger[p.passenger_id] || 0) + (p.amount || 0);
  }
  let total = 0;
  for (const pax of (passengers || [])) {
    const expected = pax.price_paid || 0;
    const paid = paidByPassenger[pax.id] || 0;
    const balance = expected - paid;
    if (balance > 0) total += balance;
  }
  return total;
}

// Compute hutang (payables) — money owed to vendors
// = sum of HPP items where payment_status != 'lunas' and != 'tidak perlu'
export function computeHutang(finItems) {
  let total = 0;
  for (const it of (finItems || [])) {
    if (it.item_type !== 'hpp') continue;
    if (it.payment_status === 'lunas' || it.payment_status === 'tidak perlu') continue;
    total += it.total_amount || 0;
  }
  return total;
}

// Compute PNR deposits paid (asset — money parked at vendor)
export function computePnrDeposits(pnrs) {
  let total = 0;
  for (const p of (pnrs || [])) {
    total += (p.deposit_total || 0) + (p.payoff_amount || 0);
  }
  return total;
}
