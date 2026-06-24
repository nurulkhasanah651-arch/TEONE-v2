// Finance landing — Round 82: STATIC import (bukan try/catch require) untuk fix sync

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { fmtRupiah } from '@/lib/utils/format';
import { computeIncomeProjection } from '@/lib/utils/price-breakdown';
import { getManualTransfers } from '@/lib/shop/data';
import PaymentReminderPanel from '@/components/finance/PaymentReminderPanel';

export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const supabase = createClient();

  const [tripsRes, itemsRes, pnrRes, paxRes, accRes] = await Promise.all([
    supabase.from('trips').select('id, status, price_breakdown'),
    supabase.from('trip_finance_items').select('trip_id, item_type, total_amount'),
    supabase.from('flight_inventory').select('id', { count: 'exact', head: true }),
    fetchAll(() => supabase.from('trip_passengers').select('trip_id, room_type, price_paid, age_type')),
    supabase.from('accounting_entries').select('type, amount'),
  ]);

  const trips = tripsRes.data || [];
  let manualPendingCount = 0;
  try {
    const mt = await getManualTransfers({ limit: 150 });
    manualPendingCount = mt.filter((r) => r.manual_status === 'pending' && r.status !== 'paid').length;
  } catch {}
  const items = itemsRes.data || [];
  const allPax = paxRes || [];
  const totalTrips = trips.length;
  const totalPNR = pnrRes.count ?? 0;

  // Manual income/hpp dari trip_finance_items
  const manualIncome = items.filter((i) => i.item_type === 'income').reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  const hppItemsTotal = items.filter((i) => i.item_type === 'hpp').reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  // Cash in/out manual (Accounting) ikut proyeksi: in -> income, out -> HPP
  const accEntries = accRes.data || [];
  const accCashIn = accEntries.filter((e) => e.type === 'in').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const accCashOut = accEntries.filter((e) => e.type === 'out').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalHPP = hppItemsTotal + accCashOut;

  // AUTO income projection per trip
  const paxByTrip = {};
  for (const p of allPax) {
    if (!paxByTrip[p.trip_id]) paxByTrip[p.trip_id] = [];
    paxByTrip[p.trip_id].push(p);
  }

  let autoIncome = 0;
  for (const t of trips) {
    if (t.status === 'cancelled') continue;
    const breakdown = t.price_breakdown || {};
    const pax = paxByTrip[t.id] || [];
    try {
      const proj = computeIncomeProjection(pax, breakdown);
      autoIncome += proj.total || 0;
    } catch {}
  }

  const totalIncome = autoIncome + manualIncome + accCashIn;
  const totalProfit = totalIncome - totalHPP;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Finance</h1>
        <p className="mt-1 text-slate-600">Kelola cashflow, payment, dan inventory tiket dalam satu tempat.</p>
      </div>

      <PaymentReminderPanel />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Trip" value={totalTrips} color="text-brand-700" bg="bg-brand-50" />
        <StatCard
          label="Total Income"
          value={fmtRupiah(totalIncome)}
          sub={`Auto ${fmtRupiah(autoIncome)} + Manual ${fmtRupiah(manualIncome + accCashIn)}`}
          color="text-green-700"
          bg="bg-green-50"
          small
        />
        <StatCard label="Total HPP" value={fmtRupiah(totalHPP)} color="text-amber-700" bg="bg-amber-50" small />
        <StatCard label="Total Profit" value={fmtRupiah(totalProfit)} color={totalProfit >= 0 ? 'text-blue-700' : 'text-red-700'} bg={totalProfit >= 0 ? 'bg-blue-50' : 'bg-red-50'} small />
      </div>

      {/* Round 94: tambah Invoices Peserta jadi 4 section card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard
          href="/finance/payments"
          icon="🧾"
          title="Payment Checklist Peserta"
          desc="DP, Payment 1/2/3, Pelunasan, Visa, Asuransi. Tracking pembayaran tiap peserta."
          badge="Per peserta"
          color="from-blue-500 to-indigo-700"
        />
        <SectionCard
          href="/invoices"
          icon="📄"
          title="Invoices Peserta"
          desc="Generate invoice per milestone, kirim via WhatsApp, peserta upload bukti transfer, auto receipt setelah verify + info sisa pembayaran."
          badge="Per peserta · per group"
          color="from-pink-500 to-rose-700"
        />
        <SectionCard
          href="/finance/manual-transfer"
          icon="🏦"
          title="Transfer Manual Web"
          desc="Verifikasi bukti transfer bank dari customer (etalase web). Approve = peserta auto masuk Master Trip + checklist payment."
          badge={manualPendingCount > 0 ? `${manualPendingCount} menunggu verifikasi` : 'Dari etalase web'}
          color="from-amber-500 to-orange-700"
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, bg, small = false }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SectionCard({ href, icon, title, desc, badge, color }) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 overflow-hidden"
    >
      <div className={`h-2 bg-gradient-to-r ${color}`} />
      <div className="p-5">
        <div className="text-4xl mb-3">{icon}</div>
        <h3 className="text-lg font-bold text-brand-700">{title}</h3>
        <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{desc}</p>
        <span className="mt-3 inline-block text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase tracking-wider">
          {badge}
        </span>
      </div>
    </Link>
  );
}
