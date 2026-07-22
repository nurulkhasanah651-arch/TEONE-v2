'use server';

// AUDIT TAGIHAN — jaring pengaman finance.
// Menghitung ULANG tagihan tiap peserta LANGSUNG dari price_breakdown Master Trip,
// lalu membandingkannya dgn angka yg dipakai sistem (price_paid). Kalau beda -> ada yg salah.
//
// Latar: pernah terjadi price_paid terisi nominal DP / harga land tour / total pembayaran,
// sehingga invoice menagih jauh di bawah harga asli TANPA ada yg curiga (baris invoice
// tetap menjumlah ke total, karena "Paket Tour" dihitung mundur dari price_paid).
// Halaman ini membuat selisih semacam itu kelihatan sejak awal.
// Path: lib/actions/billing-audit.js

import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { mainExpectedPerPassenger, visaPriceFor, isKhasanahBrand } from '@/lib/utils/price-breakdown';
import { isAddonPayment, POKOK_MILESTONES, STD_PAYMENT_TYPES } from '@/lib/utils/payment-types';
import { assertStaff } from '@/lib/auth/require-staff';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const n = (v) => Number(v || 0);

export async function getBillingAudit(opts = {}) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error }; }

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  const brand = (() => { try { return currentBrandCode(); } catch { return ''; } })();
  const isKh = isKhasanahBrand(brand);

  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, departure, status, price_breakdown')
    .not('departure', 'is', null)
    .order('departure', { ascending: true });

  const aktif = (trips || []).filter((t) => !['cancelled'].includes(t.status));
  if (!aktif.length) return { ok: true, trips: [], ringkas: kosong() };

  const tripIds = aktif.map((t) => t.id);
  const { data: pax } = await db.from('trip_passengers')
    .select('id, trip_id, customer_id, room_type, age_type, price_paid, discount_amount, include_visa, visa_ready, include_asuransi, visa_type')
    .in('trip_id', tripIds);

  const paxIds = (pax || []).map((p) => p.id);
  const custIds = [...new Set((pax || []).map((p) => p.customer_id).filter(Boolean))];

  const [{ data: pays }, { data: custs }] = await Promise.all([
    paxIds.length ? db.from('participant_payments').select('passenger_id, type, amount, is_addon').in('passenger_id', paxIds) : { data: [] },
    custIds.length ? db.from('customers').select('id, name').in('id', custIds) : { data: [] },
  ]);

  const namaOf = Object.fromEntries((custs || []).map((c) => [c.id, c.name || '']));
  const bayarOf = {};
  for (const p of (pays || [])) (bayarOf[p.passenger_id] = bayarOf[p.passenger_id] || []).push(p);

  const tripOut = [];
  for (const t of aktif) {
    const bd = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};
    const anggota = (pax || []).filter((p) => p.trip_id === t.id);
    if (!anggota.length) continue;

    const baris = anggota.map((p) => {
      // 1) SEHARUSNYA — dihitung ulang dari Master Trip (bukan dari price_paid)
      const hargaMaster = n(mainExpectedPerPassenger(p, bd, brand));
      const diskon = n(p.discount_amount);
      const pp = (bayarOf[p.id] || []);

      // visa/asuransi opt-in (TEONE). Khasanah: sudah masuk hargaMaster.
      const bayarTypes = new Set(pp.map((x) => x.type));
      const visaOpt = (!isKh && (p.include_visa && !p.visa_ready || bayarTypes.has('Visa'))) ? n(visaPriceFor(bd, p.visa_type)) : 0;
      const asrOpt = (!isKh && (p.include_asuransi || bayarTypes.has('Asuransi'))) ? n(bd.asuransi) : 0;

      // biaya tambahan custom CS (nominalnya = yg tercatat dibayar utk jenis itu)
      const addon = pp.filter((x) => !STD_PAYMENT_TYPES.includes(x.type) && isAddonPayment(x))
                      .reduce((s, x) => s + n(x.amount), 0);

      const seharusnya = Math.max(hargaMaster + visaOpt + asrOpt + addon - diskon, 0);

      // 2) DIPAKAI SISTEM — persis rumus invoice (price_paid kalau diisi, else hargaMaster)
      const pokokGross = n(p.price_paid) > 0 ? n(p.price_paid) : hargaMaster;
      const dipakaiSistem = Math.max(pokokGross + visaOpt + asrOpt + addon - diskon, 0);

      // 3) UANG MASUK
      const cicilanPokok = pp.filter((x) => POKOK_MILESTONES.includes(x.type)
                              || (isKh && (x.type === 'Visa' || x.type === 'Asuransi'))
                              || (!STD_PAYMENT_TYPES.includes(x.type) && isAddonPayment(x) === false))
                             .reduce((s, x) => s + n(x.amount), 0);
      const totalMasuk = pp.reduce((s, x) => s + n(x.amount), 0);

      const selisih = seharusnya - dipakaiSistem;   // >0 = sistem KURANG tagih
      return {
        paxId: p.id, nama: namaOf[p.customer_id] || `Peserta #${p.id}`,
        roomType: p.room_type || '-', ageType: p.age_type || 'adult',
        hargaMaster, visaOpt, asrOpt, addon, diskon,
        seharusnya, dipakaiSistem, selisih,
        pricePaid: n(p.price_paid), tanpaHarga: hargaMaster === 0,
        dibayar: totalMasuk, cicilanPokok,
        sisa: Math.max(seharusnya - totalMasuk, 0),
      };
    });

    const bermasalah = baris.filter((b) => b.selisih !== 0 || b.tanpaHarga);
    tripOut.push({
      id: t.id, kode: t.kode_trip || t.id, nama: t.name || '', departure: t.departure,
      pax: baris.length,
      seharusnya: baris.reduce((s, b) => s + b.seharusnya, 0),
      dipakaiSistem: baris.reduce((s, b) => s + b.dipakaiSistem, 0),
      selisih: baris.reduce((s, b) => s + b.selisih, 0),
      dibayar: baris.reduce((s, b) => s + b.dibayar, 0),
      sisa: baris.reduce((s, b) => s + b.sisa, 0),
      jmlBermasalah: bermasalah.length,
      tanpaHarga: baris.filter((b) => b.tanpaHarga).length,
      baris,
    });
  }

  const ringkas = {
    totalTrip: tripOut.length,
    totalPax: tripOut.reduce((s, t) => s + t.pax, 0),
    paxBermasalah: tripOut.reduce((s, t) => s + t.jmlBermasalah, 0),
    nilaiSelisih: tripOut.reduce((s, t) => s + t.selisih, 0),
    totalSeharusnya: tripOut.reduce((s, t) => s + t.seharusnya, 0),
    totalDibayar: tripOut.reduce((s, t) => s + t.dibayar, 0),
    totalSisa: tripOut.reduce((s, t) => s + t.sisa, 0),
    tripTanpaHarga: tripOut.filter((t) => t.tanpaHarga > 0).length,
  };
  return { ok: true, brand, trips: tripOut, ringkas };
}

function kosong() {
  return { totalTrip: 0, totalPax: 0, paxBermasalah: 0, nilaiSelisih: 0, totalSeharusnya: 0, totalDibayar: 0, totalSisa: 0, tripTanpaHarga: 0 };
}

// SAMAKAN HARGA PESERTA KE MASTER TRIP — set price_paid = harga master (kamar + biaya
// wajib) utk peserta yang belum sama, sehingga "Penyesuaian harga khusus" hilang di invoice.
// Owner-triggered (halaman Audit Tagihan: owner/accounting/manager). TIDAK menyentuh
// participant_payments (pembayaran yg sudah masuk) maupun discount_amount (diskon terpisah).
// CATATAN: menimpa harga khusus/nego jadi harga master — pakai hanya kalau memang tak ada nego.
export async function syncTripPriceToMaster(tripId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance'); if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih' };

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };
  const brand = (() => { try { return currentBrandCode(); } catch { return ''; } })();

  const { data: t } = await db.from('trips').select('id, price_breakdown').eq('id', tripId).maybeSingle();
  if (!t) return { error: 'Trip tidak ditemukan' };
  const bd = (t.price_breakdown && typeof t.price_breakdown === 'object') ? t.price_breakdown : {};

  const { data: pax } = await db.from('trip_passengers').select('id, room_type, age_type, price_paid').eq('trip_id', tripId);
  let updated = 0, skipped = 0, sudahSama = 0;
  for (const p of (pax || [])) {
    const master = n(mainExpectedPerPassenger(p, bd, brand));
    if (master <= 0) { skipped++; continue; }          // harga master kosong → jangan set 0
    if (n(p.price_paid) === master) { sudahSama++; continue; }
    const { error } = await db.from('trip_passengers').update({ price_paid: master }).eq('id', p.id);
    if (!error) updated++;
  }
  return { ok: true, updated, skipped, sudahSama };
}
