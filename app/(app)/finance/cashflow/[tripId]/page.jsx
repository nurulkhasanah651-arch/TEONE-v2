// R157 + R215c + R215d + R215e + R215f: Finance Cashflow Detail
// R215c: Quotation Excel
// R215d: Hotel HPP Calculator
// R215e: Roomlist auto-generator
// R215f: PROYEKSI INCOME PESERTA dari master trip (R211 reuse)
// EXISTING: FinanceItemForm, FinanceItemRow, Cash In Auto, Stats → TETAP UTUH
// Path: app/(app)/finance/cashflow/[tripId]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import { computeIncomeProjection } from '@/lib/utils/price-breakdown';
import FinanceItemForm from '@/components/finance/FinanceItemForm';
import FinanceItemRow from '@/components/finance/FinanceItemRow';
import DownloadButtons from '@/components/common/DownloadButtons';
import QuotationDownloadButton from '@/components/finance/QuotationDownloadButton';
import HotelHPPSection from '@/components/finance/HotelHPPSection';
import RoomlistPanel from '@/components/finance/RoomlistPanel';
// R215f — Proyeksi Income section
import ProyeksiIncomeSection from '@/components/finance/ProyeksiIncomeSection';

export const dynamic = 'force-dynamic';

// R215f — fetch breakdown dari payment_templates atau trips.price_breakdown
async function fetchBreakdown(supabase, tripId, trip) {
  try {
    const { data } = await supabase
      .from('payment_templates')
      .select('*')
      .eq('trip_id', tripId)
      .maybeSingle();
    if (data) return data;
  } catch (e) {
    // table maybe doesn't exist, try fallback
  }
  // Fallback: trips.price_breakdown JSONB
  if (trip?.price_breakdown && typeof trip.price_breakdown === 'object') {
    return trip.price_breakdown;
  }
  return {};
}

export default async function CashflowDetailPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  // R215f — tambah price_paid, discount_amount ke passengers select
  const [tripRes, itemsRes, passengersRes, customersRes] = await Promise.all([
    supabase.from('trips').select('*').eq('id', tripId).maybeSingle(),
    supabase.from('trip_finance_items').select('*').eq('trip_id', tripId).order('item_type').order('category'),
    supabase.from('trip_passengers')
      .select('id, customer_id, room_type, gender, sex, family_group_id, price_paid, discount_amount, transfer_status, refund_status')
      .eq('trip_id', tripId),
    supabase.from('customers').select('id, name'),
  ]);

  if (!tripRes.data) notFound();
  const trip = tripRes.data;
  const items = itemsRes.data || [];
  const allPassengers = passengersRes.data || [];
  const customers = customersRes.data || [];

  // R215f — fetch breakdown
  const breakdown = await fetchBreakdown(supabase, tripId, trip);

  const activePassengers = allPassengers.filter((p) => {
    const isTransferred = p.transfer_status === 'transferred';
    const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isTransferred && !isRefunded;
  });
  const paxCount = activePassengers.length;

  const allPaxIds = allPassengers.map((p) => p.id);

  // R215f — fetch ALL payments (untuk income projection + cash in auto)
  let allPayments = [];
  if (allPaxIds.length > 0) {
    try {
      const { data: pays } = await supabase
        .from('participant_payments')
        .select('*')
        .in('passenger_id', allPaxIds);
      allPayments = (pays || []).filter((p) => p.is_transferred !== true);
    } catch (e) {
      // defensive
    }
  }

  // Auto cash in (real) — sum semua valid payments
  const autoCashIn = allPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const actualPaymentCount = allPayments.length;

  // R215f — Compute Proyeksi Income dari master trip
  const proyeksi = computeIncomeProjection(activePassengers, breakdown, allPayments);
  const proyeksiIncome = proyeksi.total || 0;

  // R215f — Group payments by pax untuk display
  const paymentsByPax = {};
  for (const p of allPayments) {
    if (!paymentsByPax[p.passenger_id]) paymentsByPax[p.passenger_id] = [];
    paymentsByPax[p.passenger_id].push(p);
  }

  const incomeItems = items.filter((i) => i.item_type === 'income');
  const hppItems = items.filter((i) => i.item_type === 'hpp');
  const hotelHppItems = hppItems.filter((i) =>
    i.is_hotel === true ||
    String(i.category || '').toLowerCase().includes('hotel') ||
    String(i.component || '').toLowerCase().includes('hotel') ||
    i.room_type
  );

  const manualIncome = incomeItems.reduce((s, i) => s + (i.total_amount || 0), 0);

  // R215f — 2 metrics terpisah
  const totalIncomeProyeksi = manualIncome + proyeksiIncome;
  const totalIncomeReal = manualIncome + autoCashIn;

  const totalHPP = hppItems.reduce((s, i) => s + (i.total_amount || 0), 0);
  const profitProyeksi = totalIncomeProyeksi - totalHPP;
  const profitReal = totalIncomeReal - totalHPP;
  const marginProyeksi = totalIncomeProyeksi > 0 ? Math.round((profitProyeksi / totalIncomeProyeksi) * 100) : null;

  const refundHpp = hppItems.filter((i) => i.category === 'Refund');
  const totalRefundHpp = refundHpp.reduce((s, i) => s + (i.total_amount || 0), 0);

  const landtourItem = hppItems.find((i) => {
    const cat = String(i.category || '').toLowerCase();
    const comp = String(i.component || '').toLowerCase();
    return cat.includes('landtour') || cat.includes('land tour') ||
           comp.includes('landtour') || comp.includes('dmc');
  });
  const operatedBy = landtourItem?.vendor_name || 'PRO DMC';

  function groupByCategory(arr) {
    const grouped = {};
    for (const i of arr) {
      const k = i.category || 'Lainnya';
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(i);
    }
    return grouped;
  }
  const incomeByCategory = groupByCategory(incomeItems);
  const hppByCategory = groupByCategory(hppItems);

  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

  const fullReportRows = [
    ...incomeItems.map((i) => ({
      tipe: 'INCOME',
      category: i.category || '-',
      component: i.component,
      vendor: i.vendor_name || '-',
      qty: i.qty || 1,
      unit_price: i.basic_fare || 0,
      total: i.total_amount || 0,
      status: i.payment_status || '-',
    })),
    ...hppItems.map((i) => ({
      tipe: 'HPP',
      category: i.category || '-',
      component: i.component,
      vendor: i.vendor_name || '-',
      qty: i.qty || 1,
      unit_price: i.basic_fare || 0,
      total: i.total_amount || 0,
      status: i.payment_status || '-',
    })),
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/finance/cashflow" className="text-sm text-brand-600 font-medium hover:underline">← Proyeksi Income per Group</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
          <p className="mt-1 text-slate-600">
            Auto Proyeksi Income (dari master) + Manual Income + HPP.
            <span className="ml-2 text-xs font-semibold text-brand-600">📊 {paxCount} pax aktif</span>
            {operatedBy && operatedBy !== 'PRO DMC' && (
              <span className="ml-2 text-xs font-semibold text-purple-700">🤝 Operated by {operatedBy}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <QuotationDownloadButton
            trip={trip}
            incomeItems={incomeItems}
            hppItems={hppItems}
            paxCount={paxCount}
            totalIncome={totalIncomeProyeksi}
            totalHPP={totalHPP}
            profit={profitProyeksi}
            operatedBy={operatedBy}
          />
          <DownloadButtons
            filename={`proyeksi-income-${trip.kode_trip || trip.id}`}
            title={`Proyeksi Income — ${trip.kode_trip || ''} ${trip.name}`}
            subtitle={`${paxCount} pax aktif · ${actualPaymentCount} payment`}
            extraInfo={[
              { label: 'Proyeksi Income Peserta', value: fmtMoney(proyeksiIncome) },
              { label: 'Manual Income', value: fmtMoney(manualIncome) },
              { label: 'Total Income Proyeksi', value: fmtMoney(totalIncomeProyeksi) },
              { label: 'Cash In Peserta (Real)', value: fmtMoney(autoCashIn) },
              { label: 'Total HPP', value: fmtMoney(totalHPP) },
              { label: 'Profit Proyeksi', value: fmtMoney(profitProyeksi) },
              { label: 'Margin', value: marginProyeksi == null ? '-' : `${marginProyeksi}%` },
            ]}
            columns={[
              { key: 'tipe', label: 'Tipe' },
              { key: 'category', label: 'Kategori' },
              { key: 'component', label: 'Komponen' },
              { key: 'vendor', label: 'Vendor' },
              { key: 'qty', label: 'Qty', align: 'right' },
              { key: 'unit_price', label: 'Harga Satuan', align: 'right', format: 'rupiah' },
              { key: 'total', label: 'Total', align: 'right', format: 'rupiah' },
              { key: 'status', label: 'Status' },
            ]}
            rows={fullReportRows}
            summary={[
              { label: 'TOTAL INCOME PROYEKSI', value: fmtMoney(totalIncomeProyeksi) },
              { label: 'TOTAL HPP', value: fmtMoney(totalHPP) },
              { label: 'PROFIT PROYEKSI', value: fmtMoney(profitProyeksi) },
              { label: 'MARGIN', value: marginProyeksi == null ? '-' : `${marginProyeksi}%` },
            ]}
            buttonSize="md"
          />
        </div>
      </div>

      {/* R215f — STATS CARDS: pakai PROYEKSI (cash in real as sub) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Income (Proyeksi)"
          value={fmtRupiah(totalIncomeProyeksi)}
          sub={`Real Cash In: ${fmtRupiah(autoCashIn)} · ${actualPaymentCount} payment`}
          color="text-green-700"
          bg="bg-green-50"
        />
        <StatCard
          label="Total HPP"
          value={fmtRupiah(totalHPP)}
          sub={`${hppItems.length} item${refundHpp.length > 0 ? ` (${refundHpp.length} refund)` : ''}`}
          color="text-amber-700"
          bg="bg-amber-50"
        />
        <StatCard
          label="Profit (Proyeksi)"
          value={fmtRupiah(profitProyeksi)}
          sub={`Real: ${fmtRupiah(profitReal)}`}
          color={profitProyeksi >= 0 ? 'text-blue-700' : 'text-red-700'}
          bg={profitProyeksi >= 0 ? 'bg-blue-50' : 'bg-red-50'}
        />
        <StatCard
          label="Margin (Proyeksi)"
          value={marginProyeksi == null ? '—' : `${marginProyeksi}%`}
          sub={marginProyeksi == null ? 'No income' :
                marginProyeksi <= 12 ? 'EVALUASI' :
                marginProyeksi <= 18 ? 'WASPADA' :
                marginProyeksi <= 25 ? 'SEHAT' : 'EXCELLENT'}
          color={marginProyeksi == null ? 'text-slate-500' :
                  marginProyeksi <= 12 ? 'text-red-700' :
                  marginProyeksi <= 18 ? 'text-amber-700' :
                  marginProyeksi <= 25 ? 'text-green-700' : 'text-emerald-700'}
          bg={marginProyeksi == null ? 'bg-slate-50' :
              marginProyeksi <= 12 ? 'bg-red-50' :
              marginProyeksi <= 18 ? 'bg-amber-50' :
              marginProyeksi <= 25 ? 'bg-green-50' : 'bg-emerald-50'}
        />
      </div>

      {/* R215f — PROYEKSI INCOME SECTION (NEW) */}
      <ProyeksiIncomeSection
        activePassengers={activePassengers}
        breakdown={breakdown}
        paymentsByPax={paymentsByPax}
        customers={customers}
        total={proyeksiIncome}
        byRoom={proyeksi.byRoom}
        undefinedCount={proyeksi.undefinedCount}
      />

      {/* Cash In Peserta (Auto) — EXISTING */}
      <div className="bg-white rounded-xl border-2 border-green-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b bg-green-50 border-green-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-green-800 flex items-center gap-2">
            <span>💰</span> Cash In Peserta (Real — Actual Received)
          </h2>
          <p className="text-lg font-bold text-green-700">{fmtRupiah(autoCashIn)}</p>
        </div>
        <div className="p-4 text-sm text-slate-600">
          <p>Auto-aggregated dari <span className="font-mono">participant_payments</span>.</p>
          <p className="mt-1 text-xs text-slate-500">
            • {actualPaymentCount} payment terhitung (exclude payment yang udah dipindah ke trip lain)
            <br />
            • {paxCount} peserta aktif (selain itu peserta transferred-out atau refunded)
            <br />
            • Refund cash out: {fmtRupiah(totalRefundHpp)} (lihat di HPP kategori "Refund")
            <br />
            • Net peserta cash flow (after refund): <b>{fmtRupiah(autoCashIn - totalRefundHpp)}</b>
            <br />
            • <span className="font-bold text-emerald-700">Sisa belum diterima: {fmtRupiah(Math.max(proyeksiIncome - autoCashIn, 0))}</span> (Proyeksi - Real)
          </p>
        </div>
      </div>

      <FinanceSection
        title="Manual Income (Vendor/Lain-lain)"
        emoji="💸"
        color="green"
        items={incomeItems}
        itemsByCategory={incomeByCategory}
        total={manualIncome}
        tripId={tripId}
        type="income"
        paxCount={paxCount}
        tripKode={trip.kode_trip || trip.id}
        tripName={trip.name}
        fmtMoney={fmtMoney}
      />

      <RoomlistPanel
        trip={trip}
        passengers={allPassengers}
        customers={customers}
      />

      <HotelHPPSection
        trip={trip}
        passengers={allPassengers}
        customers={customers}
        hotelItems={hotelHppItems}
      />

      <FinanceSection
        title="HPP (Cost) — termasuk Hotel & Refund"
        emoji="🧾"
        color="amber"
        items={hppItems}
        itemsByCategory={hppByCategory}
        total={totalHPP}
        tripId={tripId}
        type="hpp"
        paxCount={paxCount}
        tripKode={trip.kode_trip || trip.id}
        tripName={trip.name}
        fmtMoney={fmtMoney}
      />
    </div>
  );
}

function FinanceSection({ title, emoji, color, items, itemsByCategory, total, tripId, type, paxCount, tripKode, tripName, fmtMoney }) {
  const headerBg = color === 'green' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200';
  const titleColor = color === 'green' ? 'text-green-800' : 'text-amber-800';
  const totalColor = color === 'green' ? 'text-green-700' : 'text-amber-700';

  const sectionRows = items.map((i) => ({
    category: i.category || '-',
    component: i.component,
    vendor: i.vendor_name || '-',
    qty: i.qty || 1,
    unit_price: i.basic_fare || 0,
    total: i.total_amount || 0,
    status: i.payment_status || '-',
  }));

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className={`px-5 py-3 border-b ${headerBg}`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className={`font-bold ${titleColor} flex items-center gap-2`}>
            <span>{emoji}</span> {title}
          </h2>
          <div className="flex items-center gap-2">
            <p className={`text-lg font-bold ${totalColor}`}>{fmtRupiah(total)}</p>
            {items.length > 0 && (
              <DownloadButtons
                filename={`${type}-${tripKode}`}
                title={`${title} — ${tripName}`}
                columns={[
                  { key: 'category', label: 'Kategori' },
                  { key: 'component', label: 'Komponen' },
                  { key: 'vendor', label: 'Vendor' },
                  { key: 'qty', label: 'Qty', align: 'right' },
                  { key: 'unit_price', label: 'Harga Satuan', align: 'right', format: 'rupiah' },
                  { key: 'total', label: 'Total', align: 'right', format: 'rupiah' },
                  { key: 'status', label: 'Status' },
                ]}
                rows={sectionRows}
                summary={[{ label: 'TOTAL', value: fmtMoney(total) }]}
              />
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-slate-200 bg-slate-50">
        <FinanceItemForm tripId={tripId} type={type} paxCount={paxCount} />
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p className="text-sm">Belum ada item {type === 'income' ? 'income' : 'HPP'} untuk trip ini.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {Object.entries(itemsByCategory).map(([category, list]) => (
            <div key={category} className="p-4">
              <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 ${category === 'Refund' ? 'text-red-600' : 'text-slate-500'}`}>
                {category === 'Refund' ? '💸 Refund' : category}
              </h3>
              <div className="space-y-2">
                {list.map((it) => (
                  <FinanceItemRow key={it.id} item={it} tripId={tripId} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
