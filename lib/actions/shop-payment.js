'use server';

// Mulai pembayaran Midtrans (Snap redirect) untuk sebuah booking.
import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { createSnapTransaction, midtransConfigured } from '@/lib/midtrans';
import { getBookingPaymentPlan } from '@/lib/shop/payments';
import { getInvoiceBilling } from '@/lib/shop/invoice-bill';
import { ADMIN_FEE, ADMIN_FEE_ONLINE } from '@/lib/shop/data';
import { paymentFee, payMethod } from '@/lib/shop/payment-fee';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createSvc(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function startPayment(bookingId, method) {
  const code = currentBrandCode();
  if (!midtransConfigured(code)) {
    return { error: 'Pembayaran online belum aktif. Silakan konfirmasi via WhatsApp.' };
  }
  const db = svc();
  if (!db) return { error: 'Server belum siap' };

  const { data: b } = await db.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!b) return { error: 'Booking tidak ditemukan' };
  if (b.status === 'paid') return { error: 'Booking ini sudah lunas.' };

  const base = customerSiteUrlFor(code);
  const finishUrl = `${base}/order/${b.id}`;  // setelah bayar → halaman order (publik, tampil 'Pembayaran Berhasil'); domain customer (travelingeropa.com)

  // order_id unik per attempt (Midtrans tolak order_id sama) → order_code + suffix waktu
  const orderId = `${b.order_code}-${Date.now().toString(36)}`;

  // b.amount = pokok murni (admin tak di-bake). Biaya admin hanya untuk ONLINE:
  // non-CC Rp13.000 (DP web), CC 3%.
  const dpBaseAmt = Number(b.amount) || 0;
  const fee = paymentFee(method, dpBaseAmt, { dpWeb: true });
  const r = await createSnapTransaction(code, {
    orderId,
    grossAmount: dpBaseAmt + fee,
    fee,
    enabledPayments: payMethod(method)?.enabled,
    customer: { name: b.lead_name, email: b.lead_email, phone: b.lead_phone },
    itemName: 'Booking ' + b.order_code,
    finishUrl,
  });
  if (r?.error) return { error: r.error };

  await db.from('bookings').update({ midtrans_order_id: orderId, midtrans_token: r.token || null }).eq('id', b.id);
  return { ok: true, redirect_url: r.redirect_url };
}


// Bayar lanjutan (milestone P1/P2/.../Pelunasan) via Midtrans online.
export async function startMilestonePayment(bookingId, milestoneType, method) {
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

  const amount = ms.total; // termin pokok
  const fee = paymentFee(method, amount); // non-CC Rp6.000, CC 3%
  const base = customerSiteUrlFor(code);
  const orderId = `${b.order_code}-M${milestoneType}-${Date.now().toString(36)}`;

  const r = await createSnapTransaction(code, {
    orderId, grossAmount: amount + fee, fee, enabledPayments: payMethod(method)?.enabled,
    customer: { name: b.lead_name, email: b.lead_email, phone: b.lead_phone },
    itemName: `${milestoneType} ${b.order_code}`,
    finishUrl: `${base}/akun`,
  });
  if (r?.error) return { error: r.error };
  try { await db.from('bookings').update({ midtrans_order_id: orderId }).eq('id', b.id); } catch {}
  return { ok: true, redirect_url: r.redirect_url };
}


// Bayar online dari halaman invoice publik (untuk SEMUA peserta, bukan cuma web booking).
// Dipanggil dari /invoice/[token]. Validasi via token invoice.
export async function startInvoicePayment(invoiceToken, method) {
  const code = currentBrandCode();
  if (!midtransConfigured(code)) return { error: 'Pembayaran online belum aktif. Silakan transfer manual.' };
  const db = svc();
  if (!db) return { error: 'Server belum siap' };

  const { data: inv } = await db.from('invoices').select('*').eq('public_token', invoiceToken).maybeSingle();
  if (!inv) return { error: 'Invoice tidak ditemukan' };
  if (inv.paid_at || inv.status === 'paid') return { error: 'Invoice ini sudah lunas.' };

  const bill = await getInvoiceBilling(db, inv);
  const amount = bill.billedTotal || bill.sisa || 0;
  if (amount <= 0) return { error: 'Tidak ada tagihan yang perlu dibayar.' };
  const type = inv.milestone || 'Pelunasan';

  const headPid = inv.passenger_id || bill.ids[0];
  const { data: pax } = await db.from('trip_passengers').select('customer_id').eq('id', headPid).maybeSingle();
  let cust = null;
  if (pax?.customer_id) { const r = await db.from('customers').select('name, phone, whatsapp, email').eq('id', pax.customer_id).maybeSingle(); cust = r.data; }

  const fee = paymentFee(method, amount); // non-CC Rp6.000, CC 3%
  const base = customerSiteUrlFor(code);
  const orderId = `INVID-${code === 'khasanah' ? 'KH' : 'TE'}-${inv.id}-${Date.now().toString(36)}`;
  const r = await createSnapTransaction(code, {
    orderId, grossAmount: amount + fee, fee, enabledPayments: payMethod(method)?.enabled,
    customer: { name: cust?.name, email: cust?.email, phone: cust?.whatsapp || cust?.phone },
    itemName: `${type} - Invoice${bill.isFamily ? ` (${bill.count} pax)` : ''}`,
    finishUrl: `${base}/invoice/${invoiceToken}`,
  });
  if (r?.error) return { error: r.error };
  try { await db.from('invoices').update({ midtrans_order_id: orderId }).eq('id', inv.id); } catch {}
  return { ok: true, redirect_url: r.redirect_url, amount: amount + fee, type };
}
