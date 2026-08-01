// Tanda tangan (HMAC) untuk link /api/proof — dipakai halaman PUBLIK tanpa login
// (mis. invoice via token) supaya link file privat tetap bisa dibuka customer,
// tapi orang lain tak bisa menebak/menyalahgunakan URL storage.
// SERVER-ONLY (pakai secret; jangan diimpor dari komponen 'use client').
import crypto from 'crypto';

function secret() {
  return process.env.PROOF_SIGN_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.CRON_SECRET
    || '';
}

// Tanda tangani nilai `u` (URL storage) + waktu kedaluwarsa. Default 7 hari.
export function signProof(u, ttlMs = 7 * 24 * 3600 * 1000) {
  const s = secret();
  if (!s || !u) return null;
  const exp = Date.now() + ttlMs;
  const mac = crypto.createHmac('sha256', s).update(`${u}|${exp}`).digest('base64url');
  return { e: String(exp), s: mac };
}

export function verifyProof(u, e, sig) {
  const s = secret();
  if (!s || !u || !e || !sig) return false;
  const exp = parseInt(e, 10);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const mac = crypto.createHmac('sha256', s).update(`${u}|${exp}`).digest('base64url');
  try {
    const a = Buffer.from(mac);
    const b = Buffer.from(String(sig));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}
