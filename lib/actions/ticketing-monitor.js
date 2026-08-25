'use server';

// Ticketing Monitor — dipakai di sidebar Operasional > Ticketing.
// Menyajikan ULANG blok MONITOR TICKETING dari Dashboard Manager (buildMonitor),
// tapi gate akses = '/operasional/ticketing' supaya PIC & OPS juga boleh (bukan
// hanya owner/manager/accounting spt manager-dashboard). Follow-up harian pakai
// tabel `manager_followups` yang SAMA → status sinkron dgn Dashboard Manager.
// ADITIF: tidak mengubah manager-dashboard.js maupun build-monitor.js.
// Path: lib/actions/ticketing-monitor.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { buildMonitor } from '@/lib/monitor/build-monitor';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/operasional/ticketing'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}

// Ambil data monitor ticketing (lintas semua trip) + sembunyikan item yg SUDAH
// di-follow-up HARI INI (WIB). Besok muncul lagi kalau tim belum update.
export async function getTicketingMonitor() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const todayWIB = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  const fset = new Set();
  try {
    const startOfTodayWIB = new Date(`${todayWIB}T00:00:00+07:00`).toISOString();
    const { data: fups } = await db.from('manager_followups').select('section, trip_id, created_at').gte('created_at', startOfTodayWIB);
    for (const r of (fups || [])) fset.add(`${r.section}:${r.trip_id}`);
  } catch {}
  const keep = (section, arr) => (arr || []).filter((t) => !fset.has(`${section}:${t.id}`));

  const m = await buildMonitor(db, { tripFilter: null });
  const T = m.ticketing || {};

  return {
    ok: true,
    generatedAt: m.generatedAt,
    ticketing: {
      fullNoTicket: keep('ticketing.fullNoTicket', T.fullNoTicket),
      readyToBuyTicket: keep('ticketing.readyToBuy', T.readyToBuyTicket),
      notIssued: keep('ticketing.notIssued', T.notIssued),
    },
  };
}

const VALID_TICKETING_SECTIONS = new Set([
  'ticketing.fullNoTicket', 'ticketing.readyToBuy', 'ticketing.notIssued',
]);

// Tandai "sudah follow up" untuk item ticketing → hilang HARI INI; muncul lagi besok.
// Pakai tabel manager_followups yang sama → sinkron dgn Dashboard Manager.
export async function markTicketingFollowup(section, tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!VALID_TICKETING_SECTIONS.has(section)) return { error: 'Section tidak valid' };
  const tid = String(tripId || '').trim(); if (!tid) return { error: 'Trip tidak valid' };
  const { error } = await db.from('manager_followups')
    .upsert({ section, trip_id: tid, created_at: new Date().toISOString(), created_by: user?.id || null }, { onConflict: 'section,trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/operasional/ticketing');
  revalidatePath('/manager-dashboard');
  return { ok: true };
}
