// R215y² — Invoices page + InvoiceDriveSyncPicker (collapsed by default)
// Path: app/(app)/invoices/page.jsx
// FULL REPLACE — semua existing PRESERVED, tambahan minimal:
//   1. import InvoiceDriveSyncPicker
//   2. select payment_drive_* columns dari trips
//   3. <InvoiceDriveSyncPicker trips={tripsWithDrive} /> setelah approval panels
//
// ALUR EXISTING (DP Approval, Payment Approval, Trip Browser) UTUH 100%.
// Drive picker = COLLAPSED by default — gak ganggu workflow normal.

import Link from 'next/link';
import OnlinePayFeed from '@/components/invoices/OnlinePayFeed';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fmtRupiah } from '@/lib/utils/format';
import DPApprovalPanel from '@/components/accounting/DPApprovalPanel';
import InvoicePaymentApprovalPanel from '@/components/invoices/InvoicePaymentApprovalPanel';
import TripInvoicesBrowser from '@/components/invoices/TripInvoicesBrowser';
import InvoiceDriveSyncPicker from '@/components/invoices/InvoiceDriveSyncPicker';
import ManualInvoiceButton from '@/components/invoices/ManualInvoiceButton';
import SignedFileLink from '@/components/common/SignedFileLink';
import ManualTransferActions from '@/components/finance/ManualTransferActions';
import { getManualTransfers } from '@/lib/shop/data';
import { getPicScope, filterTripsForPic } from '@/lib/auth/pic-scope';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function InvoicesPage() {
  const supabase = createClient();
  const serviceClient = getServiceClient() || supabase;

  const [
    invoicesRes, tripsRes, passengersRes, customersRes,
    pendingPaymentsRes, dpRequestsRes, familyGroupsRes
  ] = await Promise.all([
    supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(500),
    // R215y² — tambahin payment_drive_* columns ke select trips
    supabase.from('trips').select('id, kode_trip, name, departure, status, pic, pic_email, payment_drive_parent_folder_id, payment_drive_trip_folder_id, payment_drive_trip_folder_url, payment_drive_last_sync_at'),
    supabase.from('trip_passengers').select('id, trip_id, customer_id, family_group_id, is_family_head').limit(10000),
    supabase.from('customers').select('id, name, phone').limit(10000),
    serviceClient
      .from('invoice_payments')
      .select('*, invoices(id, invoice_no, milestone, trip_id, customer_name, trip_kode, amount)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100),
    serviceClient
      .from('dp_payment_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
    serviceClient
      .from('family_groups')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  let allInvoices = invoicesRes.data || [];
  let trips = tripsRes.data || [];
  const allPassengers = passengersRes.data || [];
  const customers = customersRes.data || [];
  let pendingPayments = pendingPaymentsRes.data || [];
  let dpRequests = dpRequestsRes.data || [];
  const familyGroups = familyGroupsRes.data || [];

  // Transfer Bank Manual dari etalase web yang menunggu verifikasi finance
  let pendingManual = [];
  try {
    const mt = await getManualTransfers({ limit: 150 });
    pendingManual = mt.filter((b) => b.manual_status === 'pending' && b.status !== 'paid');
  } catch {}

  const custMapForPax = Object.fromEntries(customers.map((c) => [c.id, c]));
  const passengersWithCustomer = allPassengers.map((p) => ({
    ...p,
    customers: custMapForPax[p.customer_id] || null,
  }));

  // Notif pembayaran ONLINE terbaru (Midtrans → participant_payments label 'Online ...')
  let onlinePays = [];
  try {
    const { data: opRes } = await serviceClient
      .from('participant_payments')
      .select('id, passenger_id, type, amount, label, paid_at, created_at')
      .or('label.ilike.Online%,label.ilike.Midtrans%')
      .order('created_at', { ascending: false })
      .limit(15);
    const tripMap = Object.fromEntries(trips.map((t) => [t.id, t]));
    // Resolusi nama tahan batas 1000 baris: ambil peserta & customer yg direferensikan langsung by id
    const opPaxIds = [...new Set((opRes || []).map((p) => p.passenger_id).filter(Boolean))];
    let opPaxMap = {}, opCustMap = {};
    if (opPaxIds.length) {
      const { data: opPax } = await serviceClient.from('trip_passengers').select('id, trip_id, customer_id').in('id', opPaxIds);
      opPaxMap = Object.fromEntries((opPax || []).map((p) => [p.id, p]));
      const opCustIds = [...new Set((opPax || []).map((p) => p.customer_id).filter(Boolean))];
      if (opCustIds.length) {
        const { data: opCust } = await serviceClient.from('customers').select('id, name').in('id', opCustIds);
        opCustMap = Object.fromEntries((opCust || []).map((c) => [c.id, c]));
      }
    }
    onlinePays = (opRes || []).map((p) => {
      const pax = opPaxMap[p.passenger_id];
      const cust = pax ? opCustMap[pax.customer_id] : null;
      const trip = pax ? tripMap[pax.trip_id] : null;
      const lbl = String(p.label || '');
      const method = lbl.includes('·') ? lbl.split('·')[1].trim() : 'online';
      return { id: p.id, name: cust?.name || ('#' + p.passenger_id), type: p.type, amount: p.amount, method, tripId: pax ? pax.trip_id : null, trip: trip ? (trip.kode_trip || trip.name || '') : '' };
    });
  } catch {}

  // KHASANAH: PIC hanya lihat data trip miliknya (teone tak terpengaruh — brand-gated di helper)
  {
    const { data: { user } } = await supabase.auth.getUser();
    const scope = await getPicScope(supabase, user);
    if (scope.scoped) {
      trips = filterTripsForPic(trips, scope);
      const ok = new Set(trips.map((t) => t.id));
      allInvoices = allInvoices.filter((i) => i.trip_id && ok.has(i.trip_id));
      pendingPayments = pendingPayments.filter((pp) => pp.invoices && ok.has(pp.invoices.trip_id));
      dpRequests = dpRequests.filter((d) => d.trip_id && ok.has(d.trip_id));
      pendingManual = pendingManual.filter((b) => b.trip_id && ok.has(b.trip_id));
      onlinePays = onlinePays.filter((o) => o.tripId && ok.has(o.tripId));
    }
  }

  const pendingDPCount = dpRequests.filter((r) => r.status === 'pending').length;
  const pendingPaymentCount = pendingPayments.length;

  // Group invoices by trip
  const byTrip = {};
  for (const t of trips) {
    const peserta = allPassengers.filter((p) => p.trip_id === t.id);
    byTrip[t.id] = {
      trip: t,
      pesertaCount: peserta.length,
      invoices: [],
      stats: { total: 0, paid: 0, sent: 0, draft: 0, totalAmount: 0, paidAmount: 0 },
    };
  }
  byTrip['_no_trip'] = {
    trip: { id: '_no_trip', kode_trip: '—', name: 'Tanpa Trip', status: '—' },
    pesertaCount: 0,
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
      return (b.trip.departure || '').localeCompare(a.trip.departure || '');
    });

  const grand = {
    totalInvoices: allInvoices.length,
    paidInvoices: allInvoices.filter((i) => i.status === 'paid').length,
    totalAmount: allInvoices.reduce((s, i) => s + Number(i.amount || 0), 0),
    paidAmount: allInvoices.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0),
  };
  const sisa = grand.totalAmount - grand.paidAmount;

  // R215y² — trips list buat Drive picker (cuma yg punya invoice, biar relevant)
  const tripsForDrivePicker = trips.filter((t) => allInvoices.some((inv) => inv.trip_id === t.id));

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">Invoices</h1>
          <p className="mt-1 text-slate-600">Klik trip buat liat detail invoice peserta · Filter per bulan keberangkatan</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ManualInvoiceButton />
          <Link href="/finance/payments" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
            → Payment Checklist (Generate Invoice)
          </Link>
        </div>
      </div>

      {/* GRAND STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Invoice" value={grand.totalInvoices} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Total Tagihan" value={fmtRupiah(grand.totalAmount)} color="text-amber-700" bg="bg-amber-50" small />
        <StatCard label="Sudah Dibayar" value={fmtRupiah(grand.paidAmount)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Sisa Tagihan" value={fmtRupiah(sisa)} color="text-red-700" bg="bg-red-50" small />
      </div>

      {/* NOTIF PEMBAYARAN ONLINE TERBARU (bisa di-close) */}
      <OnlinePayFeed items={onlinePays} />

      {/* BANNER ALERTS */}
      {pendingDPCount > 0 && (
        <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
          <p className="text-sm font-bold text-blue-900">
            💵 {pendingDPCount} DP Payment dari CS menunggu approve — section di bawah
          </p>
        </div>
      )}

      {pendingPaymentCount > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded">
          <p className="text-sm font-bold text-amber-900">
            💳 {pendingPaymentCount} Pembayaran Peserta menunggu approve (dari link bukti transfer)
          </p>
        </div>
      )}

      {/* TRANSFER BANK MANUAL WEB — menunggu verifikasi finance */}
      {pendingManual.length > 0 && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded">
          <p className="text-sm font-bold text-emerald-900">
            🏦 {pendingManual.length} Transfer Bank Manual (web) menunggu verifikasi — section di bawah
          </p>
        </div>
      )}
      {pendingManual.length > 0 && (
        <ManualTransferApprovalPanel items={pendingManual} />
      )}

      {/* PAYMENT APPROVAL PANEL — R201 NEW */}
      {pendingPaymentCount > 0 && (
        <InvoicePaymentApprovalPanel payments={pendingPayments} />
      )}

      {/* DP APPROVAL PANEL */}
      {pendingDPCount > 0 && (
        <DPApprovalPanel
          requests={dpRequests}
          passengers={passengersWithCustomer}
          familyGroups={familyGroups}
        />
      )}

      {/* R215y² — DRIVE SYNC PICKER (collapsed by default — gak ganggu workflow) */}
      <InvoiceDriveSyncPicker trips={tripsForDrivePicker} />

      {/* TRIP LIST */}
      <TripInvoicesBrowser groups={groups} />
    </div>
  );
}

function StatCard({ label, value, color, bg, small = false }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 font-bold ${color} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
      <div className={`mt-2 h-1 w-8 rounded-full ${bg}`} />
    </div>
  );
}

function ManualTransferApprovalPanel({ items = [] }) {
  const rp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  return (
    <div className="bg-white border border-emerald-200 rounded-xl shadow-card p-4">
      <h2 className="text-lg font-bold text-emerald-700 mb-1">🏦 Transfer Bank Manual (Web) — Menunggu Verifikasi</h2>
      <p className="text-xs text-slate-500 mb-3">Approve = peserta otomatis masuk Master Trip + checklist payment finance.</p>
      <div className="space-y-3">
        {items.map((b) => (
          <div key={b.id} className="border border-emerald-200 rounded-lg p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{b.lead_name} <span className="text-xs font-normal text-slate-500">· {b.lead_phone}</span></p>
                <p className="text-sm text-slate-600">{b.trip?.name || '-'} {b.trip?.kode_trip ? `(${b.trip.kode_trip})` : ''}</p>
                <p className="text-xs text-slate-500 mt-0.5">Order #{b.order_code} · {b.payment_type === 'full' ? 'Lunas' : 'DP'}</p>
                {b.manual_note && <p className="text-xs italic text-slate-700 mt-1">"{b.manual_note}"</p>}
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold text-slate-900">{rp(b.amount)}</p>
                {b.payment_proof_url && (
                  <SignedFileLink url={b.payment_proof_url} className="inline-block mt-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded cursor-pointer">📎 Lihat Bukti</SignedFileLink>
                )}
              </div>
            </div>
            <ManualTransferActions bookingId={b.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
