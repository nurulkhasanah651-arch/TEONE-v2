'use server';

// Transfer Bank Manual dari etalase web (halaman /order/[id]).
// Alur: customer pilih "Transfer Manual" -> upload bukti -> booking.manual_status='pending'
//       Finance verifikasi di /finance/manual-transfer -> approve = fulfillPaidBooking
//       (peserta masuk Master Trip + participant_payments / finance checklist payment).
// Seat baru terpotong SAAT finance approve (bukan saat upload).

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { revalidatePath } from 'next/cache';
import { fulfillPaidBooking } from '@/lib/shop/fulfillment';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// PUBLIC — customer kirim bukti transfer (tak butuh login).
export async function submitManualTransfer(bookingId, formData) {
  const db = svc();
  if (!db || !bookingId) return { error: 'Service tidak tersedia' };

  const { data: b } = await db.from('bookings')
    .select('id, status, manual_status').eq('id', bookingId).maybeSingle();
  if (!b) return { error: 'Booking tidak ditemukan' };
  if (b.status === 'paid') return { error: 'Booking ini sudah lunas' };

  const proof_url = formData.get('proof_url') || null;
  const proof_name = formData.get('proof_file_name') || null;
  const note = formData.get('note') || null;
  if (!proof_url) return { error: 'Upload bukti transfer dulu ya' };

  const { error } = await db.from('bookings').update({
    payment_method: 'manual_transfer',
    manual_status: 'pending',
    payment_proof_url: proof_url,
    payment_proof_name: proof_name,
    manual_note: note,
    proof_submitted_at: new Date().toISOString(),
    manual_reject_reason: null,
  }).eq('id', bookingId);
  if (error) return { error: error.message };

  revalidatePath(`/order/${bookingId}`);
  revalidatePath('/finance/manual-transfer');
  revalidatePath('/invoices');
  return { ok: true };
}

// FINANCE (login) — approve bukti -> fulfill booking (peserta + payment checklist).
export async function approveManualTransfer(bookingId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const by = user.user_metadata?.full_name || user.email || 'finance';

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  const { data: b } = await db.from('bookings')
    .select('id, order_code, status, manual_status').eq('id', bookingId).maybeSingle();
  if (!b) return { error: 'Booking tidak ditemukan' };
  if (b.status === 'paid' || b.manual_status === 'approved') return { error: 'Booking sudah diproses' };

  // Catat peserta ke Master Trip + participant_payments (finance checklist) + kas.
  const r = await fulfillPaidBooking(b.order_code, 'Transfer Manual');
  if (r?.error) return { error: 'Gagal proses booking: ' + r.error };

  await db.from('bookings').update({
    manual_status: 'approved',
    manual_verified_by: by,
    manual_verified_at: new Date().toISOString(),
  }).eq('id', bookingId);

  revalidatePath('/finance/manual-transfer');
  revalidatePath('/finance/payments');
  revalidatePath('/invoices');
  return { ok: true };
}

// FINANCE (login) — tolak bukti, customer bisa upload ulang.
export async function rejectManualTransfer(bookingId, reason) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const by = user.user_metadata?.full_name || user.email || 'finance';

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  const { error } = await db.from('bookings').update({
    manual_status: 'rejected',
    manual_reject_reason: reason || 'Bukti tidak valid',
    manual_verified_by: by,
    manual_verified_at: new Date().toISOString(),
  }).eq('id', bookingId);
  if (error) return { error: error.message };

  revalidatePath(`/order/${bookingId}`);
  revalidatePath('/finance/manual-transfer');
  revalidatePath('/invoices');
  return { ok: true };
}
