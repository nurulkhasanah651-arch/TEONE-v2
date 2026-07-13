// Api.co.id (BSP, mendukung coexistence) — kirim WhatsApp via chat.api.co.id.
// KHUSUS Khasanah. Aktif kalau env WABA_API_KEY_KHASANAH di-set (key akun Api.co.id).
// Nomor pengirim per-PIC ditentukan whatsapp_phone_number_id (employees.waba_phone_id).

import { currentBrandCode } from '@/lib/supabase/service-env';

function isKhasanah() { try { return currentBrandCode() === 'khasanah'; } catch { return false; } }

export function apicoidConfig() {
  if (!isKhasanah()) return null;
  const key = String(process.env.WABA_API_KEY_KHASANAH || '').trim();
  if (!key) return null;
  return {
    key,
    endpoint: process.env.WABA_ENDPOINT_KHASANAH || 'https://chat.api.co.id/api/v1/public/messages/send',
    lang: process.env.WABA_TEMPLATE_LANG_KHASANAH || 'id',
  };
}

export function normalizeWaPhone(p) {
  let s = String(p || '').replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s && !s.startsWith('62')) s = '62' + s;
  return s;
}

async function post(cfg, body) {
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    let j = {}; try { j = JSON.parse(txt); } catch {}
    if (!res.ok || j?.success === false) return { ok: false, error: `APICOID ${res.status}: ${txt.slice(0, 300)}` };
    return { ok: true, id: j?.data?.message_id || null };
  } catch (e) { return { ok: false, error: 'APICOID fetch: ' + (e?.message || e) }; }
}

export async function sendApicoidText(cfg, phoneId, toPhone, content) {
  const to = normalizeWaPhone(toPhone);
  if (!to) return { ok: false, error: 'Nomor tujuan kosong' };
  const body = { phone_number: to, channel: 'whatsapp', message_type: 'text', content: String(content || '') };
  if (phoneId) body.whatsapp_phone_number_id = String(phoneId);
  return post(cfg, body);
}

export async function sendApicoidTemplate(cfg, phoneId, toPhone, name, lang, params) {
  const to = normalizeWaPhone(toPhone);
  if (!to) return { ok: false, error: 'Nomor tujuan kosong' };
  if (!name) return { ok: false, error: 'template kosong' };
  const body = {
    phone_number: to, channel: 'whatsapp', message_type: 'template',
    template: { name, language: { code: lang || 'id' }, components: (params && params.length) ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p == null || p === '' ? '-' : p) })) }] : [] },
  };
  if (phoneId) body.whatsapp_phone_number_id = String(phoneId);
  return post(cfg, body);
}

// Ambil nama profil WA (push name) dari Api.co.id: GET /api/v1/public/customers/:id
// id boleh customer_id (CUID) atau nomor. Baca env key langsung supaya bisa dipanggil
// dari webhook (tanpa konteks brand). Balikan nama, atau null bila gagal.
export async function getApicoidCustomerName(idOrPhone) {
  try {
    const key = String(process.env.WABA_API_KEY_KHASANAH || '').trim();
    if (!key || !idOrPhone) return null;
    const base = (process.env.WABA_ENDPOINT_KHASANAH || 'https://chat.api.co.id/api/v1/public/messages/send')
      .replace(/\/messages\/send.*$/, '');
    const url = base + '/customers/' + encodeURIComponent(String(idOrPhone));
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const nm = j?.data?.name;
    return nm && String(nm).trim() ? String(nm).trim() : null;
  } catch { return null; }
}
