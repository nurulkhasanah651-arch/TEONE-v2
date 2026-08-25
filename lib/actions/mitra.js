'use server';

// Modul Mitra (partner/agen). Brand-aware.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, serviceClientFor } from '@/lib/supabase/service-env';
import { customerSiteUrlFor, BRAND_CODES } from '@/lib/brand-shared';
import { getBrandCode } from '@/lib/brand';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { getRoleFromUser } from '@/lib/utils/roles';

function getSvc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createSvcClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normPhone(p) { return String(p || '').replace(/\D/g, '').replace(/^0/, '62'); }

// Ambil trip open selling (sisa seat > 0) untuk SATU brand tertentu (lintas-brand).
// Dipakai portal Mitra supaya bisa menampilkan trip TEONE + Khasanah sekaligus.
// Tiap trip ditandai `brand` + `webUrl` ke domain brand-nya sendiri.
async function openSellingForBrand(code) {
  const c = serviceClientFor(code); if (!c) return [];
  const domain = String(customerSiteUrlFor(code) || '').replace(/\/$/, '');
  const { data: allTrips } = await c.from('trips')
    .select('id, name, kode_trip, slug, departure, harga_jual, price, public_price, quota, status, trip_docs_link, visa_pdf_syarat_url')
    .order('departure', { ascending: true });
  const open = (allTrips || []).filter((t) => /open\s*selling/i.test(t.status || ''));
  const openIds = open.map((t) => t.id);
  const soldMap = {};
  for (let i = 0; i < openIds.length; i += 100) {
    const { data: pax } = await c.from('trip_passengers').select('trip_id, transfer_status, refund_status').in('trip_id', openIds.slice(i, i + 100));
    for (const p of (pax || [])) {
      if (p.transfer_status === 'transferred' || p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
      soldMap[p.trip_id] = (soldMap[p.trip_id] || 0) + 1;
    }
  }
  return open.map((t) => ({
    id: t.id, brand: code, kode_trip: t.kode_trip || '', name: t.name || '', departure: t.departure || null,
    price: Number(t.public_price) || Number(t.harga_jual) || Number(t.price) || 0,
    quota: t.quota || 0, seat_left: Math.max((t.quota || 0) - (soldMap[t.id] || 0), 0),
    webUrl: `${domain}/trip/${t.slug || t.id}`,
    pdf: t.trip_docs_link || t.visa_pdf_syarat_url || null,
  })).filter((t) => t.seat_left > 0); // sembunyikan yang sold out / sisa 0 seat
}

// ---- Mitra self-register (login Google, dicocokkan no HP) ----
export async function registerAsMitra(formData) {
  const name = (formData.get('name') || '').trim();
  const phone = (formData.get('phone') || '').trim();
  if (!name || !phone) return { error: 'Nama & No HP wajib' };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const np = normPhone(phone);
  const svc = getSvc() || supabase;   // service role: lewati RLS saat menautkan akun
  const { data: all } = await svc.from('mitra').select('*');
  const match = (all || []).find((m) => normPhone(m.phone) === np);
  if (!match) {
    return { error: 'Nomor HP belum terdaftar sebagai mitra. Hubungi admin untuk didaftarkan dulu.' };
  }
  const { error: linkErr } = await svc.from('mitra').update({
    user_id: user.id, email: (user.email || match.email || '').toLowerCase(), name: match.name || name,
  }).eq('id', match.id);
  if (linkErr) return { error: 'Gagal menautkan akun: ' + linkErr.message };
  try { await svc.from('users').upsert({ id: user.id, email: user.email, name: match.name || name, role: 'mitra' }, { onConflict: 'id' }); } catch {}
  await supabase.auth.updateUser({ data: { ...user.user_metadata, role: 'mitra' } });
  return { ok: true, redirect: '/mitra' };
}

// ---- Admin: kelola mitra ----
export async function saveMitra(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const id = formData.get('id');
  const payload = {
    name: (formData.get('name') || '').trim(),
    phone: (formData.get('phone') || '').trim() || null,
    email: (formData.get('email') || '').trim() || null,
    notes: (formData.get('notes') || '').trim() || null,
    active: formData.get('active') !== 'false',
    updated_at: new Date().toISOString(),
  };
  if (!payload.name) return { error: 'Nama wajib' };
  let err;
  if (id) ({ error: err } = await supabase.from('mitra').update(payload).eq('id', id));
  else ({ error: err } = await supabase.from('mitra').insert(payload));
  if (err) return { error: err.message };
  revalidatePath('/mitra-master');
  return { ok: true };
}

export async function saveFeeTemplate(rows) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  for (const r of rows || []) {
    if (!r.category) continue;
    await supabase.from('mitra_fee_template').upsert(
      { category: r.category, fee: Number(r.fee) || 0, updated_at: new Date().toISOString() },
      { onConflict: 'category,brand_id' }
    );
  }
  revalidatePath('/mitra-master');
  return { ok: true };
}

// ---- Hitung fee per mitra ----
export async function getMitraStats() {
  const supabase = createClient();
  try {
    const [{ data: mitras }, { data: tpl }, { data: payouts }] = await Promise.all([
      supabase.from('mitra').select('*').order('name'),
      supabase.from('mitra_fee_template').select('*'),
      supabase.from('mitra_fee_payouts').select('*'),
    ]);
    const feeByCat = Object.fromEntries((tpl || []).map((t) => [t.category, Number(t.fee) || 0]));

    // Sumber atribusi: mitra per PESERTA (trip_passengers.mitra_id) — sesuai yg diisi di
    // edit peserta / CS Daily (peserta sumber Mitra). Hanya peserta aktif (exclude transfer/refund).
    const { data: paxAll } = await supabase
      .from('trip_passengers')
      .select('trip_id, mitra_id, transfer_status, refund_status')
      .not('mitra_id', 'is', null);
    const pax = (paxAll || []).filter((p) =>
      p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund');
    const tripIds = [...new Set(pax.map((p) => p.trip_id).filter(Boolean))];
    let tripMap = {};
    if (tripIds.length) {
      const { data: trips } = await supabase.from('trips').select('id, name, kode_trip, fee_category').in('id', tripIds);
      tripMap = Object.fromEntries((trips || []).map((t) => [t.id, t]));
    }

    const stats = (mitras || []).map((m) => {
      const myRows = pax.filter((r) => r.mitra_id === m.id);
      const trips = {};
      let feeEarned = 0, sold = 0;
      for (const r of myRows) {
        sold += 1;
        const t = tripMap[r.trip_id];
        const cat = t?.fee_category || 'Lainnya';
        feeEarned += (feeByCat[cat] || 0);
        const key = r.trip_id;
        if (!trips[key]) trips[key] = { name: t ? `${t.kode_trip || ''} ${t.name}` : r.trip_id, count: 0, cat };
        trips[key].count += 1;
      }
      const paid = (payouts || []).filter((p) => p.mitra_id === m.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      return {
        ...m, sold, trips: Object.values(trips),
        feeEarned, paid, remaining: Math.max(feeEarned - paid, 0),
        payouts: (payouts || []).filter((p) => p.mitra_id === m.id),
      };
    });
    return { ok: true, stats, feeByCat };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}

export async function payoutMitraFee(mitraId, amount, period, notes) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!mitraId || !(Number(amount) > 0)) return { error: 'Mitra & jumlah wajib' };
  const { error } = await supabase.from('mitra_fee_payouts').insert({
    mitra_id: mitraId, amount: Number(amount), period: period || null,
    paid_by: user.user_metadata?.full_name || user.email || 'unknown', notes: notes || null,
  });
  if (error) return { error: error.message };
  // catat sebagai pengeluaran accounting (tanpa trip)
  try {
    await supabase.from('accounting_entries').insert({
      type: 'out', amount: Number(amount), category: 'Fee Mitra',
      description: `Pencairan fee mitra #${mitraId}${period ? ` periode ${period}` : ''}`,
      date: new Date().toISOString().slice(0, 10),
      created_by: user.email || 'system',
    });
  } catch {}
  revalidatePath('/mitra-master');
  revalidatePath('/accounting');
  return { ok: true };
}

// ---- Portal mitra: DASHBOARD (closingan + fee + trip open selling + link web + WA template) ----
export async function getMitraDashboard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const svc = getSvc() || supabase;

  // Identifikasi mitra dari akun login.
  let mitra = null;
  { const { data } = await svc.from('mitra').select('*').eq('user_id', user.id).maybeSingle(); mitra = data; }
  if (!mitra && user.email) {
    const { data } = await svc.from('mitra').select('*').ilike('email', user.email).maybeSingle();
    mitra = data;
  }
  // Staf internal boleh buka /mitra dalam MODE PREVIEW (lihat tampilan portal + trip open selling).
  let preview = false;
  if (!mitra) {
    const role = await resolveAuthoritativeRole(user, getRoleFromUser(user));
    const isStaff = role && role !== 'mitra' && role !== 'pending';
    if (!isStaff) return { error: 'Akun ini belum tertaut sebagai mitra.' };
    preview = true;
  }

  // ── Closingan & Fee mitra ini (hanya untuk login mitra asli, bukan preview) ──
  let stats = null;
  if (!preview) {
    const [{ data: tpl }, { data: payouts }] = await Promise.all([
      svc.from('mitra_fee_template').select('*'),
      svc.from('mitra_fee_payouts').select('*').eq('mitra_id', mitra.id),
    ]);
    const feeByCat = Object.fromEntries((tpl || []).map((t) => [t.category, Number(t.fee) || 0]));

    const { data: paxAll } = await svc.from('trip_passengers')
      .select('trip_id, transfer_status, refund_status').eq('mitra_id', mitra.id);
    const myPax = (paxAll || []).filter((p) =>
      p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund');
    const myTripIds = [...new Set(myPax.map((p) => p.trip_id).filter(Boolean))];
    let tripMap = {};
    if (myTripIds.length) {
      const { data: trips } = await svc.from('trips').select('id, name, kode_trip, fee_category').in('id', myTripIds);
      tripMap = Object.fromEntries((trips || []).map((t) => [t.id, t]));
    }
    const byTrip = {};
    let sold = 0, feeEarned = 0;
    for (const r of myPax) {
      sold += 1;
      const t = tripMap[r.trip_id]; const cat = t?.fee_category || 'Lainnya';
      const fee = feeByCat[cat] || 0; feeEarned += fee;
      const k = r.trip_id;
      if (!byTrip[k]) byTrip[k] = { name: t ? `${t.kode_trip || ''} ${t.name || ''}`.trim() : String(r.trip_id), count: 0, fee: 0 };
      byTrip[k].count += 1; byTrip[k].fee += fee;
    }
    const paid = (payouts || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    stats = { sold, feeEarned, paid, remaining: Math.max(feeEarned - paid, 0), trips: Object.values(byTrip) };
  }

  // ── Trip open selling LINTAS-BRAND (TEONE + Khasanah) + sisa seat + link web ──
  // Ambil dari SEMUA brand DB, tiap trip ditandai brand-nya. Tiap brand di-query
  // sekali dari DB-nya sendiri → tidak ada dobel. Kalau satu brand error, brand
  // lain tetap tampil.
  const currentBrand = getBrandCode();
  const perBrand = await Promise.all(BRAND_CODES.map((code) => openSellingForBrand(code).catch(() => [])));
  const openTrips = perBrand.flat()
    .sort((a, b) => String(a.departure || '9999-12-31').localeCompare(String(b.departure || '9999-12-31')));

  return {
    ok: true,
    preview,
    currentBrand,
    mitra: { name: preview ? 'Preview Tim' : (mitra.name || 'Mitra') },
    stats,
    openTrips,
  };
}

// ---- Trip open selling + sisa seat + link web (dipakai portal Mitra & TL) ----
export async function getOpenSellingTrips() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const svc = getSvc() || supabase;
  const domain = String(customerSiteUrlFor(getBrandCode()) || '').replace(/\/$/, '');
  const { data: allTrips } = await svc.from('trips')
    .select('id, name, kode_trip, slug, departure, harga_jual, price, public_price, quota, status, trip_docs_link, visa_pdf_syarat_url')
    .order('departure', { ascending: true });
  const open = (allTrips || []).filter((t) => /open\s*selling/i.test(t.status || ''));
  const openIds = open.map((t) => t.id);
  const soldMap = {};
  for (let i = 0; i < openIds.length; i += 100) {
    const { data: pax } = await svc.from('trip_passengers').select('trip_id, transfer_status, refund_status').in('trip_id', openIds.slice(i, i + 100));
    for (const p of (pax || [])) {
      if (p.transfer_status === 'transferred' || p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
      soldMap[p.trip_id] = (soldMap[p.trip_id] || 0) + 1;
    }
  }
  const trips = open.map((t) => ({
    id: t.id, kode_trip: t.kode_trip || '', name: t.name || '', departure: t.departure || null,
    price: Number(t.public_price) || Number(t.harga_jual) || Number(t.price) || 0,
    quota: t.quota || 0, seat_left: Math.max((t.quota || 0) - (soldMap[t.id] || 0), 0),
    webUrl: `${domain}/trip/${t.slug || t.id}`,
    pdf: t.trip_docs_link || t.visa_pdf_syarat_url || null,
  })).filter((t) => t.seat_left > 0);
  return { ok: true, trips };
}

// ---- Trip open selling LINTAS-BRAND (TEONE + Khasanah) — dipakai portal Mitra & TL ----
// Tiap trip ditandai `brand` + webUrl ke domain brand-nya. `currentBrand` dikirim
// supaya UI bisa memutuskan tombol WA (generator WA baca DB brand aktif saja).
export async function getOpenSellingTripsAllBrands() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const currentBrand = getBrandCode();
  const perBrand = await Promise.all(BRAND_CODES.map((code) => openSellingForBrand(code).catch(() => [])));
  const trips = perBrand.flat()
    .sort((a, b) => String(a.departure || '9999-12-31').localeCompare(String(b.departure || '9999-12-31')));
  return { ok: true, currentBrand, trips };
}

// ---- Portal mitra: trip open selling ----
export async function getOpenTripsForMitra() {
  const supabase = createClient();
  try {
    const { data: trips } = await supabase
      .from('trips')
      .select('id, name, kode_trip, departure, harga_jual, price, quota, seat_left, status, visa_pdf_syarat_url, trip_docs_link, fee_category')
      .order('departure', { ascending: true });
    const open = (trips || []).filter((t) => /open\s*selling/i.test(t.status || ''));
    // hitung sisa seat riil dari peserta aktif
    const ids = open.map((t) => t.id);
    let soldMap = {};
    if (ids.length) {
      const { data: pax } = await supabase.from('trip_passengers').select('trip_id, transfer_status, refund_status').in('trip_id', ids);
      for (const p of pax || []) {
        if (p.transfer_status === 'transferred' || p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
        soldMap[p.trip_id] = (soldMap[p.trip_id] || 0) + 1;
      }
    }
    return { ok: true, trips: open.map((t) => ({
      id: t.id, name: t.name, kode_trip: t.kode_trip, departure: t.departure,
      price: t.harga_jual || t.price || 0, quota: t.quota || 0,
      seat_left: Math.max((t.quota || 0) - (soldMap[t.id] || 0), 0),
      pdf: t.trip_docs_link || t.visa_pdf_syarat_url || null,
    })) };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}
