// R208 + R209 + R210 + R212: Payment Checklist + familyGroups
// R215y² REVERT: PaymentDriveSyncPanel DIHAPUS dari sini (pindah ke /invoices)
// SEMUA fitur existing TETAP UTUH (PaymentTemplateForm, PaymentMatrix, DeliverySection, PNR Deposit table)
// Path: app/(app)/finance/payments/[tripId]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah } from '@/lib/utils/format';
import PaymentTemplateForm from '@/components/finance/PaymentTemplateForm';
import PaymentMatrix from '@/components/finance/PaymentMatrix';
import DownloadButtons from '@/components/common/DownloadButtons';
import DeliverySection from '@/components/checklist/DeliverySection';
import { expectedPerPassenger } from '@/lib/utils/price-breakdown';

export const dynamic = 'force-dynamic';

export default async function TripPaymentsPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  const { data: tp } = await supabase
    .from('trip_passengers')
    .select('*')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  const allPassengers = tp || [];

  const passengers = allPassengers.filter((p) => {
    const isTransferred = p.transfer_status === 'transferred';
    const isRefunded = p.refund_status === 'refunded' || p.refund_status === 'partial_refund';
    return !isTransferred && !isRefunded;
  });

  const transferredCount = allPassengers.filter((p) => p.transfer_status === 'transferred').length;
  const refundedCount = allPassengers.filter((p) => p.refund_status === 'refunded' || p.refund_status === 'partial_refund').length;

  const passengerIds = passengers.map((p) => p.id);
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);

  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase
      .from('customers')
      .select('id, name, phone, email, whatsapp, gender, sex')
      .in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }
  const passengersWithCustomers = passengers.map((p) => ({ ...p, customers: customerMap[p.customer_id] || null }));

  let paymentsByPassenger = {};
  if (passengerIds.length > 0) {
    let payments = [];
    try {
      const r = await supabase.from('participant_payments')
        .select('*')
        .in('passenger_id', passengerIds)
        .eq('is_transferred', false);
      payments = r.data || [];
    } catch {
      const r = await supabase.from('participant_payments')
        .select('*')
        .in('passenger_id', passengerIds);
      payments = r.data || [];
    }
    for (const p of payments) {
      if (!paymentsByPassenger[p.passenger_id]) paymentsByPassenger[p.passenger_id] = [];
      paymentsByPassenger[p.passenger_id].push(p);
    }
  }

  let invoicesByPassenger = {};
  if (passengerIds.length > 0) {
    const { data: invs } = await supabase
      .from('invoices')
      .select('*')
      .in('passenger_id', passengerIds)
      .order('created_at', { ascending: false });
    for (const inv of (invs || [])) {
      if (!invoicesByPassenger[inv.passenger_id]) invoicesByPassenger[inv.passenger_id] = [];
      invoicesByPassenger[inv.passenger_id].push(inv);
    }
  }

  let ongkirInvoicesByPassenger = {};
  if (passengerIds.length > 0) {
    const { data: ongkirInvs } = await supabase
      .from('invoices')
      .select('id, invoice_no, passenger_id, amount, status, paid_at, milestone, public_token')
      .in('passenger_id', passengerIds)
      .ilike('milestone', '%ongkir%')
      .order('created_at', { ascending: false });
    for (const inv of (ongkirInvs || [])) {
      if (!ongkirInvoicesByPassenger[inv.passenger_id]) ongkirInvoicesByPassenger[inv.passenger_id] = [];
      ongkirInvoicesByPassenger[inv.passenger_id].push(inv);
    }
  }

  let familyGroups = [];
  try {
    const { data: fgRes } = await supabase
      .from('family_groups')
      .select('*')
      .eq('trip_id', tripId);
    familyGroups = fgRes || [];
  } catch { familyGroups = []; }

  const breakdown = (trip.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {};

  const { data: pnrRes } = await supabase.from('flight_inventory').select('*').eq('trip_id', tripId);
  const pnrs = pnrRes || [];

  const template = (trip.payment_template && typeof trip.payment_template === 'object') ? trip.payment_template : {};
  // Jadwal cicilan dari editor web → default due date & nominal (Finance tetap menang via template).
  const _sched = Array.isArray(trip.web_payment_schedule) ? trip.web_payment_schedule : [];
  const scheduleDue = {}; const scheduleAmount = {};
  for (const r of _sched) { if (r && r.type) { if (r.due) scheduleDue[r.type] = r.due; if (Number(r.amount) > 0) scheduleAmount[r.type] = Number(r.amount); } }
  if (trip.dp_amount && !scheduleAmount.DP) scheduleAmount.DP = Number(trip.dp_amount);
  // EXPECTED per peserta: price_paid kalau sudah diisi, kalau 0 fallback proyeksi harga kamar (SINKRON list)
  const paxExpected = (p) => {
    const fixed = Number(p.price_paid) || 0;
    return fixed > 0 ? fixed : expectedPerPassenger(p, breakdown, paymentsByPassenger[p.id] || []);
  };
  const totalExpected = passengers.reduce((s, p) => s + paxExpected(p), 0);
  const totalPaid = Object.values(paymentsByPassenger).flat().reduce((s, p) => s + (p.amount || 0), 0);
  const progress = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;
  const templateTotal = Object.values(template).reduce((s, v) => s + (+v || 0), 0);

  const fmtMoney = (v) => `Rp ${Number(v || 0).toLocaleString('id-ID')}`;

  const invoiceRows = passengersWithCustomers.map((p) => {
    const pays = paymentsByPassenger[p.id] || [];
    const totalBayar = pays.reduce((s, x) => s + (x.amount || 0), 0);
    const expP = paxExpected(p);
    const sisa = expP - totalBayar;
    return {
      nama: p.customers?.name || `Pax #${p.id}`,
      phone: p.customers?.phone || '-',
      email: p.customers?.email || '-',
      room_type: p.room_type || '-',
      harga: expP,
      total_bayar: totalBayar,
      sisa: sisa,
      status: sisa <= 0 ? 'LUNAS' : totalBayar > 0 ? 'CICILAN' : 'BELUM BAYAR',
      jumlah_cicilan: pays.length,
    };
  });

  const pnrRows = pnrs.map((p) => ({
    pnr: p.pnr || '-',
    vendor: p.vendor || '-',
    route: p.route || '-',
    deposit_total: p.deposit_total || 0,
    payoff_amount: p.payoff_amount || 0,
    total_paid: (p.deposit_total || 0) + (p.payoff_amount || 0),
    deposit_due: p.deposit_due || '-',
    payoff_due: p.payoff_due || '-',
    status: p.status || '-',
  }));

  const totalPnrDeposit = pnrRows.reduce((s, p) => s + p.total_paid, 0);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ||
                 (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : '');

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/finance/payments" className="text-sm text-brand-600 font-medium hover:underline">← Payment Checklist</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
          <p className="mt-1 text-slate-600">Set template payment group → checklist tiap peserta.</p>
          {(transferredCount > 0 || refundedCount > 0) && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs text-amber-800">
              <span>ⓘ</span>
              {transferredCount > 0 && <span><b>{transferredCount}</b> peserta pindah trip (di-hide)</span>}
              {transferredCount > 0 && refundedCount > 0 && <span>·</span>}
              {refundedCount > 0 && <span><b>{refundedCount}</b> peserta refunded (di-hide)</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 items-end">
          <DownloadButtons
            filename={`invoice-peserta-${trip.kode_trip || trip.id}`}
            title={`Invoice Peserta — ${trip.kode_trip || ''} ${trip.name}`}
            subtitle={`${passengers.length} pax aktif · Progress ${progress}%`}
            extraInfo={[
              { label: 'Total Tagihan', value: fmtMoney(totalExpected) },
              { label: 'Total Dibayar', value: fmtMoney(totalPaid) },
              { label: 'Total Sisa', value: fmtMoney(totalExpected - totalPaid) },
            ]}
            columns={[
              { key: 'nama', label: 'Nama Peserta' },
              { key: 'phone', label: 'No HP' },
              { key: 'email', label: 'Email' },
              { key: 'room_type', label: 'Tipe Kamar' },
              { key: 'harga', label: 'Total Tagihan', align: 'right', format: 'rupiah' },
              { key: 'total_bayar', label: 'Sudah Bayar', align: 'right', format: 'rupiah' },
              { key: 'sisa', label: 'Sisa', align: 'right', format: 'rupiah' },
              { key: 'jumlah_cicilan', label: 'Cicilan', align: 'right' },
              { key: 'status', label: 'Status' },
            ]}
            rows={invoiceRows}
            summary={[
              { label: 'TOTAL TAGIHAN', value: fmtMoney(totalExpected) },
              { label: 'TOTAL DIBAYAR', value: fmtMoney(totalPaid) },
              { label: 'TOTAL SISA', value: fmtMoney(totalExpected - totalPaid) },
            ]}
            buttonSize="md"
          />
          <p className="text-[10px] text-slate-500">📋 Invoice Peserta</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Peserta Aktif" value={passengers.length} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Template / Pax" value={fmtRupiah(templateTotal)} color="text-purple-700" bg="bg-purple-50" small />
        <StatCard label="Total Paid" value={fmtRupiah(totalPaid)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Progress Total" value={`${progress}%`} color="text-blue-700" bg="bg-blue-50" />
      </div>

      <PaymentTemplateForm tripId={tripId} template={template} schedule={Array.isArray(trip.web_payment_schedule) ? trip.web_payment_schedule : []} />

      <PaymentMatrix
        tripId={tripId}
        passengers={passengersWithCustomers}
        paymentsByPassenger={paymentsByPassenger}
        template={template}
        scheduleDue={scheduleDue}
        scheduleAmount={scheduleAmount}
        breakdown={breakdown}
        invoicesByPassenger={invoicesByPassenger}
        familyGroups={familyGroups}
      />

      {/* R212: pass familyGroups ke DeliverySection juga */}
      <DeliverySection
        tripId={tripId}
        passengers={passengersWithCustomers}
        appUrl={appUrl}
        trip={trip}
        ongkirInvoicesByPassenger={ongkirInvoicesByPassenger}
        familyGroups={familyGroups}
      />

      {pnrs.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-purple-200 shadow-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-purple-50 border-purple-200 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="font-bold text-purple-800 flex items-center gap-2">
                <span>✈</span> PNR Deposit & Payoff
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">{pnrs.length} PNR · Total deposit dibayar: {fmtRupiah(totalPnrDeposit)}</p>
            </div>
            <DownloadButtons
              filename={`pnr-deposit-${trip.kode_trip || trip.id}`}
              title={`PNR Deposit — ${trip.name}`}
              subtitle={`${pnrs.length} PNR · Total: ${fmtMoney(totalPnrDeposit)}`}
              columns={[
                { key: 'pnr', label: 'PNR / Booking Ref' },
                { key: 'vendor', label: 'Vendor / Airline' },
                { key: 'route', label: 'Route' },
                { key: 'deposit_total', label: 'Deposit', align: 'right', format: 'rupiah' },
                { key: 'payoff_amount', label: 'Payoff', align: 'right', format: 'rupiah' },
                { key: 'total_paid', label: 'Total Paid', align: 'right', format: 'rupiah' },
                { key: 'deposit_due', label: 'Due Deposit' },
                { key: 'payoff_due', label: 'Due Payoff' },
                { key: 'status', label: 'Status' },
              ]}
              rows={pnrRows}
              summary={[{ label: 'TOTAL PNR PAID', value: fmtMoney(totalPnrDeposit) }]}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">PNR</th>
                  <th className="px-3 py-2 text-left">Vendor</th>
                  <th className="px-3 py-2 text-left">Route</th>
                  <th className="px-3 py-2 text-right">Deposit</th>
                  <th className="px-3 py-2 text-right">Payoff</th>
                  <th className="px-3 py-2 text-right">Total Paid</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pnrs.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-bold text-purple-700">{p.pnr || `#${p.id}`}</td>
                    <td className="px-3 py-2 text-xs">{p.vendor || '-'}</td>
                    <td className="px-3 py-2 text-xs">{p.route || '-'}</td>
                    <td className="px-3 py-2 text-right text-xs">{fmtRupiah(p.deposit_total || 0)}</td>
                    <td className="px-3 py-2 text-right text-xs">{fmtRupiah(p.payoff_amount || 0)}</td>
                    <td className="px-3 py-2 text-right font-bold text-amber-700">{fmtRupiah((p.deposit_total || 0) + (p.payoff_amount || 0))}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">{p.status || '-'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
