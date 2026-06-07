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

import { currentBrandCode } from '@/lib/supabase/service-env';

const FONNTE_URL = 'https://api.fonnte.com/send';

/**
 * Pick the right Fonnte token based on context
 */
// Context → urutan kandidat env var (yang pertama ketemu dipakai)
// Tiap kandidat dicoba versi brand dulu (suffix _KHASANAH) baru versi umum.
const CONTEXT_CHAIN = {
  payment: ['PAYMENT', 'FINANCE'],
  invoice: ['PAYMENT', 'FINANCE'],
  visa: ['VISA', 'FINANCE'],
  tl: ['TL'],
  tour_leader: ['TL'],
  tourleader: ['TL'],
  finance: ['FINANCE'],
  peserta: ['FINANCE'],
};

function brandSuffix() {
  try {
    return currentBrandCode() === 'khasanah' ? '_KHASANAH' : '';
  } catch {
    return '';
  }
}

export function getFonnteToken(context = 'finance') {
  const ctx = String(context || 'finance').toLowerCase();
  const sfx = brandSuffix();
  const chain = CONTEXT_CHAIN[ctx] || ['FINANCE'];

  for (const name of chain) {
    if (sfx) {
      const t = process.env[`FONNTE_TOKEN_${name}${sfx}`];
      if (t) return { token: t, source: `FONNTE_TOKEN_${name}${sfx}` };
    }
    const t = process.env[`FONNTE_TOKEN_${name}`];
    if (t) return { token: t, source: `FONNTE_TOKEN_${name}` };
  }

  if (sfx && process.env[`FONNTE_TOKEN${sfx}`]) {
    return { token: process.env[`FONNTE_TOKEN${sfx}`], source: `FONNTE_TOKEN${sfx}` };
  }
  const fallback = process.env.FONNTE_TOKEN;
  if (fallback) return { token: fallback, source: 'FONNTE_TOKEN (fallback)' };

  return { token: null, source: 'none' };
}

// Per-PIC: nomor Fonnte pribadi PIC trip (kolom employees.fonnte_token)
// Pakai: const t = await getTripPicFonnteToken(supabase, tripId); → kalau ada, kirim pakai itu
export async function getTripPicFonnteToken(supabase, tripId) {
  try {
    const { data: trip } = await supabase.from('trips').select('pic, pic_email').eq('id', tripId).maybeSingle();
    if (!trip) return null;
    let q = supabase.from('employees').select('fonnte_token').limit(1);
    if (trip.pic_email) q = q.ilike('email', trip.pic_email);
    else if (trip.pic) q = q.ilike('full_name', trip.pic);
    else return null;
    const { data: emp } = await q.maybeSingle();
    return emp?.fonnte_token || null;
  } catch {
    return null;
  }
}

/**
 * Send WhatsApp message via Fonnte
 */
export async function sendFonnte(phone, message, options = {}) {
  const context = options.forceContext || options.context || 'finance';
  let { token, source } = getFonnteToken(context);
  if (options.overrideToken) { token = options.overrideToken; source = 'PIC (per-trip)'; }

  if (!token) {
    return {
      error: `Tidak ada Fonnte token untuk context '${context}'. Set FONNTE_TOKEN_FINANCE / FONNTE_TOKEN_TL / FONNTE_TOKEN di Vercel env vars.`,
    };
  }

  if (!phone || !message) {
    return { error: 'phone & message wajib' };
  }

  try {
    const res = await fetch(FONNTE_URL, {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        target: normalizePhone(phone),
        message,
        countryCode: '62',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === false) {
      return {
        error: 'Fonnte error: ' + (data.reason || data.message || `HTTP ${res.status}`),
        sentVia: source,
      };
    }
    return { ok: true, sentVia: source };
  } catch (e) {
    return { error: 'Network error: ' + (e?.message || 'unknown'), sentVia: source };
  }
}

/**
 * Normalize phone number for Fonnte (Indonesia format)
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = '62' + p.slice(1);
  if (!p.startsWith('62')) p = '62' + p;
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
