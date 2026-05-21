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

// Total uang cicilan peserta yang sudah masuk
export function computeCicilanPeserta(payments) {
  return (payments || []).reduce((s, p) => s + (p.amount || 0), 0);
}

// Total HPP yang sudah dibayar ke vendor (cash out)
// = trip_finance_items HPP lunas + PNR deposits + PNR payoff
export function computeVendorPaid(finItems, pnrs) {
  const hppLunas = (finItems || [])
    .filter((it) => it.item_type === 'hpp' && it.payment_status === 'lunas')
    .reduce((s, it) => s + (it.total_amount || 0), 0);
  const pnrPaid = computePnrDeposits(pnrs);
  return hppLunas + pnrPaid;
}

// Total HPP yang masih hutang ke vendor (cash out di masa depan)
export function computeVendorOwed(finItems) {
  return (finItems || [])
    .filter((it) => it.item_type === 'hpp')
    .filter((it) => it.payment_status !== 'lunas' && it.payment_status !== 'tidak perlu')
    .reduce((s, it) => s + (it.total_amount || 0), 0);
}

// PER-TRIP: classify cicilan peserta into:
//   - titipan_locked: terikat untuk vendor (HPP proyeksi belum lunas)
//   - margin_locked: sudah pasti milik perusahaan (cicilan > HPP proyeksi)
//   - cicilan_mengendap: HPP belum di-set, jadi belum bisa diklasifikasi
export function computeTripCashBreakdown({ trips, passengers, payments, finItems, pnrs }) {
  // Index data
  const passengersInTrip = {};
  for (const p of (passengers || [])) {
    if (!passengersInTrip[p.trip_id]) passengersInTrip[p.trip_id] = [];
    passengersInTrip[p.trip_id].push(p);
  }
  const paidByPassenger = {};
  for (const p of (payments || [])) {
    paidByPassenger[p.passenger_id] = (paidByPassenger[p.passenger_id] || 0) + (p.amount || 0);
  }

  const result = [];
  const totals = {
    cicilanIn: 0,
    hppPaid: 0,
    hppOwed: 0,
    titipan_locked: 0,       // earmark untuk vendor (HPP proyeksi belum lunas)
    margin_locked: 0,        // sudah pasti milik perusahaan
    cicilan_mengendap: 0,    // HPP belum di-set
  };

  for (const trip of (trips || [])) {
    const tripPax = passengersInTrip[trip.id] || [];
    const cicilanIn = tripPax.reduce((s, p) => s + (paidByPassenger[p.id] || 0), 0);

    const tripHpp = (finItems || []).filter((i) => i.trip_id === trip.id && i.item_type === 'hpp');
    const hppTotal = tripHpp.reduce((s, i) => s + (i.total_amount || 0), 0);
    const hppPaid = tripHpp.filter((i) => i.payment_status === 'lunas').reduce((s, i) => s + (i.total_amount || 0), 0);
    const hppOwed = Math.max(0, hppTotal - hppPaid);

    // PNR paid for this trip (uang yang sudah keluar ke maskapai)
    const tripPnrs = (pnrs || []).filter((p) => p.trip_id === trip.id);
    const pnrPaid = tripPnrs.reduce((s, p) => s + (p.deposit_total || 0) + (p.payoff_amount || 0), 0);

    const totalCashOut = hppPaid + pnrPaid;
    const netCash = cicilanIn - totalCashOut; // posisi cash dari trip ini saat ini
    const hasProjection = hppTotal > 0;

    let titipan_locked = 0, margin_locked = 0, cicilan_mengendap = 0;

    if (netCash > 0) {
      if (hasProjection) {
        titipan_locked = Math.min(netCash, hppOwed);
        margin_locked = Math.max(0, netCash - hppOwed);
      } else {
        // HPP proyeksi belum di-set — cicilan mengendap (belum bisa dialokasi)
        cicilan_mengendap = netCash;
      }
    } else if (netCash < 0) {
      // HPP keluar > cicilan (defisit dari trip — pakai uang lain)
      margin_locked = netCash; // negative
    }

    result.push({
      trip,
      cicilanIn,
      hppTotal,
      hppPaid: totalCashOut,
      hppOwed,
      netCash,
      titipan_locked,
      margin_locked,
      cicilan_mengendap,
      hasProjection,
    });

    totals.cicilanIn += cicilanIn;
    totals.hppPaid += totalCashOut;
    totals.hppOwed += hppOwed;
    totals.titipan_locked += titipan_locked;
    totals.margin_locked += margin_locked;
    totals.cicilan_mengendap += cicilan_mengendap;
  }

  return { perTrip: result, totals };
}
