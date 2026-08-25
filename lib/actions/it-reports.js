'use server';

// IT Reports — lapor bug/error/request fitur.
// - submitItReport: BOLEH untuk SIAPA SAJA yang login (staf, tour_leader, mitra).
// - listItReports / updateItReport: hanya owner & manager (tab IT).
// Disimpan per-brand (DB brand aktif), sinkron dgn arsitektur multi-DB.
// Path: lib/actions/it-reports.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { getRoleFromUser } from '@/lib/utils/roles';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const VALID_TYPES = new Set(['bug', 'error', 'feature']);
const VALID_STATUS = new Set(['open', 'in_progress', 'done', 'wontfix']);

// Kirim laporan — semua user yang login boleh (termasuk TL & mitra).
export async function submitItReport({ type, message, pagePath } = {}) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Harus login dulu' };

  const t = String(type || '').trim().toLowerCase();
  if (!VALID_TYPES.has(t)) return { error: 'Jenis laporan tidak valid' };
  const msg = String(message || '').trim();
  if (!msg) return { error: 'Isi laporan tidak boleh kosong' };
  if (msg.length > 5000) return { error: 'Laporan terlalu panjang (maks 5000 karakter)' };

  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };

  // Role & nama (best-effort, jangan sampai gagal kirim kalau lookup error).
  let role = null;
  try { role = await resolveAuthoritativeRole(user, getRoleFromUser(user)); } catch {}
  const name = user.user_metadata?.name || user.user_metadata?.full_name || null;
  let brand = 'teone';
  try { brand = currentBrandCode(); } catch {}

  const { error } = await db.from('it_reports').insert({
    type: t,
    message: msg,
    page_path: String(pagePath || '').slice(0, 300) || null,
    user_email: (user.email || '').toLowerCase() || null,
    user_role: role || 'unknown',
    user_name: name,
    brand,
    status: 'open',
  });
  if (error) return { error: error.message };
  return { ok: true };
}

async function guardAdmin() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  let role = null;
  try { role = await resolveAuthoritativeRole(user, getRoleFromUser(user)); } catch {}
  if (!['owner', 'manager'].includes(role)) return { error: 'Akses ditolak: hanya Owner & Manager.' };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db, role };
}

export async function listItReports() {
  const g = await guardAdmin(); if (g.error) return { error: g.error };
  const { db } = g;
  const { data, error } = await db.from('it_reports').select('*').order('created_at', { ascending: false }).limit(500);
  if (error) return { error: error.message };
  return { ok: true, reports: data || [] };
}

export async function updateItReport(id, { status, admin_note } = {}) {
  const g = await guardAdmin(); if (g.error) return { error: g.error };
  const { db, user } = g;
  const rid = parseInt(id); if (!rid) return { error: 'ID tidak valid' };
  const upd = {};
  if (status !== undefined) {
    const s = String(status || '').trim();
    if (!VALID_STATUS.has(s)) return { error: 'Status tidak valid' };
    upd.status = s;
    upd.handled_by = user.email || null;
    upd.handled_at = new Date().toISOString();
  }
  if (admin_note !== undefined) upd.admin_note = String(admin_note || '').slice(0, 2000) || null;
  if (Object.keys(upd).length === 0) return { error: 'Tidak ada perubahan' };
  const { error } = await db.from('it_reports').update(upd).eq('id', rid);
  if (error) return { error: error.message };
  revalidatePath('/it');
  return { ok: true };
}
