// Cron: cek status device Fonnte per departemen/brand. Kalau TERPUTUS -> tandai (banner in-app).
// Kalau balik CONNECT -> hapus tanda + kirim ulang pesan tertunda departemen itu.
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnvFor } from '@/lib/brand-shared';
import { sendFonnte } from '@/lib/utils/fonnte';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function serviceKeyFor(code) {
  if (code === 'khasanah') return process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}
function clientFor(code) {
  const { url } = supabaseEnvFor(code);
  const key = serviceKeyFor(code);
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
function tokenFor(base, code) {
  const suffix = code === 'khasanah' ? '_KHASANAH' : '';
  return process.env[base + suffix] || (code === 'khasanah' ? process.env[base] : null) || null;
}

const DEPTS = [
  { ctx: 'finance', env: 'FONNTE_TOKEN_FINANCE' },
  { ctx: 'cs', env: 'FONNTE_TOKEN_CS' },
  { ctx: 'visa', env: 'FONNTE_TOKEN_VISA' },
  { ctx: 'ops', env: 'FONNTE_TOKEN_OPS' },
];

// Cek status device via Fonnte. Return true=connect, false=disconnect, null=tak yakin.
async function deviceConnected(token) {
  try {
    const res = await fetch('https://api.fonnte.com/device', {
      method: 'POST', headers: { Authorization: token },
    });
    const d = await res.json().catch(() => ({}));
    // Fonnte kadang beda field. Ambil sinyal yg jelas saja; kalau ragu -> null (jangan alarm palsu).
    const st = String(d.device_status || d.status || d.connected || '').toLowerCase();
    if (st === 'disconnect' || st === 'disconnected' || d.connected === false) return false;
    if (st === 'connect' || st === 'connected' || d.connected === true) return true;
    return null;
  } catch { return null; }
}

export async function GET(request) {
  const auth = request.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const out = [];
  for (const code of ['teone', 'khasanah']) {
    const db = clientFor(code);
    if (!db) continue;
    for (const dep of DEPTS) {
      const token = tokenFor(dep.env, code);
      if (!token) continue;
      const connected = await deviceConnected(token);
      if (connected === false) {
        // idempoten: hapus marker lama utk brand+ctx, sisakan tepat 1 (cegah menumpuk)
        await db.from('wa_outbox').delete()
          .eq('brand', code).eq('context', dep.ctx).eq('kind', 'device_offline').eq('status', 'failed');
        await db.from('wa_outbox').insert({
          brand: code, context: dep.ctx, kind: 'device_offline', status: 'failed',
          reason: 'Device Fonnte terputus (hasil cek otomatis)',
          message: `⚠ Nomor ${dep.ctx.toUpperCase()} terputus dari Fonnte. Login ulang perangkat di dashboard Fonnte agar pesan pembayaran/notifikasi terkirim lagi.`,
        });
        out.push({ brand: code, ctx: dep.ctx, status: 'offline' });
      } else if (connected === true) {
        // hapus tanda terputus + kirim ulang pesan tertunda departemen ini
        const { data: markers } = await db.from('wa_outbox')
          .select('id').eq('brand', code).eq('context', dep.ctx).eq('kind', 'device_offline').eq('status', 'failed');
        if (markers && markers.length) {
          await db.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', markers.map((m) => m.id));
          // auto kirim ulang pesan nyata yg tertunda utk dept ini (max 100)
          const { data: pend } = await db.from('wa_outbox')
            .select('*').eq('brand', code).eq('context', dep.ctx).eq('status', 'failed').is('kind', null).limit(100);
          let sent = 0;
          for (const row of (pend || [])) {
            const r = await sendFonnte(row.target_phone, row.message, { context: row.context, brand: code });
            if (r?.ok) { await db.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id); sent++; }
          }
          out.push({ brand: code, ctx: dep.ctx, status: 'reconnected', resent: sent });
        }
      }
    }

    // === PIC devices: sebelumnya TIDAK dipantau, jadi device PIC putus tak ketahuan
    //     (pesan diam-diam jatuh ke nomor Finance). Sekarang ikut dicek per PIC. ===
    try {
      const { data: pics } = await db.from('employees')
        .select('id, full_name, email, fonnte_token').eq('role', 'pic');
      for (const p of (pics || [])) {
        const tok = (p.fonnte_token || '').trim();
        if (!tok) continue;
        const ctxKey = `pic:${p.email || p.id}`;
        const connected = await deviceConnected(tok);
        if (connected === false) {
          await db.from('wa_outbox').delete()
            .eq('brand', code).eq('context', ctxKey).eq('kind', 'device_offline').eq('status', 'failed');
          await db.from('wa_outbox').insert({
            brand: code, context: ctxKey, kind: 'device_offline', status: 'failed',
            reason: 'Device Fonnte PIC terputus (hasil cek otomatis)',
            message: `⚠ Nomor PIC ${p.full_name || p.email} terputus dari Fonnte. Konfirmasi pembayaran trip-nya akan terkirim dari nomor Finance sampai perangkat login ulang.`,
          });
          out.push({ brand: code, ctx: ctxKey, pic: p.full_name || p.email, status: 'offline' });
        } else if (connected === true) {
          const { data: markers } = await db.from('wa_outbox')
            .select('id').eq('brand', code).eq('context', ctxKey).eq('kind', 'device_offline').eq('status', 'failed');
          if (markers && markers.length) {
            await db.from('wa_outbox').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', markers.map((m) => m.id));
            out.push({ brand: code, ctx: ctxKey, pic: p.full_name || p.email, status: 'reconnected' });
          }
        }
      }
    } catch (e) { out.push({ brand: code, pic_check_error: e?.message || 'unknown' }); }
  }
  return NextResponse.json({ ok: true, checked: out });
}
