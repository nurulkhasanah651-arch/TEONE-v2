// Adapter WhatsApp Business API resmi (Api.co.id) — TERPISAH TOTAL dari Fonnte.
//
// Aktif HANYA kalau env di-set. Kalau kosong, semua fungsi jadi no-op dan sistem
// jalan seperti biasa (Fonnte / antre manual). Saat ini khusus brand Khasanah,
// untuk PIC yang nomornya sudah tersambung ke WABA (mis. Anis).
//
// Rahasia (API key) HANYA dari environment variable, JANGAN pernah ditulis di kode.

import { currentBrandCode } from '@/lib/supabase/service-env';

function brandSuffix() {
  try { return currentBrandCode() === 'khasanah' ? '_KHASANAH' : ''; } catch { return ''; }
}

/**
 * Baca konfigurasi WABA dari env. Balikan null kalau belum diaktifkan.
 *  WABA_API_KEY_KHASANAH  (rahasia — set di Vercel, bukan di kode)
 *  WABA_PIC_KHASANAH      nama PIC pemilik nomor ini (mis. "Anis")
 *  WABA_TEMPLATE_LANG_KHASANAH  kode bahasa template (default "id")
 *  WABA_ENDPOINT_KHASANAH endpoint kirim (default endpoint publik Api.co.id)
 */
export function wabaConfig() {
  const sfx = brandSuffix();
  if (!sfx) return null; // sementara khusus Khasanah
  const key = process.env['WABA_API_KEY' + sfx];
  if (!key) return null;
  return {
    key,
    pic: String(process.env['WABA_PIC' + sfx] || '').trim(),
    lang: process.env['WABA_TEMPLATE_LANG' + sfx] || 'id',
    endpoint: process.env['WABA_ENDPOINT' + sfx] || 'https://chat.api.co.id/api/v1/public/messages/send',
  };
}

export function isWabaEnabled() {
  const c = wabaConfig();
  return !!(c && c.key);
}

export function normalizeWaPhone(p) {
  let s = String(p || '').replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s && !s.startsWith('62')) s = '62' + s;
  return s;
}

/**
 * Kirim pesan TEXT via WABA. Dipakai untuk konfirmasi pembayaran (dalam 24 jam
 * window). Balikan { ok, id?, error? }. Aman — tidak melempar error.
 */
export async function sendWabaText(cfg, phone, content) {
  if (!cfg || !cfg.key) return { ok: false, error: 'WABA tidak dikonfigurasi' };
  const to = normalizeWaPhone(phone);
  if (!to) return { ok: false, error: 'Nomor tujuan kosong' };
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + cfg.key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: to,
        channel: 'whatsapp',
        message_type: 'text',
        content: String(content || ''),
      }),
    });
    const txt = await res.text();
    let json = {};
    try { json = JSON.parse(txt); } catch {}
    if (!res.ok || json?.success === false) {
      return { ok: false, error: `WABA ${res.status}: ${txt.slice(0, 300)}` };
    }
    return { ok: true, id: json?.data?.message_id || null };
  } catch (e) {
    return { ok: false, error: 'WABA fetch: ' + (e?.message || e) };
  }
}
