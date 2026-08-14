'use server';

// Dashboard Tim Visa (Lukita & Lukas) — follow-up harian utk MONITOR VISA.
// Reuse tabel `manager_followups` supaya SINKRON dgn Dashboard Manager:
// klik "✓ Follow up" di sini juga menyembunyikan item yg sama di Dashboard Manager (hari ini).
// Beda dgn manager-dashboard.js: guard-nya '/visa' (boleh diakses tim visa/PIC), bukan '/manager-dashboard'.
// Path: lib/actions/visa-dashboard.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/visa'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}

// Hanya section VISA yang boleh di-follow-up dari dashboard ini.
const VALID_SECTIONS = new Set([
  'visa.groupH60', 'visa.notProcessed', 'visa.paidUnscheduled', 'visa.fullH5',
]);

// Tandai "sudah follow up" → item hilang HARI INI (WIB); muncul lagi besok kalau belum dikerjakan.
export async function markVisaFollowup(section, tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db, user } = g;
  if (!VALID_SECTIONS.has(section)) return { error: 'Section tidak valid' };
  const tid = String(tripId || '').trim(); if (!tid) return { error: 'Trip tidak valid' };
  const { error } = await db.from('manager_followups')
    .upsert({ section, trip_id: tid, created_at: new Date().toISOString(), created_by: user?.id || null }, { onConflict: 'section,trip_id' });
  if (error) return { error: error.message };
  revalidatePath('/visa/dashboard');
  revalidatePath('/manager-dashboard');
  return { ok: true };
}
