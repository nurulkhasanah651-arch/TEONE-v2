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
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fmtRupiah } from '@/lib/utils/format';
import DPApprovalPanel from '@/components/accounting/DPApprovalPanel';
import InvoicePaymentApprovalPanel from '@/components/invoices/InvoicePaymentApprovalPanel';
import TripInvoicesBrowser from '@/components/invoices/TripInvoicesBrowser';
import InvoiceDriveSyncPicker from '@/components/invoices/InvoiceDriveSyncPicker';

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
    supabase.from('trips').select('id, kode_trip, name, departure, status, payment_drive_parent_folder_id, payment_drive_trip_folder_id, payment_drive_trip_folder_url, payment_drive_last_sync_at'),
    supabase.from('trip_passengers').select('id, trip_id, customer_id, family_group_id, is_family_head'),
    supabase.from('customers').select('id, name, phone'),
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

  const allInvoices = invoicesRes.data || [];
  const trips = tripsRes.data || [];
  const allPassengers = passengersRes.data || [];
  const customers = customersRes.data || [];
  const pendingPayments = pendingPaymentsRes.data || [];
  const dpRequests = dpRequestsRes.data || [];
  const familyGroups = familyGroupsRes.data || [];

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
    const paxMap = Object.fromEntries(allPassengers.map((p) => [p.id, p]));
    onlinePays = (opRes || []).map((p) => {
      const pax = paxMap[p.passenger_id];
      const cust = pax ? custMapForPax[pax.customer_id] : null;
      const trip = pax ? tripMap[pax.trip_id] : null;
      const lbl = String(p.label || '');
      const method = lbl.includes('·') ? lbl.split('·')[1].trim() : 'online';
      return { id: p.id, name: cust?.name || ('#' + p.passenger_id), type: p.type, amount: p.amount, method, trip: trip ? (trip.kode_trip || trip.name || '') : '' };
    });
  } catch {}

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
        <Link href="/finance/payments" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
          → Payment Checklist (Generate Invoice)
        </Link>
      </div>

      {/* GRAND STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Invoice" value={grand.totalInvoices} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Total Tagihan" value={fmtRupiah(grand.totalAmount)} color="text-amber-700" bg="bg-amber-50" small />
        <StatCard label="Sudah Dibayar" value={fmtRupiah(grand.paidAmount)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Sisa Tagihan" value={fmtRupiah(sisa)} color="text-red-700" bg="bg-red-50" small />
      </div>

      {/* NOTIF PEMBAYARAN ONLINE TERBARU */}
      {onlinePays.length > 0 && (
        <div className="bg-white border border-emerald-200 rounded-xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-bold text-emerald-800">🔔 Pembayaran Online Terbaru</h2>
            <span className="text-[11px] text-emerald-600">{onlinePays.length} terbaru · otomatis via Midtrans</span>
          </div>
          <ul className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {onlinePays.map((o) => (
              <li key={o.id} className="px-4 py-2 text-sm flex items-center justify-between gap-3 flex-wrap">
                <span className="text-slate-700">
                  <b>{o.name}</b> sudah bayar <b>{o.type}</b>{o.trip ? ` · ${o.trip}` : ''} <span className="text-slate-400">— via {o.method}</span>
                </span>
                <span className="text-emerald-700 font-bold whitespace-nowrap">{fmtRupiah(o.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
