// Adapter WhatsApp Business API resmi (Api.co.id) — TERPISAH TOTAL dari Fonnte.
//
// KHUSUS BRAND KHASANAH. TEONE tidak tersentuh (wabaConfig balikan null utk TEONE).
//
// Key WABA disimpan PER-PIC di employees.waba_api_key (seperti fonnte_token).
// Jadi tiap PIC yang punya nomor WABA sendiri tinggal isi key-nya di data karyawan —
// tanpa ganti kode. Kalau PIC tidak punya key → jatuh ke perilaku manual/Fonnte.
//
// Rahasia (API key) tidak pernah ditulis di kode.

import { currentBrandCode } from '@/lib/supabase/service-env';

function isKhasanah() {
  try { return currentBrandCode() === 'khasanah'; } catch { return false; }
}

/** Konfigurasi umum (endpoint + bahasa). Balikan null kalau bukan Khasanah. */
export function wabaConfig() {
  if (!isKhasanah()) return null;
  return {
    lang: process.env.WABA_TEMPLATE_LANG_KHASANAH || 'id',
    endpoint: process.env.WABA_ENDPOINT_KHASANAH || 'https://chat.api.co.id/api/v1/public/messages/send',
  };
}

export function normalizeWaPhone(p) {
  let s = String(p || '').replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s && !s.startsWith('62')) s = '62' + s;
  return s;
}

/**
 * Kirim pesan TEXT via WABA pakai API key milik PIC.
 * Balikan { ok, id?, error? }. Aman — tidak melempar.
 */
export async function sendWabaText({ key, endpoint, phoneId }, phone, content) {
  if (!key) return { ok: false, error: 'WABA key kosong' };
  const to = normalizeWaPhone(phone);
  if (!to) return { ok: false, error: 'Nomor tujuan kosong' };
  try {
    const payload = {
      phone_number: to,
      channel: 'whatsapp',
      message_type: 'text',
      content: String(content || ''),
    };
    // Kalau 1 akun punya banyak nomor, tunjuk nomor pengirim (mis. nomor Anis).
    // Kalau dikosongkan, Api.co.id pakai nomor utama akun.
    if (phoneId) payload.whatsapp_phone_number_id = String(phoneId);
    const res = await fetch(endpoint || 'https://chat.api.co.id/api/v1/public/messages/send', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
