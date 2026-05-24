// Payment Checklist per trip — Round 100h: fetch family_groups VIA SERVICE ROLE

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fmtRupiah } from '@/lib/utils/format';
import PaymentTemplateForm from '@/components/finance/PaymentTemplateForm';
import PaymentMatrix from '@/components/finance/PaymentMatrix';
import { expectedPerPassenger } from '@/lib/utils/price-breakdown';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function TripPaymentsPage({ params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) notFound();

  const { data: tp } = await supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true });
  const passengers = tp || [];
  const passengerIds = passengers.map((p) => p.id);
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);

  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('id, name, phone, email').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }
  const passengersWithCustomers = passengers.map((p) => ({ ...p, customers: customerMap[p.customer_id] || null }));

  let paymentsByPassenger = {};
  if (passengerIds.length > 0) {
    const { data: pays } = await supabase.from('participant_payments').select('*').in('passenger_id', passengerIds);
    for (const p of (pays || [])) {
      if (!paymentsByPassenger[p.passenger_id]) paymentsByPassenger[p.passenger_id] = [];
      paymentsByPassenger[p.passenger_id].push(p);
    }
  }

  let invoicesByPassenger = {};
  try {
    const { data: invs } = await supabase
      .from('invoices')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    for (const inv of (invs || [])) {
      if (!inv.passenger_id) continue;
      if (!invoicesByPassenger[inv.passenger_id]) invoicesByPassenger[inv.passenger_id] = [];
      invoicesByPassenger[inv.passenger_id].push(inv);
    }
  } catch {}

  // Round 100h: family groups via SERVICE ROLE (bypass RLS)
  let familyGroups = [];
  try {
    const serviceClient = getServiceClient();
    const client = serviceClient || supabase;
    const { data: fg, error: fgError } = await client
      .from('family_groups')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });
    if (fgError) {
      console.error('[family_groups fetch error]', fgError.message);
    }
    familyGroups = Array.isArray(fg) ? fg : [];
  } catch (e) {
    console.error('[family_groups fetch exception]', e?.message);
    familyGroups = [];
  }

  const template = (trip.payment_template && typeof trip.payment_template === 'object') ? trip.payment_template : {};
  const breakdown = (trip.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {};

  const totalExpected = passengers.reduce(
    (s, p) => s + expectedPerPassenger(p, breakdown, paymentsByPassenger[p.id] || []),
    0
  );
  const totalPaid = Object.values(paymentsByPassenger).flat().reduce((s, p) => s + (p.amount || 0), 0);
  const progress = totalExpected > 0 ? Math.round((totalPaid / totalExpected) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <Link href="/finance/payments" className="text-sm text-brand-600 font-medium hover:underline">← Payment Checklist</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode_trip || `#${trip.id}`} — {trip.name}</h1>
        <p className="mt-1 text-slate-600">
          WAJIB: room + tips + city tax · OPTIONAL: visa/asuransi/customs (cuma masuk expected setelah ✓)
        </p>
        <p className="mt-1 text-xs text-pink-700 bg-pink-50 inline-block px-3 py-1 rounded">
          💡 Tip: Klik nama peserta untuk expand → ada section <b>📄 Invoices</b> untuk generate + kirim ke WA peserta
        </p>
        {familyGroups.length > 0 && (
          <p className="mt-1 text-xs text-indigo-800 bg-indigo-50 inline-block px-3 py-1 rounded">
            👨‍👩‍👧 {familyGroups.length} family group aktif — kepala bisa generate 1 invoice family cover semua anggota
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Peserta" value={passengers.length} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Expected Total" value={fmtRupiah(totalExpected)} color="text-blue-700" bg="bg-blue-50" small />
        <StatCard label="Total Paid" value={fmtRupiah(totalPaid)} color="text-green-700" bg="bg-green-50" small />
        <StatCard label="Progress" value={`${progress}%`} color="text-purple-700" bg="bg-purple-50" />
      </div>

      <PaymentTemplateForm tripId={tripId} template={template} />

      <PaymentMatrix
        tripId={tripId}
        passengers={passengersWithCustomers}
        paymentsByPassenger={paymentsByPassenger}
        template={template}
        breakdown={breakdown}
        invoicesByPassenger={invoicesByPassenger}
        familyGroups={familyGroups}
      />
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
