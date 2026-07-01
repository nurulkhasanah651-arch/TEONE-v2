'use server';

// Antrean pesan WA gagal kirim (nomor Fonnte logout dll) — lihat & kirim ulang.
import { createClient } from '@/lib/supabase/server';
import { brandSupabaseUrl, brandServiceRoleKey } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte } from '@/lib/utils/fonnte';
import { revalidatePath } from 'next/cache';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Ringkasan untuk banner (jumlah pesan tertunda + departemen)
export async function waOutboxSummary() {
  try {
    const authClient = createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return { count: 0, depts: [] };
    const db = svc() || authClient;
    const { data } = await db.from('wa_outbox').select('context').eq('status', 'failed');
    const rows = data || [];
    const depts = [...new Set(rows.map((r) => (r.context || 'finance')))];
    return { count: rows.length, depts };
  } catch { return { count: 0, depts: [] }; }
}

export async function getPendingWA(limit = 200) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;
  const { data, error } = await db.from('wa_outbox')
    .select('*').eq('status', 'failed').order('created_at', { ascending: false }).limit(limit);
  if (error) return { error: error.message };
  return { ok: true, rows: data || [] };
}

async function _resendRow(db, row) {
  const r = await sendFonnte(row.target_phone, row.message, { context: row.context || 'finance', brand: row.brand });
  if (r?.ok) {
    await db.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id);
    return { ok: true };
  }
  // update alasan terbaru
  await db.from('wa_outbox').update({ reason: (r?.error || 'gagal').slice(0, 500) }).eq('id', row.id);
  return { error: r?.error || 'gagal' };
}

export async function resendWA(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;
  const { data: row } = await db.from('wa_outbox').select('*').eq('id', id).maybeSingle();
  if (!row) return { error: 'Pesan tidak ditemukan' };
  const res = await _resendRow(db, row);
  revalidatePath('/wa-pending');
  return res;
}

export async function resendAllWA() {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;
  const { data: rows } = await db.from('wa_outbox').select('*').eq('status', 'failed').order('created_at', { ascending: true }).limit(500);
  let sent = 0, failed = 0;
  for (const row of (rows || [])) {
    const r = await _resendRow(db, row);
    if (r?.ok) sent++; else failed++;
  }
  revalidatePath('/wa-pending');
  return { ok: true, sent, failed };
}

// Tandai selesai tanpa kirim (mis. nomor peserta memang salah)
export async function dismissWA(id) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;
  await db.from('wa_outbox').update({ status: 'dismissed', sent_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/wa-pending');
  return { ok: true };
}
