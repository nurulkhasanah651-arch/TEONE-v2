// Log kegagalan kirim WA (Fonnte) → tabel wa_outbox. Dipakai untuk deteksi nomor
// logout & antrean "pesan tertunda" (kirim ulang). Plain server helper (bukan 'use server').
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandSupabaseUrl, brandServiceRoleKey, currentBrandCode } from '@/lib/supabase/service-env';

function svc() {
  try {
    const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
    if (!url || !key) return null;
    return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  } catch { return null; }
}

export async function logFailedWA({ context, phone, message, kind, reason } = {}) {
  try {
    const db = svc(); if (!db) return;
    let brand = 'teone'; try { brand = currentBrandCode(); } catch {}
    await db.from('wa_outbox').insert({
      brand, context: context || 'finance', target_phone: phone || null,
      message: (message || '').slice(0, 4000), kind: kind || null,
      reason: (reason || '').slice(0, 500), status: 'failed',
    });
  } catch { /* best-effort, jangan ganggu alur kirim */ }
}
