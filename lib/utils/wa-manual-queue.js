// Antrekan pesan WA yang tidak dikirim otomatis (PIC Khasanah kirim manual).
import { currentBrandCode } from '@/lib/supabase/service-env';

export async function queueManualWA(db, { phone, message, kind, context, tripId } = {}) {
  try {
    await db.from('wa_outbox').insert({
      brand: (() => { try { return currentBrandCode(); } catch { return null; } })(),
      context: context || 'finance',
      kind: kind || 'manual_pending',
      status: 'pending',
      target_phone: phone || null,
      message: message || null,
      trip_id: tripId || null,
      reason: 'PIC kirim manual — nomor WA PIC belum tersambung',
    });
    return true;
  } catch { return false; }
}
