'use server';

// Reminder pembayaran (panel Finance):
//  - LEWAT DEADLINE: invoice peserta belum lunas yg sudah lewat due date → kirim WA reminder + bisa ganti due date.
//  - H-7 (untuk Finance): dari JADWAL trip (web_payment_schedule), milestone yg jatuh tempo ≤7 hari →
//    peringatan internal "Group {kode} {termin} {n} hari lagi — kirim invoice ke peserta" (link ke Payment Checklist).
import { createClient } from '@/lib/supabase/server';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { assertStaff } from '@/lib/auth/require-staff';
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

export async function getPaymentDeadlineAlerts({ soonDays = 7 } = {}) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error };

  const db = svc() || auth;
  const today = todayStr();

  // ---- LEWAT DEADLINE: invoice peserta belum lunas, due < today ----
  const { data: inv } = await db.from('invoices')
    .select('id, invoice_no, milestone, amount, due_date, status, public_token, customer_name, customer_phone, trip_kode, trip_name, last_reminder_at, reminder_count')
    .not('due_date', 'is', null)
    .not('status', 'in', '("paid","cancelled","rejected")')
    .order('due_date', { ascending: true })
    .limit(500);
  const overdue = [];
  for (const i of (inv || [])) {
    const due = String(i.due_date).slice(0, 10);
    const diff = daysBetween(today, due);
    if (diff >= 0) continue; // hanya yg sudah lewat
    overdue.push({
      id: i.id, milestone: i.milestone || 'Tagihan', amount: Number(i.amount) || 0, due_date: due,
      name: i.customer_name || '—', hasPhone: !!i.customer_phone,
      trip: [i.trip_kode, i.trip_name].filter(Boolean).join(' — ') || '-',
      days: Math.abs(diff), reminder_count: i.reminder_count || 0,
    });
  }
  overdue.sort((a, b) => b.days - a.days);

  // ---- H-7 (Finance): dari jadwal trip ----
  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, departure, web_payment_schedule, dp_amount')
    .not('web_payment_schedule', 'is', null)
    .limit(500);
  const soonGroups = [];
  for (const t of (trips || [])) {
    if (t.departure && String(t.departure).slice(0, 10) < today) continue; // skip trip yg sudah lewat berangkat
    const sched = Array.isArray(t.web_payment_schedule) ? t.web_payment_schedule : [];
    for (const r of sched) {
      if (!r || !r.due) continue;
      const due = String(r.due).slice(0, 10);
      const diff = daysBetween(today, due);
      if (diff < 0 || diff > soonDays) continue;
      soonGroups.push({
        tripId: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '-',
        milestone: msLabel(r.type), amount: Number(r.amount) || 0,
        due, days: diff,
      });
    }
  }
  soonGroups.sort((a, b) => a.days - b.days);

  return { ok: true, overdue, soonGroups, today };
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
