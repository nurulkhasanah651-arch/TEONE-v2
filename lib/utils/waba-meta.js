// Meta WhatsApp Cloud API — kirim LANGSUNG ke Graph API (bukan lewat Api.co.id).
// KHUSUS Khasanah. Aktif kalau env META_WABA_TOKEN_KHASANAH di-set; kalau kosong,
// metaConfig() balikan null dan sistem pakai jalur lama (Api.co.id / manual / Fonnte).
// Token rahasia HANYA dari env — jangan pernah ditulis di kode.

import { currentBrandCode } from '@/lib/supabase/service-env';

function isKhasanah() {
  try { return currentBrandCode() === 'khasanah'; } catch { return false; }
}

export function metaConfig() {
  if (!isKhasanah()) return null;
  const token = String(process.env.META_WABA_TOKEN_KHASANAH || '').trim();
  if (!token) return null;
  return {
    token,
    version: process.env.META_WABA_API_VERSION || 'v21.0',
    lang: process.env.WABA_TEMPLATE_LANG_KHASANAH || 'id',
    wabaId: String(process.env.META_WABA_ID_KHASANAH || '').trim(),
  };
}

export function normalizeWaPhone(p) {
  let s = String(p || '').replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s && !s.startsWith('62')) s = '62' + s;
  return s;
}

async function postMeta(cfg, phoneNumberId, payload) {
  if (!cfg?.token) return { ok: false, error: 'META token kosong' };
  if (!phoneNumberId) return { ok: false, error: 'phone_number_id kosong' };
  try {
    const url = `https://graph.facebook.com/${cfg.version}/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
    });
    const txt = await res.text();
    let json = {};
    try { json = JSON.parse(txt); } catch {}
    if (!res.ok || json?.error) {
      return { ok: false, error: `META ${res.status}: ${(json?.error?.message || txt).slice(0, 300)}` };
    }
    return { ok: true, wamid: json?.messages?.[0]?.id || null };
  } catch (e) {
    return { ok: false, error: 'META fetch: ' + (e?.message || e) };
  }
}

export async function sendMetaText(cfg, phoneNumberId, toPhone, body) {
  const to = normalizeWaPhone(toPhone);
  if (!to) return { ok: false, error: 'Nomor tujuan kosong' };
  return postMeta(cfg, phoneNumberId, { to, type: 'text', text: { preview_url: true, body: String(body || '') } });
}

export async function sendMetaTemplate(cfg, phoneNumberId, toPhone, templateName, lang, params, buttonUrlSuffix) {
  const to = normalizeWaPhone(toPhone);
  if (!to) return { ok: false, error: 'Nomor tujuan kosong' };
  if (!templateName) return { ok: false, error: 'template name kosong' };
  const components = [];
  if (params && params.length) components.push({ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p == null || p === '' ? '-' : p) })) });
  if (buttonUrlSuffix != null && String(buttonUrlSuffix).trim() !== '') {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(buttonUrlSuffix) }] });
  }
  return postMeta(cfg, phoneNumberId, {
    to, type: 'template',
    template: { name: templateName, language: { code: lang || 'id' }, components },
  });
}

// Ambil daftar template dari Meta (WABA level). Balikan { ok, templates } / { ok:false }.
export async function fetchMetaTemplates(cfg) {
  if (!cfg?.token || !cfg?.wabaId) return { ok: false, error: 'META token / WABA ID belum di-set' };
  try {
    const url = `https://graph.facebook.com/${cfg.version}/${cfg.wabaId}/message_templates?limit=200`;
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + cfg.token } });
    const txt = await res.text();
    let json = {}; try { json = JSON.parse(txt); } catch {}
    if (!res.ok || json?.error) return { ok: false, error: `META ${res.status}: ${(json?.error?.message || txt).slice(0, 300)}` };
    return { ok: true, templates: json?.data || [] };
  } catch (e) { return { ok: false, error: 'META fetch: ' + (e?.message || e) }; }
}
