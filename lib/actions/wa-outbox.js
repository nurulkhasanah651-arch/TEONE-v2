'use server';

// Antrean pesan WA gagal kirim (nomor Fonnte logout dll) — lihat & kirim ulang.
import { createClient } from '@/lib/supabase/server';
import { brandSupabaseUrl, brandServiceRoleKey } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte, getFonnteToken } from '@/lib/utils/fonnte';
import { getBrandCode } from '@/lib/brand';
import { revalidatePath } from 'next/cache';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Cek status device Fonnte utk 1 context (live). true=connect, false=disconnect, null=ragu.
async function deviceConnectedFor(ctx) {
  try {
    const { token } = getFonnteToken(ctx, getBrandCode());
    if (!token) return null;
    const res = await fetch('https://api.fonnte.com/device', { method: 'POST', headers: { Authorization: token } });
    const d = await res.json().catch(() => ({}));
    const st = String(d.device_status || d.status || d.connected || '').toLowerCase();
    if (st === 'disconnect' || st === 'disconnected' || d.connected === false) return false;
    if (st === 'connect' || st === 'connected' || d.connected === true) return true;
    return null;
  } catch { return null; }
}

// Ringkasan untuk banner. Pisahkan:
//  - count      = PESAN nyata yang belum terkirim (kind != device_offline)
//  - offlineDepts = departemen yang device-nya (menurut cek terakhir) terputus
// Saat ada marker offline, kita re-check LIVE: kalau sudah tersambung -> marker dibersihkan
// otomatis (tanpa nunggu cron), jadi banner "terputus" langsung hilang begitu nomor connect.
export async function waOutboxSummary() {
  try {
    const authClient = createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return { count: 0, offlineDepts: [] };
    const db = svc() || authClient;
    const { data } = await db.from('wa_outbox').select('id, context, kind').eq('status', 'failed');
    const rows = data || [];
    const markerRows = rows.filter((r) => r.kind === 'device_offline');
    const msgRows = rows.filter((r) => r.kind !== 'device_offline');

    const offlineDepts = [];
    const ctxs = [...new Set(markerRows.map((r) => r.context || 'ops'))];
    for (const ctx of ctxs) {
      const connected = await deviceConnectedFor(ctx);
      const ids = markerRows.filter((r) => (r.context || 'ops') === ctx).map((r) => r.id);
      if (connected === true) {
        // sudah tersambung -> bersihkan semua marker dept ini
        if (ids.length) await db.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', ids);
      } else {
        offlineDepts.push(ctx); // false / null (ragu) -> tetap tampilkan "kemungkinan terputus"
      }
    }
    const msgDepts = [...new Set(msgRows.map((r) => r.context || 'finance'))];
    return { count: msgRows.length, msgDepts, offlineDepts };
  } catch { return { count: 0, offlineDepts: [] }; }
}

// Manual: tandai device dept sudah tersambung -> bersihkan marker offline (kalau live-check ragu)
export async function clearOfflineMarkers(context) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || authClient;
  let q = db.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('kind', 'device_offline').eq('status', 'failed');
  if (context) q = q.eq('context', context);
  const { error } = await q;
  if (error) return { error: error.message };
  revalidatePath('/wa-pending');
  return { ok: true };
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
