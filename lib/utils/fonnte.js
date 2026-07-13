import { currentBrandCode } from '@/lib/supabase/service-env';
// Round 165 (re-bundled di R176): Fonnte dual-number helper
// Path: lib/utils/fonnte.js
//
// USAGE:
//   import { sendFonnte } from '@/lib/utils/fonnte';
//   await sendFonnte(phone, message, { context: 'finance' });
//   await sendFonnte(phone, message, { context: 'tl' });
//
// ENV VARS DI VERCEL:
//   FONNTE_TOKEN_FINANCE = xxx   ← outbound ke peserta/karyawan/TL (slip, invoice)
//   FONNTE_TOKEN_TL      = xxx   ← optional, untuk broadcast TL ke peserta
//   FONNTE_TOKEN         = xxx   ← optional fallback default

const FONNTE_URL = 'https://api.fonnte.com/send';

// Brand aktif (kalau caller tak mengirim options.brand). Tanpa ini, sendFonnte dari
// Khasanah akan memilih token base = nomor TravelingEropa.
function activeBrand() {
  try { return currentBrandCode() || ''; } catch { return ''; }
}

/**
 * Pick the right Fonnte token based on context
 */
export function getFonnteToken(context = 'finance', brand = '') {
  const ctx = String(context || 'finance').toLowerCase();
  const isKh = String(brand || '').toLowerCase() === 'khasanah';
  const suffix = isKh ? '_KHASANAH' : '';
  // ISOLASI BRAND: Khasanah HANYA boleh pakai token *_KHASANAH.
  // Sebelumnya fallback ke env base -> pesan Khasanah keluar dari nomor Finance TravelingEropa.
  const pick = (base) => (isKh ? (process.env[base + suffix] || null) : (process.env[base] || null));
  const picked = (base) => (isKh ? base + suffix : base);

  // daftar kandidat token per context (urut prioritas + fallback)
  let candidates;
  if (ctx === 'cs' || ctx === 'web_dp' || ctx === 'cs_web') {
    candidates = ['FONNTE_TOKEN_CS', 'FONNTE_TOKEN_FINANCE'];          // DP pertama dari web
  } else if (ctx === 'visa' || ctx === 'cs_visa') {
    candidates = ['FONNTE_TOKEN_VISA', 'FONNTE_TOKEN_CS', 'FONNTE_TOKEN_FINANCE']; // info visa
  } else if (ctx === 'ops' || ctx === 'operation' || ctx === 'tl' || ctx === 'tour_leader' || ctx === 'tourleader') {
    candidates = ['FONNTE_TOKEN_OPS', 'FONNTE_TOKEN_TL', 'FONNTE_TOKEN_FINANCE']; // WA ke TL/operasional
  } else {
    candidates = ['FONNTE_TOKEN_FINANCE'];                            // invoice/payment/peserta = finance
  }

  for (const base of candidates) {
    const t = pick(base);
    if (t) return { token: t, source: picked(base) };
  }
  const fb = isKh ? process.env.FONNTE_TOKEN_KHASANAH : process.env.FONNTE_TOKEN;
  if (fb) return { token: fb, source: isKh ? 'FONNTE_TOKEN_KHASANAH (fallback)' : 'FONNTE_TOKEN (fallback)' };
  return { token: null, source: 'none' };
}

/**
 * Send WhatsApp message via Fonnte
 */
export async function sendFonnte(phone, message, options = {}) {
  const context = options.forceContext || options.context || 'finance';
  // Override token (mis. token Fonnte milik PIC trip — khasanah). Jika ada, pakai itu.
  let token, source, usedOverride = false;
  if (options.token && String(options.token).trim()) {
    token = String(options.token).trim(); source = 'override(pic)'; usedOverride = true;
  } else {
    ({ token, source } = getFonnteToken(context, options.brand || activeBrand()));
  }

  if (!token) {
    return {
      error: `Tidak ada Fonnte token untuk context '${context}'. Set FONNTE_TOKEN_FINANCE / FONNTE_TOKEN_TL / FONNTE_TOKEN di Vercel env vars.`,
    };
  }

  if (!phone || !message) {
    return { error: 'phone & message wajib' };
  }

  const _post = async (tok) => {
    try {
      const body = options.rawTarget
        ? { target: String(phone), message }   // group id / target apa adanya
        : { target: normalizePhone(phone), message, countryCode: '62' };
      // delay (detik atau rentang "min-max") -> Fonnte menyebar jeda kirim, hindari burst/spam-detect WA
      if (options.delay != null && String(options.delay).trim()) body.delay = String(options.delay).trim();
      if (options.typing) body.typing = true;
      if (options.url && String(options.url).trim()) { body.url = String(options.url).trim(); if (options.filename) body.filename = String(options.filename).trim(); }
      const res = await fetch(FONNTE_URL, {
        method: 'POST',
        headers: { 'Authorization': tok, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status === false) {
        return { error: 'Fonnte error: ' + (data.reason || data.message || `HTTP ${res.status}`) };
      }
      const _fid = Array.isArray(data.id) ? data.id[0] : (data.id || null);
      return { ok: true, id: _fid };
    } catch (e) {
      return { error: 'Network error: ' + (e?.message || 'unknown') };
    }
  };

  // Log SEMUA WA ke wa_log (History WA). options.kind/options.tripId opsional. Best-effort.
  const _logWA = async (payload) => {
    if (options.rawTarget) return; // skip pesan ke grup (bukan personal)
    try { const m = await import('@/lib/wa-outbox-log'); await m.logWA({ context, phone, message, kind: options.kind, tripId: options.tripId, ...payload }); } catch {}
  };

  // Coba token utama (PIC override atau token brand)
  let r = await _post(token);
  if (r.ok) { await _logWA({ status: 'sent', state: 'sent', fonnteId: r.id, senderToken: token }); return { ok: true, sentVia: source, id: r.id }; }

  // FALLBACK: kalau token PIC (override) gagal — mis. device WhatsApp PIC sedang offline —
  // coba token brand (CS/Finance) supaya notifikasi tetap terkirim. Khasanah pakai *_KHASANAH dulu.
  let finalErr = { ...r, sentVia: source };
  const _brand = options.brand || activeBrand();
  // Khasanah: nomor PIC yang mati TIDAK di-cover nomor brand/Finance.
  // Pesan dicatat gagal supaya PIC mengirim manual (template tersedia di UI).
  const _allowBrandFallback = String(_brand).toLowerCase() !== 'khasanah';
  if (usedOverride && _allowBrandFallback) {
    const fb = getFonnteToken(context, _brand);
    if (fb.token && fb.token !== token) {
      const r2 = await _post(fb.token);
      if (r2.ok) {
        // Tetap 'sent', tapi catat SEBABNYA: device WA PIC gagal -> terkirim via nomor brand.
        // Tanpa ini, History WA cuma tampil "Finance" tanpa alasan (membingungkan).
        const _why = `Terkirim via ${fb.source} — device/token PIC gagal: ${r.error || 'unknown'}`;
        await _logWA({ status: 'sent', state: 'sent', fonnteId: r2.id, senderToken: fb.token, reason: _why });
        return { ok: true, sentVia: fb.source + ' (fallback dari token PIC yg gagal)', id: r2.id, picFailed: true, picError: r.error || null };
      }
      finalErr = { ...r2, sentVia: fb.source + ' (fallback)' };
    }
  }
  // Gagal: catat ke wa_log (History) + wa_outbox (banner + kirim ulang). Best-effort.
  await _logWA({ status: 'failed', state: 'failed', reason: finalErr.error, senderToken: token });
  try {
    const m = await import('@/lib/wa-outbox-log');
    await m.logFailedWA({ context, phone, message, reason: finalErr.error, brand: _brand });
  } catch { /* abaikan */ }
  return finalErr;
}

/**
 * Normalize phone number for Fonnte (Indonesia format)
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  const raw = String(phone).trim();
  const explicitIntl = raw.startsWith('+'); // user tandai internasional eksplisit
  let p = raw.replace(/[^0-9]/g, '');
  if (!p) return '';
  // Nomor luar negeri ditulis pakai '+' (mis. +966.., +60..) -> hormati apa adanya
  if (explicitIntl) return p;
  if (p.startsWith('0')) return '62' + p.slice(1); // lokal Indonesia (08xx -> 628xx)
  if (p.startsWith('62')) return p;                // sudah format Indonesia internasional
  if (p.startsWith('8')) return '62' + p;          // mobile Indonesia tanpa 0/62
  // Selain itu: sudah ada kode negara lain (966 Saudi, 971 UAE, 60 Malaysia, 65 SG, dst) -> jangan diubah
  return p;
}

/**
 * Get list of available Fonnte contexts (for UI dropdown)
 */
export function getAvailableContexts() {
  const contexts = [];
  if (process.env.FONNTE_TOKEN_FINANCE || process.env.FONNTE_TOKEN) {
    contexts.push({ value: 'finance', label: '💰 Finance (ke peserta)' });
  }
  if (process.env.FONNTE_TOKEN_TL || process.env.FONNTE_TOKEN) {
    contexts.push({ value: 'tl', label: '👤 TL (internal team)' });
  }
  return contexts;
}
