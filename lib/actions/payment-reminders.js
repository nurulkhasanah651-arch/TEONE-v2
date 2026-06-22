'use server';

// Reminder pembayaran (panel Finance): daftar invoice belum lunas yang mendekati / lewat deadline,
// + kirim WA reminder ke peserta (Finance yang trigger, bukan auto). Additive — tak ubah alur lama.
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
function daysBetween(a, b) { // b - a dalam hari (string YYYY-MM-DD)
  const da = new Date(a + 'T00:00:00'); const db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}

export async function getPaymentDeadlineAlerts({ soonDays = 7 } = {}) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error };

  const db = svc() || auth;
  const { data } = await db.from('invoices')
    .select('id, invoice_no, milestone, amount, due_date, status, public_token, customer_name, customer_phone, trip_kode, trip_name, last_reminder_at, reminder_count')
    .not('due_date', 'is', null)
    .not('status', 'in', '("paid","cancelled","rejected")')
    .order('due_date', { ascending: true })
    .limit(500);

  const today = todayStr();
  const overdue = []; const soon = [];
  for (const inv of (data || [])) {
    const due = String(inv.due_date).slice(0, 10);
    const diff = daysBetween(today, due); // <0 = lewat, 0..n = mendekati
    const row = {
      id: inv.id, invoice_no: inv.invoice_no, milestone: inv.milestone || 'Tagihan',
      amount: Number(inv.amount) || 0, due_date: due,
      name: inv.customer_name || '—', phone: inv.customer_phone || '',
      trip: [inv.trip_kode, inv.trip_name].filter(Boolean).join(' — ') || '-',
      token: inv.public_token, days: Math.abs(diff),
      reminder_count: inv.reminder_count || 0, last_reminder_at: inv.last_reminder_at || null,
      hasPhone: !!inv.customer_phone,
    };
    if (diff < 0) overdue.push(row);
    else if (diff <= soonDays) soon.push(row);
  }
  overdue.sort((a, b) => b.days - a.days); // paling telat di atas
  return { ok: true, overdue, soon, today };
}

export async function sendPaymentReminder(invoiceId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error };

  // Kirim WA invoice (berisi tagihan + link bayar) sebagai reminder
  const r = await sendInvoiceWA(invoiceId);
  if (r?.error) return { error: r.error };

  // Catat reminder
  try {
    const db = svc() || auth;
    const { data: cur } = await db.from('invoices').select('reminder_count').eq('id', invoiceId).maybeSingle();
    await db.from('invoices').update({
      reminder_count: (Number(cur?.reminder_count) || 0) + 1,
      last_reminder_at: new Date().toISOString(),
    }).eq('id', invoiceId);
  } catch { /* best-effort */ }

  revalidatePath('/finance');
  return { ok: true };
}
