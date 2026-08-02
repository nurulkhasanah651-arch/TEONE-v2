'use server';

// Pembukuan per Trip + PPh Badan (Accounting). Menggabungkan:
//   PEMASUKAN (omzet peserta)  = trip_passengers.price_paid peserta aktif (fallback harga master).
//   BIAYA VENDOR (HPP)         = trip_finance_items.total_amount (semua item_type='hpp').
//   LABA                       = omzet − biaya vendor.
//   PPh BADAN                  = 22% × laba kena pajak (per tahun pajak, laba rugi antar-trip saling tutup).
// Tujuan: dokumen pembukuan rapi per trip untuk pemeriksaan pajak. Owner/accounting saja.
// Path: lib/actions/bookkeeping.js
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { mainExpectedPerPassenger } from '@/lib/utils/price-breakdown';

const PPH_BADAN_RATE = 0.22; // Tarif umum PPh Badan (bisa diubah bila fasilitas Pasal 31E/PP-23 dipakai).

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/accounting'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, db };
}
function isActive(p) { return p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund'; }
const num = (v) => Number(v) || 0;

// Ringkasan pembukuan semua trip, dikelompokkan per TAHUN PAJAK (tahun keberangkatan).
export async function getBookkeepingYears() {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  let brand = 'teone'; try { brand = currentBrandCode(); } catch {}

  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, departure, status, price_breakdown');
  const active = (trips || []).filter((t) => !['cancelled'].includes(t.status));
  const tripById = {}; for (const t of active) tripById[t.id] = t;
  const ids = active.map((t) => t.id);
  if (!ids.length) return { ok: true, years: [], rate: PPH_BADAN_RATE };

  // Omzet peserta aktif (price_paid, fallback harga master trip) + jumlah pax.
  const omzetByTrip = {}; const paxByTrip = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('trip_passengers')
      .select('id, trip_id, room_type, age_type, price_paid, discount_amount, transfer_status, refund_status')
      .order('id', { ascending: true }).range(from, from + 999);
    const rows = data || [];
    for (const p of rows) {
      if (!tripById[p.trip_id] || !isActive(p)) continue;
      const bd = (tripById[p.trip_id].price_breakdown && typeof tripById[p.trip_id].price_breakdown === 'object') ? tripById[p.trip_id].price_breakdown : {};
      const gross = num(p.price_paid) > 0 ? num(p.price_paid) : num(mainExpectedPerPassenger(p, bd, brand));
      const nilai = Math.max(gross - num(p.discount_amount), 0);
      omzetByTrip[p.trip_id] = (omzetByTrip[p.trip_id] || 0) + nilai;
      paxByTrip[p.trip_id] = (paxByTrip[p.trip_id] || 0) + 1;
    }
    if (rows.length < 1000) break;
  }

  // Biaya vendor (HPP) per trip + jumlah item.
  const biayaByTrip = {}; const nItemByTrip = {};
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('trip_finance_items')
      .select('trip_id, total_amount').order('id', { ascending: true }).range(from, from + 999);
    const rows = data || [];
    for (const r of rows) {
      if (!tripById[r.trip_id]) continue;
      biayaByTrip[r.trip_id] = (biayaByTrip[r.trip_id] || 0) + num(r.total_amount);
      nItemByTrip[r.trip_id] = (nItemByTrip[r.trip_id] || 0) + 1;
    }
    if (rows.length < 1000) break;
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const rows = active.map((t) => {
    const omzet = omzetByTrip[t.id] || 0;
    const biaya = biayaByTrip[t.id] || 0;
    const laba = omzet - biaya;
    const y = t.departure ? new Date(t.departure).getFullYear() : null;
    const m = t.departure ? new Date(t.departure).getMonth() : null;
    return {
      id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '',
      departure: t.departure || null, depFmt: t.departure ? `${new Date(t.departure).getDate()} ${MONTHS[m]} ${y}` : '—',
      year: y, pax: paxByTrip[t.id] || 0, nItem: nItemByTrip[t.id] || 0,
      omzet, biaya, laba, pph: Math.round(Math.max(laba, 0) * PPH_BADAN_RATE),
    };
  });

  // Kelompok per tahun pajak. PPh tahunan = 22% × max(total laba tahun itu, 0).
  const byYear = {};
  for (const r of rows) {
    const key = r.year || 0;
    (byYear[key] = byYear[key] || []).push(r);
  }
  const years = Object.keys(byYear).map((k) => {
    const list = byYear[k].sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')));
    const omzet = list.reduce((s, r) => s + r.omzet, 0);
    const biaya = list.reduce((s, r) => s + r.biaya, 0);
    const laba = omzet - biaya;
    return {
      year: Number(k) || null, label: Number(k) ? String(k) : 'Tanpa Tanggal',
      trips: list, omzet, biaya, laba,
      pph: Math.round(Math.max(laba, 0) * PPH_BADAN_RATE),
      nIncomplete: list.filter((r) => r.nItem === 0).length,
    };
  }).sort((a, b) => (b.year || 0) - (a.year || 0));

  return { ok: true, years, rate: PPH_BADAN_RATE };
}

// Detail pembukuan 1 trip: rincian pemasukan peserta + biaya vendor (dokumen).
export async function getTripBookkeeping(tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!tripId) return { error: 'Trip tidak valid' };
  let brand = 'teone'; try { brand = currentBrandCode(); } catch {}

  const { data: t } = await db.from('trips')
    .select('id, kode_trip, name, departure, return_date, price_breakdown, status').eq('id', tripId).maybeSingle();
  if (!t) return { error: 'Trip tidak ditemukan' };
  const bd = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};

  // Peserta (pemasukan).
  const { data: paxRaw } = await db.from('trip_passengers')
    .select('id, customer_id, room_type, age_type, price_paid, discount_amount, transfer_status, refund_status').eq('trip_id', tripId).range(0, 4999);
  const pax = (paxRaw || []).filter(isActive);
  const paxIds = pax.map((p) => p.id);

  // Nama peserta dari tabel customers.
  const custName = {};
  const custIds = [...new Set(pax.map((p) => p.customer_id).filter(Boolean))];
  for (let i = 0; i < custIds.length; i += 300) {
    const { data } = await db.from('customers').select('id, name').in('id', custIds.slice(i, i + 300));
    for (const c of (data || [])) custName[c.id] = c.name || '';
  }

  // Uang masuk peserta (non-addon).
  const paidByPax = {};
  for (let i = 0; i < paxIds.length; i += 300) {
    const idsChunk = paxIds.slice(i, i + 300);
    let from = 0;
    for (;;) {
      const { data } = await db.from('participant_payments')
        .select('passenger_id, amount, is_addon').in('passenger_id', idsChunk).range(from, from + 999);
      const rows = data || [];
      for (const r of rows) { if (r.is_addon === true) continue; paidByPax[r.passenger_id] = (paidByPax[r.passenger_id] || 0) + num(r.amount); }
      if (rows.length < 1000) break;
      from += 1000;
    }
  }

  const peserta = pax.map((p) => {
    const gross = num(p.price_paid) > 0 ? num(p.price_paid) : num(mainExpectedPerPassenger(p, bd, brand));
    const nilai = Math.max(gross - num(p.discount_amount), 0);
    return { id: p.id, nama: custName[p.customer_id] || `Pax #${p.id}`, room: p.room_type || '', nilai, dibayar: paidByPax[p.id] || 0 };
  }).sort((a, b) => b.nilai - a.nilai);
  const omzet = peserta.reduce((s, r) => s + r.nilai, 0);
  const cashIn = peserta.reduce((s, r) => s + r.dibayar, 0);

  // Biaya vendor (HPP).
  const { data: fitems } = await db.from('trip_finance_items')
    .select('id, category, component, vendor_name, total_amount, payment_status, invoice_url, dp_amount, payoff_amount, notes')
    .eq('trip_id', tripId).order('sort_order', { ascending: true }).order('id', { ascending: true });
  const vendor = (fitems || []).map((f) => ({
    id: f.id, kategori: f.category || '—', komponen: f.component || '', vendor: f.vendor_name || '',
    jumlah: num(f.total_amount), status: f.payment_status || '', invoiceUrl: f.invoice_url || '', notes: f.notes || '',
  }));
  const biaya = vendor.reduce((s, r) => s + r.jumlah, 0);

  const laba = omzet - biaya;
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const depFmt = t.departure ? `${new Date(t.departure).getDate()} ${MONTHS[new Date(t.departure).getMonth()]} ${new Date(t.departure).getFullYear()}` : '—';

  return {
    ok: true, rate: PPH_BADAN_RATE,
    trip: { id: t.id, kode: t.kode_trip || `#${t.id}`, name: t.name || '', depFmt, year: t.departure ? new Date(t.departure).getFullYear() : null },
    peserta, vendor,
    omzet, cashIn, biaya, laba, pph: Math.round(Math.max(laba, 0) * PPH_BADAN_RATE),
  };
}
