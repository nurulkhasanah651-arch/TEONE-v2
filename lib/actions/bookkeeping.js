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
import { getExpectedAndPaidForPassenger } from '@/lib/actions/invoices';
import { getTourAddonTemplatesPublic } from '@/lib/shop/data';
import { detectTourAddon } from '@/lib/utils/umroh-plus';

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
const yearOf = (d) => { if (!d) return null; const x = new Date(d); return isNaN(x) ? null : x.getFullYear(); };

// Ambil semua baris tabel dgn paginasi .range() (aman dari cap 1000 PostgREST).
async function fetchAll(db, table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from(table).select(cols).order('id', { ascending: true }).range(from, from + 999);
    const rows = data || []; out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

// Biaya operasional kantor per TAHUN → mengurangi laba kena pajak (PPh dihitung tahunan).
//   gaji   : payroll_periods.total_gross (per period_year)
//   ads    : ads_entries.spend (per tahun tanggal)
//   refund : refunds.refund_amount yang sudah disetujui (per tahun)
//   lain   : accounting_entries type='out' (biaya kantor manual)
const REFUND_DONE = ['approved', 'completed', 'done', 'processed', 'transferred'];
async function fetchOfficeCostsByYear(db) {
  const out = {};
  const add = (yr, field, amt) => {
    if (!yr || !(amt > 0)) return; const y = String(yr);
    out[y] = out[y] || { gaji: 0, ads: 0, refund: 0, lain: 0, total: 0 };
    out[y][field] += amt; out[y].total += amt;
  };
  try { for (const r of await fetchAll(db, 'payroll_periods', 'id, period_year, total_gross')) add(r.period_year, 'gaji', num(r.total_gross)); } catch {}
  try { for (const r of await fetchAll(db, 'ads_entries', 'id, date, spend')) add(yearOf(r.date), 'ads', num(r.spend)); } catch {}
  try { for (const r of await fetchAll(db, 'refunds', 'id, refund_amount, status, approved_at, created_at')) { if (!REFUND_DONE.includes(String(r.status || '').toLowerCase())) continue; add(yearOf(r.approved_at || r.created_at), 'refund', num(r.refund_amount)); } } catch {}
  try { for (const r of await fetchAll(db, 'accounting_entries', 'id, date, amount, type')) { if (String(r.type) !== 'out') continue; add(yearOf(r.date), 'lain', num(r.amount)); } } catch {}
  return out;
}

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

  // Biaya operasional kantor per tahun (refund, gaji, ads, biaya kantor lain).
  const office = await fetchOfficeCostsByYear(db);

  // Kelompok per TAHUN PAJAK. PPh dihitung TAHUNAN: 22% × (laba kotor trip − biaya kantor).
  const byYear = {};
  for (const r of rows) { const key = r.year || 0; (byYear[key] = byYear[key] || []).push(r); }
  for (const y of Object.keys(office)) { if (!byYear[y]) byYear[y] = []; } // tahun yg hanya punya biaya kantor tetap tampil

  const years = Object.keys(byYear).map((k) => {
    const list = byYear[k].sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')));
    const omzet = list.reduce((s, r) => s + r.omzet, 0);
    const biaya = list.reduce((s, r) => s + r.biaya, 0);
    const labaTrip = omzet - biaya;                         // laba kotor operasional trip
    const oc = office[k] || { gaji: 0, ads: 0, refund: 0, lain: 0, total: 0 };
    const labaBersih = labaTrip - oc.total;                 // laba kena pajak (setelah biaya kantor)
    return {
      year: Number(k) || null, label: Number(k) ? String(k) : 'Tanpa Tanggal',
      trips: list, omzet, biaya, labaTrip, office: oc, labaBersih,
      pph: Math.round(Math.max(labaBersih, 0) * PPH_BADAN_RATE),
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

  // Uang masuk peserta (non-addon) + jumlah bukti bayar (file di Google Drive).
  const paidByPax = {}; let buktiCount = 0;
  for (let i = 0; i < paxIds.length; i += 300) {
    const idsChunk = paxIds.slice(i, i + 300);
    let from = 0;
    for (;;) {
      const { data } = await db.from('participant_payments')
        .select('passenger_id, amount, is_addon, drive_file_id').in('passenger_id', idsChunk).range(from, from + 999);
      const rows = data || [];
      for (const r of rows) {
        if (r.drive_file_id) buktiCount += 1;
        if (r.is_addon === true) continue;
        paidByPax[r.passenger_id] = (paidByPax[r.passenger_id] || 0) + num(r.amount);
      }
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
    peserta, vendor, buktiCount,
    omzet, cashIn, biaya, laba, pph: Math.round(Math.max(laba, 0) * PPH_BADAN_RATE),
  };
}

// Susun rincian baris invoice dari hasil pricing engine 1 peserta (sama komponen dgn invoice web).
function buildInvoiceItems(s, { isKh, addon }) {
  const items = [];
  const roomPrice = num(s.roomPrice);
  const isInfant = String(s.roomType || '').toLowerCase().includes('infant');
  if (isKh && addon && addon.amount > 0 && roomPrice > 0 && !isInfant) {
    items.push({ label: `Paket Umroh · ${s.roomType || ''}`.trim(), amount: Math.max(roomPrice - addon.amount, 0) });
    items.push({ label: `Paket Tour ${addon.label}`, amount: addon.amount });
  } else if (roomPrice > 0) {
    items.push({ label: isKh ? `Paket Umroh · ${s.roomType || ''}`.trim() : `Paket Tour · ${s.roomType || ''}`.trim(), amount: roomPrice });
  }
  const add = (label, v) => { if (num(v) > 0) items.push({ label, amount: num(v) }); };
  add('Tiket Pesawat Domestik', s.flight);
  add('Bagasi Domestik', s.baggage);
  add('Harga Dasar', s.baseFee);
  add('Tipping & Service', s.tips);
  add('City Tax', s.cityTax);
  add('Perlengkapan', s.perlengkapan);
  add('Asuransi & Tips Local Guide', s.asuransiTipsLocalGuide);
  add('Handling & Perlengkapan', s.handlingPerlengkapan);
  add('Visa & Asuransi', s.visaAsuransi);
  add('Visa', num(s.visaExpected) || num(s.visaPokok));
  add('Asuransi', num(s.asuransiExpected) || num(s.asuransiPokok));
  for (const it of (s.addonItems || [])) add(it.type || 'Biaya Tambahan', it.amount);
  if (num(s.discount) > 0) items.push({ label: 'Diskon', amount: -num(s.discount), detail: 'potongan' });
  if (num(s.ppn) > 0) items.push({ label: `PPN 1,1% (Paket Tour${s.ppnLabel ? ' ' + s.ppnLabel : ''})`, amount: num(s.ppn) });
  return items;
}

// Data lengkap SETIAP invoice yang pernah dikirim (per milestone: DP, P1, Pelunasan, Visa, dst)
// untuk ZIP PDF — format setara invoice web: header PT, rincian, tagihan invoice ini, riwayat
// bayar + tanggal, total & sisa. Tiap baris tabel `invoices` = 1 dokumen (arsip permanen).
export async function buildTripInvoices(tripId) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { db } = g;
  if (!tripId) return { error: 'Trip tidak valid' };
  let brand = 'teone'; try { brand = currentBrandCode(); } catch {}
  const isKh = brand === 'khasanah';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const fmtD = (d) => { if (!d) return '—'; const x = new Date(d); return isNaN(x) ? '—' : `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; };
  const keyD = (d) => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? '' : x.toISOString(); };

  const { data: t } = await db.from('trips')
    .select('id, kode_trip, name, departure, return_date, destination, price_breakdown').eq('id', tripId).maybeSingle();
  if (!t) return { error: 'Trip tidak ditemukan' };

  // Header perusahaan (PT) — dari tabel `brands` (sumber sama dgn invoice web), per brand.
  const COMPANY_COLS = 'name, company_address, company_phone, company_email, company_npwp, bank_name, bank_account_no, bank_account_name, invoice_footer_note';
  let company = {};
  try { const { data } = await db.from('brands').select(COMPANY_COLS).eq('code', brand).maybeSingle(); company = data || {}; } catch {}
  if (!company.name) { try { const { data } = await db.from('brands').select(COMPANY_COLS).eq('is_default', true).maybeSingle(); company = data || {}; } catch {} }
  if (!company.name) { try { const { data } = await db.from('brands').select(COMPANY_COLS).limit(1).maybeSingle(); company = data || {}; } catch {} }

  // Umroh Plus (Khasanah) → pecah paket (hanya invoice 1 peserta, bukan keluarga).
  let addon = null;
  if (isKh) { try { const tpl = await getTourAddonTemplatesPublic(); addon = detectTourAddon(t.name, tpl); } catch {} }

  // Semua invoice yang pernah dibuat untuk trip ini (arsip per milestone).
  const { data: invRows } = await db.from('invoices')
    .select('id, invoice_no, milestone, amount, passenger_id, covers_passenger_ids, is_family_invoice, customer_name, customer_phone, status, due_date, paid_at, created_at')
    .eq('trip_id', tripId).order('created_at', { ascending: true }).order('id', { ascending: true });

  // Cache billing per peserta (dipakai ulang lintas invoice peserta yg sama).
  const billCache = {};
  const paxBill = async (pid) => { if (billCache[pid] !== undefined) return billCache[pid]; let s = {}; try { s = await getExpectedAndPaidForPassenger(db, tripId, pid); } catch { s = {}; } billCache[pid] = s; return s; };
  const aggBill = (list) => {
    const F = ['roomPrice', 'tips', 'cityTax', 'flight', 'baggage', 'baseFee', 'perlengkapan', 'asuransiTipsLocalGuide', 'handlingPerlengkapan', 'visaAsuransi', 'visaExpected', 'asuransiExpected', 'visaPokok', 'asuransiPokok', 'ppn', 'expectedTotal', 'pokokPaid', 'addonPaid', 'discount'];
    const a = {}; for (const f of F) a[f] = 0; a.addonItems = []; a.ppnLabel = ''; a.roomType = '';
    for (const s of list) { for (const f of F) a[f] += num(s[f]); if (s.ppnLabel && !a.ppnLabel) a.ppnLabel = s.ppnLabel; if (s.roomType && !a.roomType) a.roomType = s.roomType; for (const it of (s.addonItems || [])) a.addonItems.push(it); }
    return a;
  };

  // Riwayat pembayaran (invoice_payments) per invoice.
  const payByInv = {};
  const invIds = (invRows || []).map((r) => r.id);
  for (let i = 0; i < invIds.length; i += 300) {
    const { data } = await db.from('invoice_payments')
      .select('invoice_id, amount, payment_date, payment_method, status, approved_at, created_at').in('invoice_id', invIds.slice(i, i + 300));
    for (const r of (data || [])) (payByInv[r.invoice_id] = payByInv[r.invoice_id] || []).push(r);
  }

  const invoices = [];
  let idx = 0;
  for (const inv of (invRows || [])) {
    idx += 1;
    const ids = (inv.is_family_invoice && Array.isArray(inv.covers_passenger_ids) && inv.covers_passenger_ids.length)
      ? inv.covers_passenger_ids : (inv.passenger_id ? [inv.passenger_id] : []);
    const bills = [];
    for (const pid of ids) bills.push(await paxBill(pid));
    const agg = aggBill(bills);
    const family = ids.length > 1;
    const items = buildInvoiceItems(agg, { isKh, addon: family ? null : addon });
    const total = num(agg.expectedTotal);
    const dibayar = num(agg.pokokPaid) + num(agg.addonPaid);
    const sisa = Math.max(total - dibayar, 0);
    const pays = (payByInv[inv.id] || [])
      .map((r) => ({ tglFmt: fmtD(r.payment_date || r.approved_at || r.created_at), sortKey: keyD(r.payment_date || r.approved_at || r.created_at), label: (r.payment_method || 'Transfer') + (r.status && r.status !== 'verified' ? ` (${r.status})` : ''), amount: num(r.amount) }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
    invoices.push({
      idx, invoiceNo: inv.invoice_no || `${t.kode_trip || t.id}-${inv.id}`,
      milestone: inv.milestone || '', tanggalFmt: fmtD(inv.created_at), dueFmt: inv.due_date ? fmtD(inv.due_date) : '', paidFmt: inv.paid_at ? fmtD(inv.paid_at) : '',
      statusLabel: inv.status === 'paid' ? 'PAID' : (inv.status || 'sent').toUpperCase(),
      tagihanIni: num(inv.amount),
      peserta: { nama: inv.customer_name || bills[0]?.name || 'Peserta', phone: inv.customer_phone || '', room: agg.roomType || '' },
      items, total, dibayar, sisa, lunas: total > 0 && sisa === 0, payments: pays,
    });
  }

  return {
    ok: true,
    company: {
      name: company.name || (isKh ? 'Khasanah Travel' : 'Traveling Eropa'),
      address: company.company_address || '', phone: company.company_phone || '', email: company.company_email || '',
      npwp: company.company_npwp || '', bankName: company.bank_name || '', bankNo: company.bank_account_no || '', bankHolder: company.bank_account_name || '',
      footer: company.invoice_footer_note || '',
    },
    trip: { kode: t.kode_trip || `#${t.id}`, name: t.name || '', destination: t.destination || '', departureFmt: fmtD(t.departure), returnFmt: t.return_date ? fmtD(t.return_date) : '' },
    invoices,
  };
}
