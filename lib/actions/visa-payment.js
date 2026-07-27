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

  // peserta yang BUTUH apply visa (include_visa & bukan visa_ready)
  let pax = [];
  for (let i = 0; i < tripIds.length; i += 100) {
    const { data } = await db.from('trip_passengers')
      .select('id, trip_id, customer_id, include_visa, visa_ready, visa_result, visa_docs, visa_biometric_date, visa_type')
      .in('trip_id', tripIds.slice(i, i + 100));
    pax = pax.concat(data || []);
  }
  pax = pax.filter((p) => p.include_visa === true && p.visa_ready !== true);
  if (!pax.length) return { ok: true, rows: [] };

  const paxIds = pax.map((p) => p.id);
  const custIds = [...new Set(pax.map((p) => p.customer_id).filter(Boolean))];
  const nameOf = {}; const payByPax = {}; const applyByPax = {};
  for (let i = 0; i < custIds.length; i += 500) {
    const { data } = await db.from('customers').select('id, name').in('id', custIds.slice(i, i + 500));
    for (const c of (data || [])) nameOf[c.id] = c.name || '';
  }
  for (let i = 0; i < paxIds.length; i += 500) {
    const chunk = paxIds.slice(i, i + 500);
    const { data: pays } = await db.from('participant_payments').select('passenger_id, amount, is_transferred').eq('type', 'Visa').in('passenger_id', chunk);
    for (const r of (pays || [])) { if (r.is_transferred !== true && Number(r.amount) > 0) payByPax[r.passenger_id] = true; }
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
      tgl_transfer: ap.tgl_transfer || '',
      pic_transfer: ap.pic_transfer || '',
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

  const { data: p } = await db.from('trip_passengers').select('trip_id').eq('id', pid).maybeSingle();
  const row = {
    passenger_id: pid,
    trip_id: p?.trip_id || null,
    embassy: clean(form.embassy),
    fee_embassy_amount: numOrNull(form.fee_embassy_amount) || 0,
    fee_embassy_pic: clean(form.fee_embassy_pic),
    fee_tls_amount: numOrNull(form.fee_tls_amount) || 0,
    fee_tls_pic: clean(form.fee_tls_pic),
    tgl_transfer: clean(form.tgl_transfer),
    pic_transfer: clean(form.pic_transfer),
    notes: clean(form.notes),
    updated_at: new Date().toISOString(),
    created_by: user.email || 'staff',
  };
  const { error } = await db.from('visa_apply_payments').upsert(row, { onConflict: 'passenger_id' });
  if (error) return { error: error.message };
  revalidatePath('/accounting/payment-visa');
  return { ok: true, total: (row.fee_embassy_amount || 0) + (row.fee_tls_amount || 0) };
}
