// Guard kepemilikan trip untuk AKSI TULIS TL (expense/checklist/report/vendor review).
// Aturan: role internal (ops/manager/owner/cs/finance/admin/accounting/pic) bebas.
// Selain itu (tour_leader dll) WAJIB pemilik trip — cegah TL menulis ke trip yg bukan tugasnya.
//
// PENTING: auth dibaca dari sesi HUB (brand host, mis. TEONE tempat akun TL berada),
// jadi guard ini HARUS dipanggil SEBELUM runWithBrand(brand) di wrapper action.

import { createClient } from '@/lib/supabase/server';
import { serviceClientFor } from '@/lib/supabase/service-env';
import { resolveTlIdentity, tlOwnsTrip } from '@/lib/tl-cross-brand';

const INTERNAL = ['manager', 'owner', 'ops', 'cs', 'finance', 'admin', 'accounting', 'pic'];

export async function assertTLTripAccess(tripId, brand) {
  try {
    const supabase = createClient(); // sesi user di brand host (hub TEONE)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Sesi tidak valid. Silakan login ulang.' };

    const role = user.app_metadata?.role || user.user_metadata?.role || 'pending';
    if (INTERNAL.includes(role)) return { ok: true };

    if (!tripId) return { error: 'tripId wajib.' };
    const code = (brand === 'khasanah' || brand === 'teone') ? brand : 'teone';
    const svc = serviceClientFor(code);
    if (!svc) return { error: 'Service tidak tersedia.' };

    const { data: trip } = await svc
      .from('trips').select('tl_id, tl_email, tl_phone').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip tidak ditemukan.' };

    const identity = await resolveTlIdentity(user);
    if (tlOwnsTrip(identity, trip, code)) return { ok: true };
    return { error: 'Akses ditolak: kamu bukan TL yang ditugaskan untuk trip ini.' };
  } catch (e) {
    return { error: 'Gagal verifikasi akses TL.' };
  }
}
