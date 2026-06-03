// Round 194 + R200i + R201: Invoices page
// - DP Approval Panel (CS Daily submit DP)
// - Invoice Payment Approval Panel (peserta upload bukti via link)  ← R201 NEW
// - Trip Invoices Browser (compact list per trip)

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fmtRupiah } from '@/lib/utils/format';
import DPApprovalPanel from '@/components/accounting/DPApprovalPanel';
import InvoicePaymentApprovalPanel from '@/components/invoices/InvoicePaymentApprovalPanel';
import TripInvoicesBrowser from '@/components/invoices/TripInvoicesBrowser';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
    supabase.from('trips').select('id, kode_trip, name, departure, status'),
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
