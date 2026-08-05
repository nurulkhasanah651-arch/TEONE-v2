'use server';

// Manager Dashboard "Morning Monitoring" — hanya owner / manager / accounting.
// Agregasi read-only lintas: ticketing, visa, operation, selling. + toggle ticket_issued.
// Path: lib/actions/manager-dashboard.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { PREP_KEYS } from '@/lib/utils/departure-prep';
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
  const g = await assertStaff(user, '/manager-dashboard'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}

export async function getManagerDashboard() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const todayWIB = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

  // ── Follow-up harian → sembunyikan item HANYA untuk hari ini (WIB).
  // Besok muncul lagi kalau tim belum update di divisinya masing2. ──
  const fset = new Set();
  try {
    const startOfTodayWIB = new Date(`${todayWIB}T00:00:00+07:00`).toISOString();
    const { data: fups } = await db.from('manager_followups').select('section, trip_id, created_at').gte('created_at', startOfTodayWIB);
    for (const r of (fups || [])) fset.add(`${r.section}:${r.trip_id}`);
  } catch {}
  const keep = (section, arr) => (arr || []).filter((t) => !fset.has(`${section}:${t.id}`));

  // Compute lintas semua trip (dipakai bersama dgn Dashboard PIC).
  const m = await buildMonitor(db, { tripFilter: null });
  const T = m.ticketing, V = m.visa, O = m.operation, S = m.selling;

  return {
    ok: true,
    generatedAt: m.generatedAt,
    followupMode: 'daily',
    ticketing: {
      fullNoTicket: keep('ticketing.fullNoTicket', T.fullNoTicket),
      notIssued: keep('ticketing.notIssued', T.notIssued),
    },
    visa: {
      groupH60: keep('visa.groupH60', V.groupH60),
      notProcessed: keep('visa.notProcessed', V.notProcessed),
      paidUnscheduled: keep('visa.paidUnscheduled', V.paidUnscheduled),
      fullH5: keep('visa.fullH5', V.fullH5),
    },
    operation: {
      newRelease: keep('operation.newRelease', O.newRelease),
      fullNoOffering: keep('operation.fullNoOffering', O.fullNoOffering),
      estimateNotUpdated: keep('operation.estimateNotUpdated', O.estimateNotUpdated),
    },
    selling: {
      slowSelling: keep('selling.slowSelling', S.slowSelling),
      almostFull: keep('selling.almostFull', S.almostFull),
    },
    preparation: m.preparation,
  };
}

const VALID_SECTIONS = new Set([
  'ticketing.fullNoTicket', 'ticketing.notIssued',
  'visa.groupH60', 'visa.notProcessed', 'visa.paidUnscheduled', 'visa.fullH5',
  'operation.newRelease', 'operation.fullNoOffering', 'operation.estimateNotUpdated',
  'selling.slowSelling', 'selling.almostFull',
]);

// Tandai "sudah follow up" → item hilang HARI INI; muncul lagi besok kalau belum dikerjakan tim.
export async function markFollowup(section, tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!VALID_SECTIONS.has(section)) return { error: 'Section tidak valid' };
  const tid = String(tripId || '').trim(); if (!tid) return { error: 'Trip tidak valid' };
  const { error } = await db.from('manager_followups')
    .upsert({ section, trip_id: tid, created_at: new Date().toISOString(), created_by: user?.id || null }, { onConflict: 'section,trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

// Batal follow-up (mis. kepencet) → item muncul lagi.
export async function clearFollowup(section, tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const tid = String(tripId || '').trim(); if (!section || !tid) return { error: 'Data tidak valid' };
  const { error } = await db.from('manager_followups').delete().eq('section', section).eq('trip_id', tid);
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

// Centang / batal item checklist kesiapan keberangkatan group (H-20).
export async function setDeparturePrep(tripId, key, done) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  const tid = String(tripId || '').trim(); if (!tid) return { error: 'Trip tidak valid' };
  if (!PREP_KEYS.includes(key)) return { error: 'Item tidak valid' };
  const { data: row } = await db.from('group_departure_prep').select('checklist').eq('trip_id', tid).maybeSingle();
  const checklist = { ...(row?.checklist || {}) };
  if (done) checklist[key] = true; else delete checklist[key];
  const { error } = await db.from('group_departure_prep')
    .upsert({ trip_id: tid, checklist, updated_at: new Date().toISOString(), updated_by: user?.id || null }, { onConflict: 'trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

// Tandai / batalkan peserta sudah issued tiket.
export async function toggleTicketIssued(passengerId, issued) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  const pid = parseInt(passengerId); if (!pid) return { error: 'Peserta tidak valid' };
  const upd = issued ? { ticket_issued: true, ticket_issued_at: new Date().toISOString() } : { ticket_issued: false, ticket_issued_at: null };
  const { error } = await db.from('trip_passengers').update(upd).eq('id', pid);
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}
