'use server';

// Checklist Operasional per Group (per trip). Update 1 item → merge ke kolom
// trips.ops_checklist (jsonb). Item bisa punya: done (centang), note (keterangan bebas),
// dan utk Pre-book: offering / goahead / prebook (vendor mana aja).
// Path: lib/actions/ops-checklist.js
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { OPS_CHECKLIST_KEYS, OPS_CHECKLIST_TEXT_FIELDS } from '@/lib/utils/ops-checklist-items';

const TEXT_MAX = 1000;

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Merge patch (done + field teks yg di-whitelist) ke 1 item checklist.
async function mergeItem(tripId, itemKey, patch) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/operasional');
  if (g.error) return { error: g.error };

  if (!tripId) return { error: 'Trip tidak valid' };
  if (!OPS_CHECKLIST_KEYS.includes(itemKey)) return { error: 'Item checklist tidak dikenal' };

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  const { data: row, error: readErr } = await db
    .from('trips')
    .select('ops_checklist')
    .eq('id', tripId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!row) return { error: 'Trip tidak ditemukan' };

  const checklist = (row.ops_checklist && typeof row.ops_checklist === 'object') ? { ...row.ops_checklist } : {};
  const by = user.email || user.user_metadata?.name || user.id;
  const cur = (checklist[itemKey] && typeof checklist[itemKey] === 'object') ? { ...checklist[itemKey] } : {};

  if (typeof patch?.done === 'boolean') cur.done = patch.done;
  for (const f of OPS_CHECKLIST_TEXT_FIELDS) {
    if (typeof patch?.[f] === 'string') cur[f] = patch[f].trim().slice(0, TEXT_MAX);
  }
  cur.at = new Date().toISOString();
  cur.by = by;
  checklist[itemKey] = cur;

  const { error: updErr } = await db.from('trips').update({ ops_checklist: checklist }).eq('id', tripId);
  if (updErr) return { error: updErr.message };

  revalidatePath('/operasional/checklist');
  return { ok: true, checklist };
}

// Centang / batal centang 1 item.
export async function toggleOpsChecklistItem(tripId, itemKey, done) {
  return mergeItem(tripId, itemKey, { done: !!done });
}

// Simpan field teks (note / offering / goahead / prebook) 1 item.
export async function updateOpsChecklistItem(tripId, itemKey, patch) {
  return mergeItem(tripId, itemKey, patch || {});
}
