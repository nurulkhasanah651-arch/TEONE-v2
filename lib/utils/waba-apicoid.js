// Api.co.id (BSP, mendukung coexistence) — kirim WhatsApp via chat.api.co.id.
// Aktif untuk Khasanah dan TEONE. TEONE tahap awal MEMAKAI akun/key Api.co.id yang
// sama dengan Khasanah (WABA_API_KEY_TEONE tidak wajib; kalau kosong -> pakai
// WABA_API_KEY_KHASANAH). Nomor pengirim per-PIC ditentukan whatsapp_phone_number_id
// (employees.waba_phone_id). No-op selama PIC belum punya nomor -> caller lanjut ke Fonnte.

import { currentBrandCode } from '@/lib/supabase/service-env';

// Brand yang didukung pengiriman WABA via Api.co.id.
function wabaBrand() {
  try {
    const b = currentBrandCode();
    return (b === 'khasanah' || b === 'teone') ? b : null;
  } catch { return null; }
}

// Key Api.co.id per brand. TEONE fallback ke akun Khasanah untuk tahap awal.
export function apicoidKeyForBrand(brand) {
  if (brand === 'teone') {
    return String(process.env.WABA_API_KEY_TEONE || process.env.WABA_API_KEY_KHASANAH || '').trim();
  }
  if (brand === 'khasanah') {
    return String(process.env.WABA_API_KEY_KHASANAH || '').trim();
  }
  return '';
}

export function apicoidConfig() {
  const brand = wabaBrand();
  if (!brand) return null;
  const key = apicoidKeyForBrand(brand);
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

export async function sendApicoidTemplate(cfg, phoneId, toPhone, name, lang, params, buttonUrlSuffix) {
  const to = normalizeWaPhone(toPhone);
  if (!to) return { ok: false, error: 'Nomor tujuan kosong' };
  if (!name) return { ok: false, error: 'template kosong' };
  const components = [];
  if (params && params.length) components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p == null || p === '' ? '-' : p) })) });
  if (buttonUrlSuffix != null && String(buttonUrlSuffix).trim() !== '') {
    components.push({ type: 'button', sub_type: 'url', index: 0, parameters: [{ type: 'text', text: String(buttonUrlSuffix) }] });
  }
  const body = {
    phone_number: to, channel: 'whatsapp', message_type: 'template',
    template: { name, language: { code: lang || 'id' }, components },
  };
  if (phoneId) body.whatsapp_phone_number_id = String(phoneId);
  return post(cfg, body);
}

// Ambil nama profil WA (push name) dari Api.co.id: GET /api/v1/public/customers/:id
// id boleh customer_id (CUID) atau nomor. Baca env key langsung supaya bisa dipanggil
// dari webhook (tanpa konteks brand). Balikan nama, atau null bila gagal.
export async function getApicoidCustomerName(idOrPhone, keyOverride) {
  try {
    const key = String(keyOverride || process.env.WABA_API_KEY_KHASANAH || '').trim();
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
