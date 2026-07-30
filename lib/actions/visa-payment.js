'use server';

// Payment Visa (Accounting) — tracker pembayaran APPLY VISA per peserta.
// Nama & status visa diambil OTOMATIS (master trip + tab Visa). Field pembayaran
// (embassy, fee embassy, fee TLS/VFS, tgl transfer, PIC) disimpan di visa_apply_payments.
// Path: lib/actions/visa-payment.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { deriveVisaStage } from '@/lib/utils/visa-constants';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const numOrNull = (v) => { if (v === '' || v == null) return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; };
const clean = (v) => { const s = (v == null ? '' : String(v)).trim(); return s || null; };

export async function getVisaApplyList() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/accounting'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };

  const { data: trips } = await db.from('trips')
    .select('id, kode_trip, name, departure, status, visa_country, visa_doc_template')
    .not('departure', 'is', null).order('departure', { ascending: true });
  const active = (trips || []).filter((t) => !['completed', 'cancelled'].includes(t.status));
  const tripById = Object.fromEntries(active.map((t) => [t.id, t]));
  const tripIds = active.map((t) => t.id);
  if (!tripIds.length) return { ok: true, rows: [] };

  // Ambil SEMUA peserta trip aktif dulu (butuh id utk cek pembayaran visa).
  let pax = [];
  for (let i = 0; i < tripIds.length; i += 100) {
    const { data } = await db.from('trip_passengers')
      .select('id, trip_id, customer_id, include_visa, visa_ready, visa_result, visa_docs, visa_biometric_date, visa_type, transfer_status, refund_status')
      .in('trip_id', tripIds.slice(i, i + 100));
    pax = pax.concat(data || []);
  }
  if (!pax.length) return { ok: true, rows: [] };

  // Deteksi peserta yang SUDAH BAYAR VISA (peserta lama yg diinput lewat pembayaran,
  // walau checkbox include_visa belum di-set). type='Visa' & belum transfer & amount>0.
  const allIds = pax.map((p) => p.id);
  const payByPax = {};
  for (let i = 0; i < allIds.length; i += 500) {
    const { data: pays } = await db.from('participant_payments').select('passenger_id, amount, is_transferred').eq('type', 'Visa').in('passenger_id', allIds.slice(i, i + 500));
    for (const r of (pays || [])) { if (r.is_transferred !== true && Number(r.amount) > 0) payByPax[r.passenger_id] = true; }
  }
  // Butuh apply visa = (checkbox include_visa ON  ATAU  sudah ada pembayaran visa),
  // bukan visa_ready, dan bukan peserta yang sudah pindah trip / refund.
  pax = pax.filter((p) => (p.include_visa === true || payByPax[p.id] === true)
    && p.visa_ready !== true
    && p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund');
  if (!pax.length) return { ok: true, rows: [] };

  const paxIds = pax.map((p) => p.id);
  const custIds = [...new Set(pax.map((p) => p.customer_id).filter(Boolean))];
  const nameOf = {}; const applyByPax = {};
  for (let i = 0; i < custIds.length; i += 500) {
    const { data } = await db.from('customers').select('id, name').in('id', custIds.slice(i, i + 500));
    for (const c of (data || [])) nameOf[c.id] = c.name || '';
  }
  for (let i = 0; i < paxIds.length; i += 500) {
    const chunk = paxIds.slice(i, i + 500);
    const { data: ap } = await db.from('visa_apply_payments').select('*').in('passenger_id', chunk);
    for (const r of (ap || [])) applyByPax[r.passenger_id] = r;
  }

  const rows = pax.map((p) => {
    const t = tripById[p.trip_id] || {};
    const stage = deriveVisaStage({ ...p, visaPaid: payByPax[p.id] === true }, t.visa_doc_template || []);
    const ap = applyByPax[p.id] || {};
    let monthKey = '', monthLabel = '';
    if (t.departure) { const d = new Date(t.departure); monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; monthLabel = `${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`; }
    return {
      passengerId: p.id, tripId: p.trip_id,
      kode: t.kode_trip || p.trip_id, tripName: t.name || '', departure: t.departure || null, monthKey, monthLabel,
      nama: nameOf[p.customer_id] || `Peserta #${p.id}`,
      statusKey: stage.key, statusLabel: stage.label, statusColor: stage.color,
      embassy: ap.embassy != null ? ap.embassy : (t.visa_country || ''),
      fee_embassy_amount: ap.fee_embassy_amount != null ? Number(ap.fee_embassy_amount) : '',
      fee_embassy_pic: ap.fee_embassy_pic || '',
      fee_tls_amount: ap.fee_tls_amount != null ? Number(ap.fee_tls_amount) : '',
      fee_tls_pic: ap.fee_tls_pic || '',
      fee_asuransi_amount: ap.fee_asuransi_amount != null ? Number(ap.fee_asuransi_amount) : '',
      fee_asuransi_pic: ap.fee_asuransi_pic || '',
      hasil_visa: ap.hasil_visa || (stage.key === 'approved' ? 'Approved' : stage.key === 'rejected' ? 'Ditolak' : ''),
      email_visa: ap.email_visa || '',
      tgl_transfer: ap.tgl_transfer || '',
      pic_transfer: ap.pic_transfer || '',
      refund_amount: ap.refund_amount != null ? Number(ap.refund_amount) : '',
      refund_asuransi_amount: ap.refund_asuransi_amount != null ? Number(ap.refund_asuransi_amount) : '',
      refund_date: ap.refund_date || '',
      refund_note: ap.refund_note || '',
      norek: ap.norek || '',
      keterangan: ap.keterangan || '',
      saved: !!applyByPax[p.id],
    };
  });
  // urut: trip (departure) lalu nama
  rows.sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')) || a.nama.localeCompare(b.nama));
  return { ok: true, rows };
}

export async function saveVisaApplyPayment(passengerId, form) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/accounting'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const pid = parseInt(passengerId); if (!pid) return { error: 'Peserta tidak valid' };

  const { data: p } = await db.from('trip_passengers').select('trip_id, customer_id').eq('id', pid).maybeSingle();
  const row = {
    passenger_id: pid,
    trip_id: p?.trip_id || null,
    embassy: clean(form.embassy),
    fee_embassy_amount: numOrNull(form.fee_embassy_amount) || 0,
    fee_embassy_pic: clean(form.fee_embassy_pic),
    fee_tls_amount: numOrNull(form.fee_tls_amount) || 0,
    fee_tls_pic: clean(form.fee_tls_pic),
    fee_asuransi_amount: numOrNull(form.fee_asuransi_amount) || 0,
    fee_asuransi_pic: clean(form.fee_asuransi_pic),
    hasil_visa: clean(form.hasil_visa),
    email_visa: clean(form.email_visa),
    tgl_transfer: clean(form.tgl_transfer),
    pic_transfer: clean(form.pic_transfer),
    refund_amount: numOrNull(form.refund_amount) || 0,
    refund_asuransi_amount: numOrNull(form.refund_asuransi_amount) || 0,
    refund_date: clean(form.refund_date),
    refund_note: clean(form.refund_note),
    norek: clean(form.norek),
    keterangan: clean(form.keterangan),
    updated_at: new Date().toISOString(),
    created_by: user.email || 'staff',
  };
  const { error } = await db.from('visa_apply_payments').upsert(row, { onConflict: 'passenger_id' });
  if (error) return { error: error.message };

  // Connect ke ACCOUNTING REAL per group: buat/-update HPP item "Visa" di trip_finance_items.
  // - Muncul sebagai HPP di proyeksi group (proyHpp).
  // - Kalau sudah transfer (tgl_transfer terisi) -> payment_status 'lunas' => masuk Real Cash Out.
  try { await syncVisaPaymentToHPP(db, pid, row, p?.customer_id || null); } catch (e) { console.error('[visa->hpp] gagal', e?.message); }

  revalidatePath('/accounting/payment-visa');
  revalidatePath('/accounting/groups');
  if (row.trip_id) revalidatePath(`/accounting/groups/${row.trip_id}`);
  return { ok: true, total: (row.fee_embassy_amount || 0) + (row.fee_tls_amount || 0) + (row.fee_asuransi_amount || 0) };
}

// Sinkron pembayaran visa (cash OUT ke kedutaan/vendor) -> HPP item di accounting real group.
// Net = (fee embassy + fee TLS + fee asuransi) − (refund + refund asuransi).
// Dipakai id peserta sebagai kunci (source='visa_payment', source_id=passenger) supaya idempoten.
async function syncVisaPaymentToHPP(db, pid, row, customerId) {
  const tripId = row.trip_id;
  if (!tripId) return;
  const net = (Number(row.fee_embassy_amount) || 0) + (Number(row.fee_tls_amount) || 0) + (Number(row.fee_asuransi_amount) || 0)
    - (Number(row.refund_amount) || 0) - (Number(row.refund_asuransi_amount) || 0);

  const sid = String(pid);
  const { data: existing } = await db.from('trip_finance_items')
    .select('id').eq('trip_id', tripId).eq('source', 'visa_payment').eq('source_id', sid).maybeSingle();

  // Kalau net <= 0 (belum ada nominal / full refund) -> hapus item biar tidak nyangkut.
  if (net <= 0) {
    if (existing) await db.from('trip_finance_items').delete().eq('id', existing.id);
    return;
  }

  let nama = `Peserta #${pid}`;
  if (customerId) {
    const { data: c } = await db.from('customers').select('name').eq('id', customerId).maybeSingle();
    if (c?.name) nama = c.name;
  }
  const transferred = !!clean(row.tgl_transfer);
  const payload = {
    trip_id: tripId,
    item_type: 'hpp',
    category: 'Visa',
    component: `Visa — ${nama}`,
    vendor_name: clean(row.embassy) || 'Kedutaan',
    total_amount: net,
    dp_paid: transferred ? net : 0,
    payment_status: transferred ? 'lunas' : 'proyeksi',
    transfer_date: clean(row.tgl_transfer) || null,
    source: 'visa_payment',
    source_id: sid,
    notes: `Auto-sync dari Payment Visa (peserta #${pid})`,
    updated_at: new Date().toISOString(),
  };
  if (existing) await db.from('trip_finance_items').update(payload).eq('id', existing.id);
  else await db.from('trip_finance_items').insert(payload);
}

// ═══ DAFTAR HARGA VISA (price list / template) ═══
export async function getVisaPriceList() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/accounting'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const { data } = await db.from('visa_price_list').select('*').order('sort', { ascending: true }).order('id', { ascending: true });
  return { ok: true, rows: data || [] };
}

export async function saveVisaPriceRow(id, form) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/accounting'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const row = {
    visa_name: clean(form.visa_name) || 'Visa',
    hpp: numOrNull(form.hpp) || 0,
    hj: numOrNull(form.hj) || 0,
    keterangan: clean(form.keterangan),
    updated_at: new Date().toISOString(),
    created_by: user.email || 'staff',
  };
  let error;
  if (id) { ({ error } = await db.from('visa_price_list').update(row).eq('id', id)); }
  else { ({ error } = await db.from('visa_price_list').insert(row)); }
  if (error) return { error: error.message };
  revalidatePath('/accounting/payment-visa');
  return { ok: true };
}

export async function deleteVisaPriceRow(id) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/accounting'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const { error } = await db.from('visa_price_list').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/accounting/payment-visa');
  return { ok: true };
}
