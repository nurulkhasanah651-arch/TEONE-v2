// lib/actions/discount.js
// R211 v2: Save/update diskon per peserta
// CATATAN: Diskon TIDAK masuk Cash Out (karena belum ada bayaran).
// Diskon hanya mengurangi expected → income projection turun → margin otomatis ikut turun.

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Update diskon per peserta
 * Diskon mengurangi:
 * - expectedPerPassenger (total tagihan peserta)
 * - computeIncomeProjection (proyeksi income trip)
 * - Margin cashflow (otomatis berkurang karena income turun)
 */
export async function updateDiscount(passengerId, amount) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!passengerId) return { error: 'Passenger ID kosong' };

  const discount = Math.max(0, Number(amount) || 0);

  // 1. Ambil current data peserta (untuk revalidate trip)
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id, customer_id, customers(name)')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  // 2. Update discount_amount saja — gak insert ke accounting
  const { error: updErr } = await supabase
    .from('trip_passengers')
    .update({ discount_amount: discount })
    .eq('id', passengerId);
  if (updErr) return { error: 'Update failed: ' + updErr.message };

  // 3. Revalidate halaman yg related supaya total/margin auto-update
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
    customer_name: pax.customers?.name || null,
  };
}
