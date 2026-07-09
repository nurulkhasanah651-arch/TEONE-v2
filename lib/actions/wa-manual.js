'use server';

// Antrean pesan WA yang TIDAK dikirim otomatis (PIC Khasanah kirim manual).
// Diisi oleh alur otomatis: pembayaran online & reminder.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}

export async function getManualWaQueue() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/wa-manual'); if (g.error) return { error: g.error };

  const db = svc() || auth;
  const { data, error } = await db.from('wa_outbox')
    .select('id, target_phone, message, kind, status, reason, created_at, sent_at')
    .like('kind', 'manual_pending%')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return { error: error.message };

  const rows = data || [];
  return {
    ok: true,
    pending: rows.filter((r) => r.status === 'pending'),
    done: rows.filter((r) => r.status !== 'pending').slice(0, 50),
    brand: (() => { try { return currentBrandCode(); } catch { return ''; } })(),
  };
}

export async function markManualWaSent(id) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/wa-manual'); if (g.error) return { error: g.error };

  const db = svc() || auth;
  const { error } = await db.from('wa_outbox')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id).like('kind', 'manual_pending%');
  if (error) return { error: error.message };
  revalidatePath('/wa-manual');
  return { ok: true };
}
