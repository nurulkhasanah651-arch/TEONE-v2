// lib/actions/discount.js
// R211 v3: Save/update diskon per peserta
// v3 FIX: pakai service client (bypass RLS) + query lebih defensive

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Update diskon per peserta
 * Diskon mengurangi:
 * - expectedPerPassenger (total tagihan peserta)
 * - computeIncomeProjection (proyeksi income trip)
 * - Margin cashflow (otomatis berkurang karena income turun)
 */
export async function updateDiscount(passengerId, amount) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!passengerId) return { error: 'Passenger ID kosong' };

  // Pakai service client (bypass RLS)
  const supabase = getServiceClient() || authClient;

  const discount = Math.max(0, Number(amount) || 0);
  const idNum = Number(passengerId);

  // 1. Cek peserta exists (defensive — query simpel tanpa join)
  const { data: pax, error: paxErr } = await supabase
    .from('trip_passengers')
    .select('id, trip_id')
    .eq('id', idNum)
    .maybeSingle();

  if (paxErr) {
    return { error: 'Query error: ' + paxErr.message };
  }
  if (!pax) {
    return { error: `Peserta gak ketemu (id=${passengerId}). Pastikan SQL ADD COLUMN sudah jalan.` };
  }

  // 2. Update discount_amount
  const { error: updErr } = await supabase
    .from('trip_passengers')
    .update({ discount_amount: discount })
    .eq('id', idNum);
  if (updErr) {
    // Defensive — kalau column delum exists, kasih hint clear
    if (/discount_amount/.test(updErr.message)) {
      return { error: 'Kolom discount_amount belum ada — jalankan SQL ADD COLUMN dulu' };
    }
    return { error: 'Update failed: ' + updErr.message };
  }

  // 3. Revalidate halaman yg related
  revalidatePath('/finance/payments');
  revalidatePath('/finance/cashflow');
  revalidatePath('/accounting');
  if (pax.trip_id) {
    revalidatePath(`/finance/payments/${pax.trip_id}`);
    revalidatePath(`/finance/cashflow/${pax.trip_id}`);
    revalidatePath(`/trips/${pax.trip_id}`);
  }

  return {
    ok: true,
    discount,
    passenger_id: idNum,
  };
}
