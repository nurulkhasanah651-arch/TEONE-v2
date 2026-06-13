'use server';

// Storefront checkout — buat customer + booking (pending). Pembayaran Midtrans menyusul (Fase 4).
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { roomTypeToKey } from '@/lib/utils/price-breakdown';
import { createPesertaAccount } from '@/lib/actions/peserta-auth';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function normPhone(p) { return String(p || '').replace(/\D/g, '').replace(/^0/, '62'); }
function seatLeft(t) { return t?.seat_left != null ? Math.max(t.seat_left, 0) : Math.max((t?.quota || 0) - (t?.sold || 0), 0); }

export async function createBooking(formData) {
  const db = svc();
  if (!db) return { error: 'Server belum siap' };

  const tripId = (formData.get('trip_id') || '').toString();
  const name = (formData.get('lead_name') || '').toString().trim();
  const phone = (formData.get('lead_phone') || '').toString().trim();
  const email = (formData.get('lead_email') || '').toString().trim();
  const paxCount = Math.max(parseInt(formData.get('pax_count')) || 1, 1);
  const roomType = (formData.get('room_type') || '').toString().trim() || null;
  const paymentType = (formData.get('payment_type') || 'dp').toString() === 'full' ? 'full' : 'dp';
  const password = (formData.get('password') || '').toString();

  if (!name || !phone) return { error: 'Nama & No HP wajib diisi' };

  const { data: trip } = await db.from('trips').select('*').eq('id', tripId).eq('is_published', true).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan / belum dibuka' };
  if (seatLeft(trip) < paxCount) return { error: `Seat tidak cukup. Sisa ${seatLeft(trip)} seat.` };

  // Harga ikut tipe kamar dari master (price_breakdown), fallback public_price/price
  const bd = (trip.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {};
  const rk = roomTypeToKey(roomType);
  const roomPrice = rk ? Number(bd[rk]) || 0 : 0;
  const unit = roomPrice > 0 ? roomPrice : Number(trip.public_price || trip.price || 0);
  const dp = Number(trip.dp_amount || 0);
  const amount = paymentType === 'full' ? unit * paxCount : (dp > 0 ? dp * paxCount : Math.round(unit * 0.2) * paxCount);
  if (amount <= 0) return { error: 'Harga trip belum di-set. Hubungi admin.' };

  // upsert customer by phone
  const np = normPhone(phone);
  let customerId = null;
  try {
    const { data: existing } = await db.from('customers').select('id').eq('phone', np).limit(1).maybeSingle();
    if (existing) {
      customerId = existing.id;
      await db.from('customers').update({ name, email: email || null, whatsapp: np }).eq('id', existing.id);
    } else {
      const { data: created } = await db.from('customers').insert({ name, phone: np, whatsapp: np, email: email || null }).select('id').single();
      customerId = created?.id || null;
    }
  } catch (e) { /* customer best-effort */ }

  const prefix = currentBrandCode() === 'khasanah' ? 'KH' : 'TE';
  const orderCode = `${prefix}-${Date.now().toString(36).toUpperCase()}`;

  const { data: booking, error } = await db.from('bookings').insert({
    order_code: orderCode,
    trip_id: tripId,
    customer_id: customerId,
    lead_name: name, lead_phone: np, lead_email: email || null,
    pax_count: paxCount, room_type: roomType,
    amount, payment_type: paymentType, status: 'pending',
  }).select('id, order_code').single();

  if (error) return { error: 'Gagal membuat booking: ' + error.message };

  // Buat akun peserta (opsional) bila password diisi
  let account = 'none';
  if (password && email) {
    const acc = await createPesertaAccount({ name, email, phone, password, customerId });
    if (acc?.ok) account = acc.status; // 'created' | 'exists'
  }

  return { ok: true, id: booking.id, order_code: booking.order_code, account, email };
}
