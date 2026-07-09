'use server';

// Reminder pembayaran (panel Finance):
//  - LEWAT DEADLINE: invoice peserta belum lunas yg sudah lewat due date → kirim WA reminder + bisa ganti due date.
//  - H-7 (untuk Finance): dari JADWAL trip (web_payment_schedule), milestone yg jatuh tempo ≤7 hari →
//    peringatan internal "Group {kode} {termin} {n} hari lagi — kirim invoice ke peserta" (link ke Payment Checklist).
import { createClient } from '@/lib/supabase/server';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { assertStaff } from '@/lib/auth/require-staff';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { sendInvoiceWA } from '@/lib/actions/invoices';
import { revalidatePath } from 'next/cache';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function todayStr() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00'); const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}
function msLabel(t) {
  if (t === 'Pelunasan') return 'Pelunasan';
  const m = String(t).match(/^P(\d+)$/); if (m) return 'Payment ' + m[1];
  return t;
}

export async function getPaymentDeadlineAlerts({ soonDays = 7, picFilter = '' } = {}) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error };

  const db = svc() || auth;
  const today = todayStr();
  const role = await resolveAuthoritativeRole(user);

  // Peta trip → PIC. Role 'pic' hanya melihat trip miliknya sendiri.
  const { data: allTrips } = await db.from('trips')
    .select('id, kode_trip, name, departure, web_payment_schedule, dp_amount, pic, pic_email')
    .limit(1000);
  const tripMap = Object.fromEntries((allTrips || []).map((t) => [t.id, t]));

  let ownTripIds = null;
  if (role === 'pic') {
    const email = String(user.email || '').toLowerCase();
    let name = '';
    try {
      const { data: emp } = await db.from('employees').select('full_name').ilike('email', email).maybeSingle();
      name = String(emp?.full_name || '').toLowerCase();
    } catch {}
    ownTripIds = new Set((allTrips || []).filter((t) =>
      String(t.pic_email || '').toLowerCase() === email ||
      (name && String(t.pic || '').toLowerCase() === name)
    ).map((t) => t.id));
  }
  const picOf = (tripId) => tripMap[tripId]?.pic || '';
  const allowed = (tripId) => {
    if (ownTripIds && !ownTripIds.has(tripId)) return false;
    if (picFilter && picOf(tripId) !== picFilter) return false;
    return true;
  };

  // ---- LEWAT DEADLINE (A): invoice peserta belum lunas, due < today ----
  const { data: inv } = await db.from('invoices')
    .select('id, invoice_no, milestone, amount, due_date, status, public_token, customer_name, customer_phone, trip_id, trip_kode, trip_name, last_reminder_at, reminder_count')
    .not('due_date', 'is', null)
    .not('status', 'in', '("paid","cancelled","rejected")')
    .order('due_date', { ascending: true })
    .limit(500);
  const overdue = [];
  for (const i of (inv || [])) {
    const due = String(i.due_date).slice(0, 10);
    const diff = daysBetween(today, due);
    if (diff >= 0) continue; // hanya yg sudah lewat
    if (!allowed(i.trip_id)) continue;
    overdue.push({
      id: i.id, milestone: i.milestone || 'Tagihan', amount: Number(i.amount) || 0, due_date: due,
      name: i.customer_name || '—', hasPhone: !!i.customer_phone,
      trip: [i.trip_kode, i.trip_name].filter(Boolean).join(' — ') || '-',
      pic: picOf(i.trip_id), tripId: i.trip_id,
      days: Math.abs(diff), reminder_count: i.reminder_count || 0,
    });
  }
  overdue.sort((a, b) => b.days - a.days);

  // ---- H-7 (Finance): dari jadwal trip ----
  const scheduled = (allTrips || []).filter((t) => Array.isArray(t.web_payment_schedule) && t.web_payment_schedule.length);
  const soonGroups = [];
  const lateMilestones = []; // milestone yg due-nya sudah lewat → cek peserta yg belum bayar
  for (const t of scheduled) {
    if (!allowed(t.id)) continue;
    if (t.departure && String(t.departure).slice(0, 10) < today) continue; // skip trip yg sudah berangkat
    for (const r of t.web_payment_schedule) {
      if (!r || !r.due || !r.type) continue;
      const due = String(r.due).slice(0, 10);
      const diff = daysBetween(today, due);
      if (diff < 0) { lateMilestones.push({ trip: t, type: r.type, due, amount: Number(r.amount) || 0, late: Math.abs(diff) }); continue; }
      if (diff > soonDays) continue;
      soonGroups.push({
        tripId: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '-',
        pic: t.pic || '',
        milestone: msLabel(r.type), amount: Number(r.amount) || 0,
        due, days: diff,
      });
    }
  }
  soonGroups.sort((a, b) => a.days - b.days);

  // ---- LEWAT DEADLINE (B): peserta yang belum bayar milestone yg jatuh temponya lewat ----
  // Sumbernya jadwal trip, jadi tetap jalan walau invoice-nya belum pernah dibuat.
  const overduePax = [];
  const lateTripIds = [...new Set(lateMilestones.map((m) => m.trip.id))];
  if (lateTripIds.length) {
    const { data: pax } = await db.from('trip_passengers')
      .select('id, trip_id, customer_id, status, refund_status, transfer_status')
      .in('trip_id', lateTripIds).limit(2000);
    const active = (pax || []).filter((p) => p.status !== 'cancelled' && p.transfer_status !== 'transferred' && p.refund_status !== 'refunded');
    const paxIds = active.map((p) => p.id);
    const custIds = [...new Set(active.map((p) => p.customer_id).filter(Boolean))];
    const [{ data: pays }, { data: custs }] = await Promise.all([
      paxIds.length ? db.from('participant_payments').select('passenger_id, type').in('passenger_id', paxIds).limit(10000) : Promise.resolve({ data: [] }),
      custIds.length ? db.from('customers').select('id, name, phone, whatsapp').in('id', custIds).limit(3000) : Promise.resolve({ data: [] }),
    ]);
    const paidByPax = {};
    for (const p of (pays || [])) (paidByPax[p.passenger_id] ||= new Set()).add(String(p.type));
    const custMap = Object.fromEntries((custs || []).map((c) => [c.id, c]));
    const paxByTrip = {};
    for (const p of active) (paxByTrip[p.trip_id] ||= []).push(p);

    for (const m of lateMilestones) {
      for (const p of (paxByTrip[m.trip.id] || [])) {
        if (paidByPax[p.id]?.has(m.type)) continue;
        const c = custMap[p.customer_id] || {};
        overduePax.push({
          key: `${p.id}-${m.type}`,
          passengerId: p.id, tripId: m.trip.id,
          name: c.name || `#${p.id}`, hasPhone: !!(c.whatsapp || c.phone),
          trip: [m.trip.kode_trip, m.trip.name].filter(Boolean).join(' — ') || '-',
          pic: m.trip.pic || '',
          milestone: msLabel(m.type), amount: m.amount, due_date: m.due, days: m.late,
        });
      }
    }
    overduePax.sort((a, b) => b.days - a.days);
  }

  // Daftar PIC untuk dropdown — dari trip yang boleh dilihat user, BUKAN dari hasil
  // yang sudah tersaring picFilter (kalau tidak, dropdown-nya menyusut jadi 1 nama).
  const pics = [...new Set((allTrips || [])
    .filter((t) => !ownTripIds || ownTripIds.has(t.id))
    .map((t) => t.pic)
    .filter(Boolean))].sort();

  return { ok: true, overdue, overduePax: overduePax.slice(0, 200), soonGroups, pics, role, scoped: !!ownTripIds, today };
}

export async function sendPaymentReminder(invoiceId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error };

  const r = await sendInvoiceWA(invoiceId, { queueManual: true, queueKind: 'manual_pending_reminder' });
  if (r?.error) return { error: r.error };
  // PIC kirim manual -> pesan diantrekan, JANGAN dihitung sbg reminder terkirim.
  if (r?.wa_manual) return { ok: true, wa_manual: true, wa_message: r.wa_message, wa_phone: r.wa_phone, customer_name: r.customer_name };
  try {
    const db = svc() || auth;
    const { data: cur } = await db.from('invoices').select('reminder_count').eq('id', invoiceId).maybeSingle();
    await db.from('invoices').update({
      reminder_count: (Number(cur?.reminder_count) || 0) + 1,
      last_reminder_at: new Date().toISOString(),
    }).eq('id', invoiceId);
  } catch {}
  revalidatePath('/finance');
  return { ok: true };
}

// Ganti / perpanjang due date invoice (mis. saat reminder lewat deadline)
export async function updateInvoiceDueDate(invoiceId, due) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error };
  if (!due) return { error: 'Tanggal kosong' };

  const db = svc() || auth;
  const { error } = await db.from('invoices').update({ due_date: due }).eq('id', invoiceId);
  if (error) return { error: error.message };
  revalidatePath('/finance');
  return { ok: true };
}
