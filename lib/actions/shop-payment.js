'use server';

// Mulai pembayaran Midtrans (Snap redirect) untuk sebuah booking.
import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { siteUrlFor } from '@/lib/brand-shared';
import { createSnapTransaction, midtransConfigured } from '@/lib/midtrans';
import { getBookingPaymentPlan } from '@/lib/shop/payments';
import { ADMIN_FEE } from '@/lib/shop/data';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createSvc(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function startPayment(bookingId) {
  const code = currentBrandCode();
  if (!midtransConfigured(code)) {
    return { error: 'Pembayaran online belum aktif. Silakan konfirmasi via WhatsApp.' };
  }
  const db = svc();
  if (!db) return { error: 'Server belum siap' };

  const { data: b } = await db.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!b) return { error: 'Booking tidak ditemukan' };
  if (b.status === 'paid') return { error: 'Booking ini sudah lunas.' };

  const base = siteUrlFor(code);
  const finishUrl = `${base}/akun`;  // setelah bayar → langsung ke portal akun peserta

  // order_id unik per attempt (Midtrans tolak order_id sama) → order_code + suffix waktu
  const orderId = `${b.order_code}-${Date.now().toString(36)}`;

  const r = await createSnapTransaction(code, {
    orderId,
    grossAmount: b.amount,
    customer: { name: b.lead_name, email: b.lead_email, phone: b.lead_phone },
    itemName: 'Booking ' + b.order_code,
    finishUrl,
  });
  if (r?.error) return { error: r.error };

  await db.from('bookings').update({ midtrans_order_id: orderId, midtrans_token: r.token || null }).eq('id', b.id);
  return { ok: true, redirect_url: r.redirect_url };
}


// Bayar lanjutan (milestone P1/P2/.../Pelunasan) via Midtrans online.
export async function startMilestonePayment(bookingId, milestoneType) {
  const code = currentBrandCode();
  if (!midtransConfigured(code)) return { error: 'Pembayaran online belum aktif. Coba cara transfer manual.' };
  const db = svc();
  if (!db) return { error: 'Server belum siap' };

  const { data: b } = await db.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!b) return { error: 'Booking tidak ditemukan' };

  const plan = await getBookingPaymentPlan(b);
  if (!plan) return { error: 'Rencana pembayaran tidak tersedia' };
  const ms = plan.milestones.find((m) => m.type === milestoneType);
  if (!ms) return { error: 'Termin tidak ditemukan' };
  if (ms.paid) return { error: 'Termin ini sudah lunas.' };
  if (ms.total <= 0) return { error: 'Nominal termin belum di-set admin.' };

  const amount = ms.total + ADMIN_FEE;
  const base = siteUrlFor(code);
  const orderId = `${b.order_code}-M${milestoneType}-${Date.now().toString(36)}`;

  const r = await createSnapTransaction(code, {
    orderId, grossAmount: amount,
    customer: { name: b.lead_name, email: b.lead_email, phone: b.lead_phone },
    itemName: `${milestoneType} ${b.order_code}`,
    finishUrl: `${base}/akun`,
  });
  if (r?.error) return { error: r.error };
  return { ok: true, redirect_url: r.redirect_url };
}
