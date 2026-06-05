// R157 HOTFIX + R214: Accounting per group — fix DEPOSIT PNR calc
// R214: pakai deposit_total only (bukan + payoff_amount yg = sisa)
//       + PNR gak double-counted ke totalRealOut (sudah lewat HPP)
// Path: app/(app)/accounting/groups/[tripId]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';
import { statusCfg } from '@/lib/utils/trip-status';
import DownloadButtons from '@/components/common/DownloadButtons';
import HPPDocumentBar from '@/components/finance/HPPDocumentBar';

export const dynamic = 'force-dynamic';

export default async function GroupCashflowDetailPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  const [passRes, finItemsRes, pnrRes, custRes, accEntRes, refundsRes] = await Promise.all([
    supabase.from('trip_passengers').select('*').eq('trip_id', tripId),
    supabase.from('trip_finance_items').select('*').eq('trip_id', tripId).order('item_type').order('category'),
    supabase.from('flight_inventory').select('*').eq('trip_id', tripId),
    supabase.from('customers').select('id, name'),
    supabase.from('accounting_entries').select('*').eq('trip_id', tripId).order('date', { ascending: false }),
    supabase.from('refunds').select('*').eq('trip_id', tripId).eq('status', 'approved'),
  ]);

  const allPassengers = passRes.data || [];
  const customers = custRes.data || [];
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  const activePassengers = allPassengers.filter((p) => {
    const isTransferred = p.transfer_status === 'transferred';
    const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isTransferred && !isRefunded;
  });
  const inactivePassengers = allPassengers.filter((p) => {
    return p.transfer_status === 'transferred' ||
           p.refund_status === 'refunded' ||
           p.refund_status === 'partial_refund';
  });

  const activePassengerIds = activePassengers.map((p) => p.id);
  const allPaxIds = allPassengers.map((p) => p.id);
  let payments = [];
  if (allPaxIds.length > 0) {
    try {
      const { data } = await supabase.from('participant_payments')
        .select('*')
        .in('passenger_id', allPaxIds);
      payments = (data || []).filter((p) => p.is_transferred !== true);
    } catch (e) {
      payments = [];
    }
  }

  const paymentsActive = payments.filter((p) => activePassengerIds.includes(p.passenger_id));
  const paymentsInactive = payments.filter((p) => !activePassengerIds.includes(p.passenger_id));

  const finItems = finItemsRes.data || [];
  const pnrs = pnrRes.data || [];
  const accEntriesRaw = accEntRes.data || [];
  const refunds = refundsRes.data || [];

  const accEntries = accEntriesRaw.filter((e) =>
    !e.linked_finance_item_id &&
    !e.linked_payment_id &&
    e.source !== 'tl_payment'
  );
  const linkedAccEntries = accEntriesRaw.filter((e) =>
    e.linked_finance_item_id || e.linked_payment_id || e.source === 'tl_payment'
  );

  // === CASH IN ===
  const totalPaymentsIn = paymentsActive.reduce((s, p) => s + (p.amount || 0), 0);
  const totalPaymentsInactive = paymentsInactive.reduce((s, p) => s + (p.amount || 0), 0);
  const totalRefundAdminFee = refunds.reduce((s, r) => s + Number(r.admin_fee || 0), 0);
  const totalRefundAmount = refunds.reduce((s, r) => s + Number(r.refund_amount || 0), 0);
  const manualIn = accEntries.filter((e) => e.type === 'in').reduce((s, e) => s + (e.amount || 0), 0);
  const totalRealIn = totalPaymentsIn + totalPaymentsInactive + manualIn;

  // === CASH OUT ===
  const hppLunas = finItems.filter((i) =>
    i.item_type === 'hpp' &&
    (i.payment_status === 'lunas' || Number(i.dp_paid || 0) > 0)
  );
  const hppPaidAmount = (i) => {
    const paid = Number(i.dp_paid) || 0;
    return paid > 0 ? paid : Number(i.total_amount || 0);
  };
  const totalHppLunas = hppLunas.reduce((s, i) => s + hppPaidAmount(i), 0);
  const hppRefundLunas = hppLunas.filter((i) => (i.category || '').toLowerCase().includes('refund'));
  const totalHppRefundLunas = hppRefundLunas.reduce((s, i) => s + hppPaidAmount(i), 0);
  const totalHppOther = totalHppLunas - totalHppRefundLunas;

  // R214 FIX: deposit_total only (yang SUDAH dibayar) — bukan + payoff_amount (yang adalah SISA)
  const totalPnrDeposit = pnrs.reduce((s, p) => s + (p.deposit_total || 0), 0);

  const manualOut = accEntries.filter((e) => e.type === 'out').reduce((s, e) => s + (e.amount || 0), 0);

  // R214 FIX: totalRealOut TIDAK include totalPnrDeposit
  // (karena PNR sudah otomatis ke-sync ke HPP via syncPnrToHPP di pnr.js,
  //  jadi dp_paid di trip_finance_items sudah include PNR deposit. Adding lagi = double count)
  const totalRealOut = totalHppLunas + manualOut;
  const realProfit = totalRealIn - totalRealOut;

  // === PROYEKSI ===
  const proyIncome = finItems.filter((i) => i.item_type === 'income').reduce((s, i) => s + (i.total_amount || 0), 0);
  const proyHpp = finItems.filter((i) => i.item_type === 'hpp').reduce((s, i) => s + (i.total_amount || 0), 0);
  const proyProfit = proyIncome - proyHpp;
  const hppOwed = proyHpp - totalHppLunas;
  const netCash = totalRealIn - totalRealOut;

  let titipan = 0, marginLocked = 0, cicilanMengendap = 0;
  const hasProjection = proyHpp > 0;
  if (netCash > 0) {
    if (hasProjection) {
      titipan = Math.min(netCash, hppOwed);
      marginLocked = Math.max(0, netCash - hppOwed);
    } else {
      cicilanMengendap = netCash;
    }
  } else if (netCash < 0) {
    marginLocked = netCash;
  }

  const paymentsByPassenger = {};
  for (const p of payments) {
    if (!paymentsByPassenger[p.passenger_id]) paymentsByPassenger[p.passenger_id] = [];
    paymentsByPassenger[p.passenger_id].push(p);
  }

  const cashInRows = [
    ...activePassengers.map((p) => {
      const c = custMap[p.customer_id] || {};
      const pays = paymentsByPassenger[p.id] || [];
      const total = pays.reduce((s, x) => s + (x.amount || 0), 0);
      return { type: 'Payment Aktif', name: c.name || `#${p.id}`, note: '', amount: total };
    }).filter((r) => r.amount > 0),
    ...inactivePassengers.map((p) => {
      const c = custMap[p.customer_id] || {};
      const pays = paymentsByPassenger[p.id] || [];
      const total = pays.reduce((s, x) => s + (x.amount || 0), 0);
      const label = p.transfer_status === 'transferred' ? 'Pindah'
        : p.refund_status === 'refunded' ? 'Refund'
        : p.refund_status === 'partial_refund' ? 'Partial Refund' : '';
      return { type: 'Payment Transferred/Refunded', name: c.name || `#${p.id}`, note: label, amount: total };
    }).filter((r) => r.amount > 0),
    ...accEntries.filter((e) => e.type === 'in').map((e) => ({
      type: 'Manual Cash In', name: e.description || '-', note: e.category || '', amount: e.amount || 0,
    })),
  ];

  const hppLabel = (i) => {
    const status = String(i.payment_status || '').toLowerCase();
    if (status === 'lunas') return 'HPP Lunas';
    if (status.includes('dp')) return 'HPP DP';
    return 'HPP Partial';
  };
  const cashOutRows = [
    ...hppRefundLunas.map((i) => ({
      type: 'Refund Peserta', name: i.component, note: i.vendor_name || '', amount: hppPaidAmount(i),
    })),
    ...hppLunas.filter((i) => !(i.category || '').toLowerCase().includes('refund')).map((i) => ({
      type: hppLabel(i), name: i.component, note: i.vendor_name || '', amount: hppPaidAmount(i),
    })),
    // R214: PNR Deposit info (sudah ke-count di HPP, di-list cuma utk visibility per-vendor)
    ...pnrs.map((p) => ({
      type: 'PNR Deposit (info)', name: p.pnr || `PNR ${p.id}`, note: p.vendor || '',
      amount: (p.deposit_total || 0),
    })),
    ...accEntries.filter((e) => e.type === 'out').map((e) => ({
      type: 'Manual Cash Out', name: e.description || '-', note: e.category || '', amount: e.amount || 0,
    })),
  ];

  const proyVsRealRows = [
    { metric: 'Income', proyeksi: proyIncome, real: totalRealIn, selisih: totalRealIn - proyIncome },
    { metric: 'HPP / Cost', proyeksi: proyHpp, real: totalRealOut, selisih: totalRealOut - proyHpp },
    { metric: 'Profit', proyeksi: proyProfit, real: realProfit, selisih: realProfit - proyProfit },
  ];

  const refundDetailRows = refunds.map((r) => ({
    passenger: r.passenger_name || '-',
    reason: r.reason,
    total_paid: r.total_paid,
    refund_amount: r.refund_amount,
    admin_fee: r.admin_fee,
  }));

  const s = statusCfg(trip.status);
  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/accounting/groups" className="text-sm text-brand-600 font-medium hover:underline">← Real Cashflow per Group</Link>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{trip.kode_trip || `#${trip.id}`}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>{s.label}</span>
          </div>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.name}</h1>
          <p className="mt-1 text-slate-600">
            Real cashflow detail · {activePassengers.length} peserta aktif
            {inactivePassengers.length > 0 && <span className="text-amber-600"> · {inactivePassengers.length} transferred/refunded</span>}
            · Berangkat {fmtDate(trip.departure)}
          </p>
        </div>
        <DownloadButtons
          filename={`accounting-${trip.kode_trip || trip.id}`}
          title={`Real Cashflow — ${trip.kode_trip || ''} ${trip.name}`}
          subtitle={`Departure: ${fmtDate(trip.departure)} · ${activePassengers.length} pax aktif`}
          extraInfo={[
            { label: 'Total Cash In', value: fmtMoney(totalRealIn) },
            { label: 'Total Cash Out', value: fmtMoney(totalRealOut) },
            { label: 'Net Real Profit', value: fmtMoney(realProfit) },
            { label: 'Proyeksi Profit', value: fmtMoney(proyProfit) },
          ]}
          columns={[
            { key: 'metric', label: 'Metrik' },
            { key: 'proyeksi', label: 'Proyeksi', align: 'right', format: 'rupiah' },
            { key: 'real', label: 'Real', align: 'right', format: 'rupiah' },
            { key: 'selisih', label: 'Selisih', align: 'right', format: 'rupiah' },
          ]}
          rows={proyVsRealRows}
          buttonSize="md"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Real Cash In" value={fmtRupiah(totalRealIn)} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Real Cash Out" value={fmtRupiah(totalRealOut)} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Net Real Profit" value={fmtRupiah(realProfit)} color={realProfit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={realProfit >= 0 ? 'bg-blue-50' : 'bg-red-50'} />
        <StatCard label="Proyeksi Profit" value={fmtRupiah(proyProfit)} color="text-purple-700" bg="bg-purple-50" />
      </div>

      {refunds.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-red-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-red-50 border-red-200 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-red-800 flex items-center gap-2">
              <span>💸</span> Refund Tracking
            </h2>
            <div className="flex items-center gap-2">
              <p className="text-xs text-slate-600">{refunds.length} refund approved</p>
              <DownloadButtons
                filename={`refunds-${trip.kode_trip || trip.id}`}
                title={`Refund Detail — ${trip.name}`}
                columns={[
                  { key: 'passenger', label: 'Peserta' },
                  { key: 'reason', label: 'Alasan' },
                  { key: 'total_paid', label: 'Total Bayar', align: 'right', format: 'rupiah' },
                  { key: 'refund_amount', label: 'Refund', align: 'right', format: 'rupiah' },
                  { key: 'admin_fee', label: 'Admin Fee (Hangus)', align: 'right', format: 'rupiah' },
                ]}
                rows={refundDetailRows}
                summary={[
                  { label: 'TOTAL REFUND OUT', value: fmtMoney(totalRefundAmount) },
                  { label: 'TOTAL ADMIN FEE (HANGUS)', value: fmtMoney(totalRefundAdminFee) },
                ]}
              />
            </div>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-red-50 rounded-lg p-3 border border-red-200">
                <p className="text-[10px] font-bold text-red-700 uppercase tracking-wider">💸 Total Refund Out</p>
                <p className="mt-1 text-lg font-bold text-red-700">{fmtRupiah(totalRefundAmount)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Dana yang dikembalikan ke peserta</p>
              </div>
              <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">🔥 Admin Fee (Dana Hangus)</p>
                <p className="mt-1 text-lg font-bold text-emerald-700">{fmtRupiah(totalRefundAdminFee)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Hangus = jadi cash in retained (keuntungan perusahaan)</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                <p className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">📊 Total Refund Activity</p>
                <p className="mt-1 text-lg font-bold text-slate-700">{fmtRupiah(totalRefundAmount + totalRefundAdminFee)}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Total dibayar sebelum refund</p>
              </div>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-slate-700">Detail refund per peserta ▼</summary>
              <table className="w-full mt-2 text-xs">
                <thead className="bg-slate-50">
                  <tr className="text-slate-600">
                    <th className="px-2 py-1 text-left">Peserta</th>
                    <th className="px-2 py-1 text-left">Alasan</th>
                    <th className="px-2 py-1 text-right">Bayar</th>
                    <th className="px-2 py-1 text-right">Refund</th>
                    <th className="px-2 py-1 text-right">Admin Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="px-2 py-1">{r.passenger_name || '—'}</td>
                      <td className="px-2 py-1 text-slate-600">{r.reason}</td>
                      <td className="px-2 py-1 text-right">{fmtRupiah(r.total_paid)}</td>
                      <td className="px-2 py-1 text-right text-red-700">{fmtRupiah(r.refund_amount)}</td>
                      <td className="px-2 py-1 text-right text-emerald-700">{fmtRupiah(r.admin_fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">📊 Klasifikasi Uang Saat Ini</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ClassCard label="🔒 Titipan (untuk vendor)" value={titipan} color="text-amber-700" bg="bg-amber-50" desc="HPP belum lunas yang akan dibayar dari cicilan" />
          <ClassCard label="⏳ Cicilan Mengendap" value={cicilanMengendap} color="text-yellow-700" bg="bg-yellow-50" desc={hasProjection ? 'HPP proyeksi sudah di-set' : 'HPP proyeksi BELUM di-set di Finance'} highlight={!hasProjection && cicilanMengendap > 0} />
          <ClassCard label="💼 Margin Locked" value={marginLocked} color="text-green-700" bg="bg-green-50" desc="Sudah pasti milik perusahaan" />
        </div>
        {!hasProjection && totalRealIn > 0 && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            <p className="font-bold">⚠ HPP proyeksi untuk trip ini belum di-set</p>
            <p className="text-xs mt-1">Cicilan peserta yang sudah masuk = "mengendap" karena belum tahu alokasi untuk vendor. <Link href={`/finance/cashflow/${trip.id}`} className="text-brand-600 hover:underline font-semibold">Set HPP proyeksi di Finance →</Link></p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-green-50 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-green-800 flex items-center gap-2">⬆ Real Cash In <span className="text-sm">{fmtRupiah(totalRealIn)}</span></h2>
            <DownloadButtons
              filename={`cashin-${trip.kode_trip || trip.id}`}
              title={`Cash In — ${trip.name}`}
              subtitle={`Total: ${fmtMoney(totalRealIn)}`}
              columns={[
                { key: 'type', label: 'Tipe' },
                { key: 'name', label: 'Dari / Keterangan' },
                { key: 'note', label: 'Note' },
                { key: 'amount', label: 'Nominal', align: 'right', format: 'rupiah' },
              ]}
              rows={cashInRows}
              summary={[{ label: 'TOTAL CASH IN', value: fmtMoney(totalRealIn) }]}
            />
          </div>
          <div className="p-5 space-y-3">
            <SubSection title={`Payment Peserta Aktif (${activePassengers.length})`} total={totalPaymentsIn} color="text-green-700">
              {activePassengers.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Belum ada peserta aktif</p>
              ) : (
                activePassengers.map((p) => {
                  const c = custMap[p.customer_id] || {};
                  const pays = paymentsByPassenger[p.id] || [];
                  const total = pays.reduce((s, x) => s + (x.amount || 0), 0);
                  return (
                    <div key={p.id} className="flex justify-between text-sm py-1">
                      <span className="text-slate-700">{c.name || `#${p.id}`}</span>
                      <span className={`font-semibold ${total > 0 ? 'text-green-700' : 'text-slate-400'}`}>{fmtRupiah(total)}</span>
                    </div>
                  );
                })
              )}
            </SubSection>

            {inactivePassengers.length > 0 && (
              <SubSection title={`Payment Peserta Transferred/Refunded (${inactivePassengers.length})`} total={totalPaymentsInactive} color="text-amber-700">
                {inactivePassengers.map((p) => {
                  const c = custMap[p.customer_id] || {};
                  const pays = paymentsByPassenger[p.id] || [];
                  const total = pays.reduce((s, x) => s + (x.amount || 0), 0);
                  const label = p.transfer_status === 'transferred' ? '📤 Pindah' :
                                p.refund_status === 'refunded' ? '💸 Refund' :
                                p.refund_status === 'partial_refund' ? '💸 Partial Refund' : '';
                  return (
                    <div key={p.id} className="flex justify-between text-sm py-1">
                      <span className="text-slate-500">{c.name || `#${p.id}`} <span className="text-[10px] text-amber-600">{label}</span></span>
                      <span className={`font-semibold ${total > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{fmtRupiah(total)}</span>
                    </div>
                  );
                })}
              </SubSection>
            )}

            {manualIn > 0 && (
              <SubSection title="Manual Cash In" total={manualIn} color="text-green-700">
                {accEntries.filter((e) => e.type === 'in').map((e) => (
                  <div key={e.id} className="flex justify-between text-sm py-1">
                    <span className="text-slate-700">{e.description}{e.category && <span className="text-xs text-slate-400 ml-1">({e.category})</span>}</span>
                    <span className="font-semibold text-green-700">{fmtRupiah(e.amount)}</span>
                  </div>
                ))}
              </SubSection>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-amber-50 flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-bold text-amber-800 flex items-center gap-2">⬇ Real Cash Out <span className="text-sm">{fmtRupiah(totalRealOut)}</span></h2>
            <DownloadButtons
              filename={`cashout-${trip.kode_trip || trip.id}`}
              title={`Cash Out — ${trip.name}`}
              subtitle={`Total: ${fmtMoney(totalRealOut)}`}
              columns={[
                { key: 'type', label: 'Tipe' },
                { key: 'name', label: 'Komponen' },
                { key: 'note', label: 'Vendor / Note' },
                { key: 'amount', label: 'Nominal', align: 'right', format: 'rupiah' },
              ]}
              rows={cashOutRows}
              summary={[{ label: 'TOTAL CASH OUT', value: fmtMoney(totalRealOut) }]}
            />
          </div>
          <div className="p-5 space-y-3">
            {totalHppRefundLunas > 0 && (
              <SubSection title={`Refund Peserta (${hppRefundLunas.length})`} total={totalHppRefundLunas} color="text-red-700">
                {hppRefundLunas.map((i) => (
                  <div key={i.id} className="flex justify-between text-sm py-1">
                    <span className="text-slate-700">{i.component}</span>
                    <span className="font-semibold text-red-700">{fmtRupiah(hppPaidAmount(i))}</span>
                  </div>
                ))}
              </SubSection>
            )}

            <SubSection title={`HPP Cash Out Vendor (${hppLunas.length - hppRefundLunas.length})`} total={totalHppOther} color="text-amber-700">
              {hppLunas.filter((i) => !(i.category || '').toLowerCase().includes('refund')).length === 0 ? (
                <p className="text-xs text-slate-400 italic">Belum ada HPP yg dibayar</p>
              ) : (
                hppLunas.filter((i) => !(i.category || '').toLowerCase().includes('refund')).map((i) => {
                  const status = String(i.payment_status || '').toLowerCase();
                  const isLunas = status === 'lunas';
                  const total = Number(i.total_amount) || 0;
                  const paid = Number(i.dp_paid) || 0;
                  return (
                    <div key={i.id} className="py-2 border-b border-slate-100 last:border-0">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-700">
                          {i.component}
                          {i.vendor_name && <span className="text-xs text-slate-400 ml-1">· {i.vendor_name}</span>}
                          <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${isLunas ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {isLunas ? '✅ LUNAS' : '🟡 DP'}
                          </span>
                          {!isLunas && paid > 0 && (
                            <span className="text-[10px] text-slate-500 ml-1">({fmtRupiah(paid)} dari {fmtRupiah(total)})</span>
                          )}
                        </span>
                        <span className="font-semibold text-amber-700">{fmtRupiah(hppPaidAmount(i))}</span>
                      </div>
                      <div className="mt-1.5">
                        <HPPDocumentBar
                          item={i}
                          canUploadInvoice={false}
                          canUploadProof={true}
                          compact={true}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </SubSection>

            {/* R214: PNR section pakai deposit_total only + label info supaya gak confusion */}
            <SubSection title="Deposit PNR (info — sudah counted di HPP)" total={totalPnrDeposit} color="text-amber-700">
              {pnrs.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Belum ada PNR linked</p>
              ) : (
                <>
                  <p className="text-[10px] text-slate-500 italic mb-1">
                    ℹ Section ini info per-vendor. Total sudah include di "HPP Cash Out Vendor" di atas (gak di-double-count ke Real Cash Out).
                  </p>
                  {pnrs.map((p) => {
                    const depositPaid = (p.deposit_total || 0);
                    const sisaPelunasan = (p.payoff_amount || 0);
                    return (
                      <div key={p.id} className="flex justify-between text-sm py-1">
                        <span className="text-slate-700">
                          {p.pnr}
                          {p.vendor && <span className="text-xs text-slate-400 ml-1">· {p.vendor}</span>}
                          {sisaPelunasan > 0 && (
                            <span className="text-[10px] text-slate-500 ml-1">
                              (sisa pelunasan: {fmtRupiah(sisaPelunasan)})
                            </span>
                          )}
                        </span>
                        <span className="font-semibold text-amber-700">{fmtRupiah(depositPaid)}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </SubSection>

            {manualOut > 0 && (
              <SubSection title="Manual Cash Out" total={manualOut} color="text-amber-700">
                {accEntries.filter((e) => e.type === 'out').map((e) => (
                  <div key={e.id} className="flex justify-between text-sm py-1">
                    <span className="text-slate-700">{e.description}{e.category && <span className="text-xs text-slate-400 ml-1">({e.category})</span>}</span>
                    <span className="font-semibold text-amber-700">{fmtRupiah(e.amount)}</span>
                  </div>
                ))}
              </SubSection>
            )}

            {hppOwed > 0 && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                <p className="font-bold">💼 Masih ada hutang vendor: {fmtRupiah(hppOwed)}</p>
                <p className="mt-1">HPP yang sudah di-input di Finance tapi belum lunas.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider">📊 Proyeksi vs Real</h3>
          <DownloadButtons
            filename={`proyeksi-vs-real-${trip.kode_trip || trip.id}`}
            title={`Proyeksi vs Real — ${trip.name}`}
            columns={[
              { key: 'metric', label: 'Metrik' },
              { key: 'proyeksi', label: 'Proyeksi', align: 'right', format: 'rupiah' },
              { key: 'real', label: 'Real', align: 'right', format: 'rupiah' },
              { key: 'selisih', label: 'Selisih', align: 'right', format: 'rupiah' },
            ]}
            rows={proyVsRealRows}
          />
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr className="text-xs text-slate-600 uppercase">
              <th className="py-2 text-left">Metrik</th>
              <th className="py-2 text-right">Proyeksi (Finance)</th>
              <th className="py-2 text-right">Real (Accounting)</th>
              <th className="py-2 text-right">Selisih</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-2">Income</td><td className="py-2 text-right text-slate-700">{fmtRupiah(proyIncome)}</td><td className="py-2 text-right text-green-700 font-semibold">{fmtRupiah(totalRealIn)}</td><td className="py-2 text-right text-slate-500">{fmtRupiah(totalRealIn - proyIncome)}</td></tr>
            <tr><td className="py-2">HPP / Cost</td><td className="py-2 text-right text-slate-700">{fmtRupiah(proyHpp)}</td><td className="py-2 text-right text-amber-700 font-semibold">{fmtRupiah(totalRealOut)}</td><td className="py-2 text-right text-slate-500">{fmtRupiah(totalRealOut - proyHpp)}</td></tr>
            <tr className="font-bold border-t-2"><td className="py-2">Profit</td><td className={`py-2 text-right ${proyProfit >= 0 ? 'text-purple-700' : 'text-red-700'}`}>{fmtRupiah(proyProfit)}</td><td className={`py-2 text-right ${realProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>{fmtRupiah(realProfit)}</td><td className="py-2 text-right text-slate-500">{fmtRupiah(realProfit - proyProfit)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function ClassCard({ label, value, color, bg, desc, highlight }) {
  return (
    <div className={`rounded-lg p-3 border ${highlight ? 'border-yellow-400 ring-2 ring-yellow-200' : 'border-slate-200'} ${bg}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{fmtRupiah(value)}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{desc}</p>
    </div>
  );
}

function SubSection({ title, total, color, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-100">
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">{title}</p>
        <p className={`text-xs font-bold ${color}`}>{fmtRupiah(total)}</p>
      </div>
      {children}
    </div>
  );
}
