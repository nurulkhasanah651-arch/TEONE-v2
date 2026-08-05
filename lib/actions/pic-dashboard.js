'use server';

// Dashboard PIC — monitor pribadi tiap PIC (discope HANYA ke trip yang di-assign ke dia).
// Isi: Tiket, Payment (deadline H-7 / hari ini / overdue), Visa, Persiapan Tour + To-Do harian.
// Path: lib/actions/pic-dashboard.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { PREP_KEYS } from '@/lib/utils/departure-prep';
import { buildMonitor } from '@/lib/monitor/build-monitor';
import { getPaymentDeadlineAlerts } from '@/lib/actions/payment-reminders';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Nama karyawan (untuk cocokkan trips.pic teks) + tampilan. email dari auth user.
async function scopeOf(db, user) {
  const email = String(user.email || '').toLowerCase();
  let display = user.email || 'PIC';
  let name = '';
  try {
    let emp = (await db.from('employees').select('full_name, nickname').eq('user_id', user.id).maybeSingle()).data;
    if (!emp && email) emp = (await db.from('employees').select('full_name, nickname').ilike('email', email).maybeSingle()).data;
    const canon = (emp?.nickname && emp.nickname.trim()) || (emp?.full_name && emp.full_name.trim()) || '';
    if (canon) { display = canon; name = canon.toLowerCase(); }
  } catch {}
  return { email, name, display };
}

export async function getPicDashboard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/pic-dashboard'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };

  const { email, name, display } = await scopeOf(db, user);
  // Trip yang di-assign ke PIC ini: cocok pic_email (otoritatif) ATAU teks pic = nama karyawan.
  const tripFilter = (t) =>
    (t.pic_email && String(t.pic_email).toLowerCase() === email) ||
    (t.pic && name && String(t.pic).toLowerCase() === name);

  const m = await buildMonitor(db, { tripFilter });

  // Payment — pakai engine reminder yang sama, discope ke trip PIC ini.
  let payment = { soonToday: [], soonWeek: [], overdueByTrip: [], today: null };
  try {
    const pay = await getPaymentDeadlineAlerts({ soonDays: 7, tripIds: m.tripIds });
    if (pay && !pay.error) {
      const soon = pay.soonGroups || [];
      const soonToday = soon.filter((s) => Number(s.days) === 0);
      const soonWeek = soon.filter((s) => Number(s.days) > 0);
      // Kelompokkan peserta lewat deadline per group.
      const byTrip = {};
      for (const p of (pay.overduePax || [])) {
        const k = p.tripId;
        (byTrip[k] = byTrip[k] || { tripId: k, trip: p.trip, pic: p.pic, people: [] }).people.push({
          name: p.name, milestone: p.milestone, amount: p.amount, due_date: p.due_date, days: p.days, hasPhone: p.hasPhone,
        });
      }
      const overdueByTrip = Object.values(byTrip).sort((a, b) => (b.people[0]?.days || 0) - (a.people[0]?.days || 0));
      payment = { soonToday, soonWeek, overdueByTrip, today: pay.today };
    }
  } catch {}

  return { ok: true, name: display, monitor: m, payment };
}

// Toggle checklist persiapan keberangkatan — hanya untuk trip milik PIC ini.
export async function setDeparturePrepPic(tripId, key, done) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/pic-dashboard'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const tid = String(tripId || '').trim(); if (!tid) return { error: 'Trip tidak valid' };
  if (!PREP_KEYS.includes(key)) return { error: 'Item tidak valid' };

  // Pastikan trip ini benar-benar milik PIC yang login (kecuali manajemen).
  const { email, name } = await scopeOf(db, user);
  const role = g.role;
  const isMgmt = ['owner', 'manager', 'accounting', 'ops'].includes(role);
  const { data: t } = await db.from('trips').select('pic, pic_email').eq('id', tid).maybeSingle();
  if (!t) return { error: 'Trip tidak ditemukan' };
  const owns = (t.pic_email && String(t.pic_email).toLowerCase() === email) || (t.pic && name && String(t.pic).toLowerCase() === name);
  if (!isMgmt && !owns) return { error: 'Trip ini bukan milik Anda.' };

  const { data: row } = await db.from('group_departure_prep').select('checklist').eq('trip_id', tid).maybeSingle();
  const checklist = { ...(row?.checklist || {}) };
  if (done) checklist[key] = true; else delete checklist[key];
  const { error } = await db.from('group_departure_prep')
    .upsert({ trip_id: tid, checklist, updated_at: new Date().toISOString(), updated_by: user?.id || null }, { onConflict: 'trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/pic-dashboard'); revalidatePath('/manager-dashboard');
  return { ok: true };
}
