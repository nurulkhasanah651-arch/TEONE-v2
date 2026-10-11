'use server';

// Checklist Operasional per Group (per trip). Toggle 1 item → merge ke kolom
// trips.ops_checklist (jsonb). Path: lib/actions/ops-checklist.js
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { OPS_CHECKLIST_KEYS } from '@/lib/utils/ops-checklist-items';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function toggleOpsChecklistItem(tripId, itemKey, done) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/operasional');
  if (g.error) return { error: g.error };

  if (!tripId) return { error: 'Trip tidak valid' };
  if (!OPS_CHECKLIST_KEYS.includes(itemKey)) return { error: 'Item checklist tidak dikenal' };

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  // Read-merge-write: ambil checklist terkini, ubah 1 item, simpan balik.
  const { data: row, error: readErr } = await db
    .from('trips')
    .select('ops_checklist')
    .eq('id', tripId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!row) return { error: 'Trip tidak ditemukan' };

  const checklist = (row.ops_checklist && typeof row.ops_checklist === 'object') ? { ...row.ops_checklist } : {};
  const by = user.email || user.user_metadata?.name || user.id;
  if (done) {
    checklist[itemKey] = { done: true, at: new Date().toISOString(), by };
  } else {
    checklist[itemKey] = { done: false, at: new Date().toISOString(), by };
  }

  const { error: updErr } = await db.from('trips').update({ ops_checklist: checklist }).eq('id', tripId);
  if (updErr) return { error: updErr.message };

  revalidatePath('/operasional/checklist');
  return { ok: true, checklist };
}
