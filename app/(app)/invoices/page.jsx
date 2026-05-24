// Round 99: Invoices page + NOTIF banner pending payment + group by trip + link Master Trip

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const STATUS_BADGE = {
  draft:     { label: 'Draft',         color: 'bg-slate-100 text-slate-700' },
  sent:      { label: 'Sent',          color: 'bg-amber-100 text-amber-800' },
  paid:      { label: '✅ Paid',       color: 'bg-green-100 text-green-800' },
  overdue:   { label: '⚠ Overdue',     color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled',     color: 'bg-slate-100 text-slate-500' },
};

function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}
function fmtDateTime(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

export default async function InvoicesPage() {
  const supabase = createClient();

  const [invoicesRes, tripsRes, passengersRes, customersRes, pendingPaymentsRes] = await Promise.all([
    supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('trips').select('id, kode_trip, name, departure, status'),
    supabase.from('trip_passengers').select('id, trip_id, customer_id'),
    supabase.from('customers').select('id, name'),
    // Round 99: Pending payments (perlu approve)
    supabase
      .from('invoice_payments')
      .select('*, invoices(id, invoice_no, milestone, trip_id, customer_name, trip_kode)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const allInvoices = invoicesRes.data || [];
  const trips = tripsRes.data || [];
  const allPassengers = passengersRes.data || [];
  const customers = customersRes.data || [];
  const pendingPayments = pendingPaymentsRes.data || [];

  const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));
  const custMap = Object.fromEntries(customers.map((c) => [c.id, c]));

  // Group invoices by trip_id
  const byTrip = {};
  for (const t of trips) {
    const peserta = allPassengers.filter((p) => p.trip_id === t.id);
    byTrip[t.id] = {
      trip: t,
      pesertaCount: peserta.length,
      pesertaIds: peserta.map((p) => p.id),
      invoices: [],
      stats: { total: 0, paid: 0, sent: 0, draft: 0, totalAmount: 0, paidAmount: 0 },
    };
  }
  byTrip['_no_trip'] = {
    trip: { id: '_no_trip', kode_trip: '—', name: 'Tanpa Trip', status: '—' },
    pesertaCount: 0,
    pesertaIds: [],
    invoices: [],
    stats: { total: 0, paid: 0, sent: 0, draft: 0, totalAmount: 0, paidAmount: 0 },
  };

  for (const inv of allInvoices) {
    const key = inv.trip_id && byTrip[inv.trip_id] ? inv.trip_id : '_no_trip';
    const g = byTrip[key];
    if (!g) continue;
    g.invoices.push(inv);
    g.stats.total += 1;
    g.stats.totalAmount += Number(inv.amount) || 0;
    if (inv.status === 'paid') {
      g.stats.paid += 1;
      g.stats.paidAmount += Number(inv.amount) || 0;
    } else if (inv.status === 'sent') {
      g.stats.sent += 1;
    } else if (inv.status === 'draft') {
      g.stats.draft += 1;
    }
  }

  const groups = Object.values(byTrip)
    .filter((g) => g.invoices.length > 0 || g.pesertaCount > 0)
    .sort((a, b) => {
      if (a.invoices.length !== b.invoices.length) return b.invoices.length - a.invoices.length;
      return (b.trip.departure || '').localeCompare(a.trip.departure || '');
    });

  const grand = {
    totalInvoices: allInvoices.length,
    paidInvoices: allInvoices.filter((i) => i.status === 'paid').length,
    totalAmount: allInvoices.reduce((s, i) => s + Number(i.amount || 0), 0),
    paidAmount: allInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0),
  };
  const sisa = grand.totalAmount - grand.paidAmount;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">Invoices</h1>
          <p className="mt-1 text-slate-600">Tracking invoice per group/trip. Generate dari Payment Checklist.</p>
        </div>
        <Link href="/finance/payments" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
          → Payment Checklist (Generate Invoice)
        </Link>
      </div>

      {/* ROUND 99 — NOTIF BANNER pending payment */}
      {pendingPayments.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl shadow-card overflow-hidden">
          <div className="px-5 py-3 bg-amber-100 border-b border-amber-300 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔔</span>
              <div>
                <h3 className="font-bold text-amber-900">
                  {pendingPayments.length} Bukti Pembayaran Menunggu Verifikasi
                </h3>
                <p className="text-xs text-amber-700">
                  Peserta sudah upload bukti transfer. Klik untuk approve.
                </p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-amber-200 max-h-80 overflow-y-auto">
            {pendingPayments.map((p) => {
              const inv = p.invoices;
              return (
                <div key={p.id} className="px-5 py-3 hover:bg-amber-100/50 transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-amber-900 text-sm">{inv?.invoice_no || '—'}</span>
                        <span className="text-xs font-semibold text-amber-800">{inv?.milestone}</span>
                        <span className="text-xs text-slate-600">·</span>
                        <span className="font-semibold text-slate-800">{inv?.customer_name || '—'}</span>
                        {inv?.trip_kode && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-mono">{inv.trip_kode}</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-amber-700">
                        Bayar <span className="font-bold">{fmtRupiah(p.amount)}</span> · {fmtDate(p.payment_date)} · {p.payment_method}
                      </p>
                      {p.note_from_customer && (
                        <p className="mt-1 text-xs italic text-slate-600">"{p.note_from_customer}"</p>
                      )}
                      <p className="text-[10px] text-slate-500 mt-0.5">Diupload: {fmtDateTime(p.created_at)}</p>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {p.proof_url && (
                        <a
                          href={p.proof_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded"
                        >
                          📎 Lihat Bukti
                        </a>
                      )}
                      <Link
                        href={`/invoices/${inv?.id}`}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded"
                      >
                        Review & Approve →
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Invoice" value={grand.totalInvoices} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Total Tagihan" value={fmtRupiah(grand.totalAmount)} color="text-slate-700" bg="bg-slate-50" small />
        <StatCard label="Sudah Dibayar" value={fmtRupiah(grand.paidAmount)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Sisa Tagihan" value={fmtRupiah(sisa)} color="text-amber-700" bg="bg-amber-50" small />
      </div>

      {groups.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-4xl mb-3">📄</p>
          <p className="text-lg font-bold text-slate-700">Belum ada invoice</p>
          <p className="mt-1 text-sm text-slate-500">Generate dari /finance/payments/[trip] → klik peserta → Generate Invoice</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const t = g.trip;
            const progress = g.stats.total > 0 ? Math.round((g.stats.paid / g.stats.total) * 100) : 0;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                <div className="px-5 py-3 bg-gradient-to-r from-brand-50 to-blue-50 border-b border-brand-200 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-brand-700 bg-white px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
                      <h2 className="text-base font-bold text-brand-700">{t.name}</h2>
                      {t.departure && <span className="text-xs text-slate-500">{fmtDate(t.departure)}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                      <span>👥 {g.pesertaCount} peserta</span>
                      <span>📄 {g.stats.total} invoice</span>
                      <span className="text-green-700 font-semibold">✓ {g.stats.paid} paid</span>
                      {g.stats.sent > 0 && <span className="text-amber-700">⏳ {g.stats.sent} sent</span>}
                      {g.stats.draft > 0 && <span className="text-slate-600">📝 {g.stats.draft} draft</span>}
                      <span className="font-semibold">Progress: <span className="text-brand-700">{progress}%</span></span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
                      <span>Total: <span className="font-bold text-slate-800">{fmtRupiah(g.stats.totalAmount)}</span></span>
                      <span>Paid: <span className="font-bold text-green-700">{fmtRupiah(g.stats.paidAmount)}</span></span>
                      <span>Sisa: <span className="font-bold text-amber-700">{fmtRupiah(g.stats.totalAmount - g.stats.paidAmount)}</span></span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {t.id !== '_no_trip' && (
                      <>
                        <Link href={`/trips/${t.id}`} className="text-xs font-semibold px-3 py-1.5 rounded bg-white hover:bg-slate-100 text-brand-700 border border-slate-200">
                          → Master Trip
                        </Link>
                        <Link href={`/finance/payments/${t.id}`} className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white">
                          📄 Generate Invoice
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                {g.pesertaCount > 0 && t.id !== '_no_trip' && (
                  <PesertaInvoiceStatus
                    pesertaIds={g.pesertaIds}
                    allPassengers={allPassengers}
                    custMap={custMap}
                    groupInvoices={g.invoices}
                    tripId={t.id}
                  />
                )}

                {g.invoices.length === 0 ? (
                  <p className="px-5 py-4 text-center text-sm text-slate-500 italic">
                    Belum ada invoice untuk trip ini.
                    {t.id !== '_no_trip' && (
                      <> <Link href={`/finance/payments/${t.id}`} className="text-brand-600 hover:underline font-semibold">Generate dulu →</Link></>
                    )}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr className="text-left text-xs font-bold text-slate-600 uppercase tracking-wider">
                          <th className="px-3 py-2">Invoice No</th>
                          <th className="px-3 py-2">Peserta</th>
                          <th className="px-3 py-2">Milestone</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2">Due/Paid</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.invoices.map((i) => {
                          const s = STATUS_BADGE[i.status] || STATUS_BADGE.draft;
                          return (
                            <tr key={i.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono text-xs font-bold text-brand-700">{i.invoice_no}</td>
                              <td className="px-3 py-2 text-xs">{i.customer_name || '—'}</td>
                              <td className="px-3 py-2 text-xs font-semibold">{i.milestone}</td>
                              <td className="px-3 py-2 text-right font-bold">{fmtRupiah(i.amount)}</td>
                              <td className="px-3 py-2 text-xs text-slate-500">
                                {i.status === 'paid'
                                  ? `Paid: ${fmtDate(i.paid_at)}`
                                  : `Due: ${fmtDate(i.due_date)}`}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${s.color}`}>{s.label}</span>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Link href={`/invoices/${i.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                                  Detail →
                                </Link>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PesertaInvoiceStatus({ pesertaIds, allPassengers, custMap, groupInvoices, tripId }) {
  const peserta = pesertaIds.map((pid) => {
    const p = allPassengers.find((x) => x.id === pid);
    const c = p ? custMap[p.customer_id] : null;
    const myInvoices = groupInvoices.filter((inv) => inv.passenger_id === pid);
    return {
      id: pid,
      name: c?.name || '—',
      total: myInvoices.length,
      paid: myInvoices.filter((i) => i.status === 'paid').length,
      pending: myInvoices.filter((i) => i.status !== 'paid' && i.status !== 'cancelled').length,
    };
  });

  return (
    <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2">
        Status Per Peserta ({peserta.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {peserta.map((p) => {
          const isEmpty = p.total === 0;
          const allPaid = p.total > 0 && p.paid === p.total;
          const cls = isEmpty
            ? 'bg-slate-100 text-slate-500 border-slate-200'
            : allPaid
            ? 'bg-green-50 text-green-800 border-green-300'
            : 'bg-amber-50 text-amber-800 border-amber-300';
          return (
            <span
              key={p.id}
              className={`text-[10px] px-2 py-1 rounded border font-semibold ${cls}`}
              title={`${p.name}: ${p.total} invoice (${p.paid} paid, ${p.pending} pending)`}
            >
              {isEmpty ? '❌' : allPaid ? '✅' : '⏳'} {p.name} {!isEmpty && `(${p.paid}/${p.total})`}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
