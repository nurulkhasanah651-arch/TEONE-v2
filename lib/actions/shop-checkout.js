'use server';

// Storefront checkout — buat customer + booking (pending). Pembayaran Midtrans menyusul (Fase 4).
import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { roomTypeToKey } from '@/lib/utils/price-breakdown';
import { ADMIN_FEE } from '@/lib/shop/data';
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
  const paymentType = (formData.get('payment_type') || 'dp').toString() === 'full' ? 'full' : 'dp';
  const password = (formData.get('password') || '').toString();

  if (!name || !phone) return { error: 'Nama & No HP wajib diisi' };

  const { data: trip } = await db.from('trips').select('*').eq('id', tripId).eq('is_published', true).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan / belum dibuka' };

  const bd = (trip.price_breakdown && typeof trip.price_breakdown === 'object') ? trip.price_breakdown : {};
  const dp = Number(trip.dp_amount || 0);

  // pax_list (per orang, ada nama) → diutamakan. Fallback composition (qty). Fallback single.
  let paxListRaw = [];
  try { const p = JSON.parse((formData.get('pax_list') || '[]').toString()); if (Array.isArray(p)) paxListRaw = p; } catch {}
  let composition = [];
  try { const c = JSON.parse((formData.get('composition') || '[]').toString()); if (Array.isArray(c)) composition = c; } catch {}

  let paxCount = 0, subtotalFull = 0, roomType = null, compStore = [], paxList = [];
  if (paxListRaw.length) {
    const grp = {};
    for (const p of paxListRaw) {
      const price = Number(bd[p.key]) || 0;
      paxCount += 1;
      subtotalFull += price;
      paxList.push({ key: p.key, label: p.label || p.key, name: (p.name || '').toString().trim(), price });
      grp[p.key] = grp[p.key] || { key: p.key, label: p.label || p.key, qty: 0, price };
      grp[p.key].qty += 1;
    }
    compStore = Object.values(grp);
    roomType = compStore.map((x) => `${x.qty} ${x.label}`).join(', ') || null;
  } else if (composition.length) {
    for (const c of composition) {
      const q = Math.max(parseInt(c.qty) || 0, 0);
      if (q <= 0) continue;
      const price = Number(bd[c.key]) || 0;
      paxCount += q;
      subtotalFull += price * q;
      compStore.push({ key: c.key, label: c.label || c.key, qty: q, price });
      for (let i = 0; i < q; i++) paxList.push({ key: c.key, label: c.label || c.key, name: '', price });
    }
    roomType = compStore.map((x) => `${x.qty} ${x.label}`).join(', ') || null;
  } else {
    // fallback: tipe kamar tunggal + jumlah pax
    paxCount = Math.max(parseInt(formData.get('pax_count')) || 1, 1);
    roomType = (formData.get('room_type') || '').toString().trim() || null;
    const rk = roomTypeToKey(roomType);
    const unit = (rk ? Number(bd[rk]) || 0 : 0) || Number(trip.public_price || trip.price || 0);
    subtotalFull = unit * paxCount;
    compStore = [{ key: rk || 'paket', label: roomType || 'Paket', qty: paxCount, price: unit }];
    for (let i = 0; i < paxCount; i++) paxList.push({ key: rk || 'paket', label: roomType || 'Paket', name: '', price: unit });
  }

  if (paxCount < 1) return { error: 'Pilih minimal 1 peserta.' };
  if (seatLeft(trip) < paxCount) return { error: `Seat tidak cukup. Sisa ${seatLeft(trip)} seat.` };

  const dpBase = dp > 0 ? dp * paxCount : Math.round(subtotalFull * 0.2);
  const base = paymentType === 'full' ? subtotalFull : dpBase;
  const adminFee = ADMIN_FEE;
  const amount = base + adminFee;
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
    notes: JSON.stringify({ admin_fee: adminFee, subtotal: subtotalFull, payment_base: base, composition: compStore, pax_list: paxList }),
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
