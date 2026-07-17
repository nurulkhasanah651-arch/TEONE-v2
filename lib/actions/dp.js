'use server';

// Round 102d: DP Payment Request actions — Family Batch Approve
// - approveDPRequest: individual approve (Round 102, untuk peserta individu)
// - approveDPBatch: batch approve untuk family (1 WA ke kepala dengan breakdown)
// - rejectDPRequest: reject individual

import { revalidatePath } from 'next/cache';
import { assertStaff } from '@/lib/auth/require-staff';
import { getFonnteToken } from '@/lib/utils/fonnte';
import { getPicFonnteTokenById, isPicWaManualForTrip } from '@/lib/auth/pic-scope';
import { currentBrandCode } from '@/lib/supabase/service-env';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { sendPaymentReceivedWA, tryWabaApproval } from '@/lib/actions/wa-payment-notif';
import { createInvoiceAsPaid } from '@/lib/actions/invoices';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = '62' + p.substring(1);
  if (p.startsWith('8')) p = '62' + p;
  return p;
}

async function sendFonnte(phone, message, tokenOverride) {
  let token;
  if (tokenOverride && String(tokenOverride).trim()) token = String(tokenOverride).trim();
  else ({ token } = getFonnteToken('finance', (()=>{try{return currentBrandCode();}catch{return '';}})()));
  if (!token) return { error: 'Fonnte token finance belum di-set (FONNTE_TOKEN_FINANCE / FONNTE_TOKEN)' };
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ target: phone, message, countryCode: '62' }),
    });
    const data = await res.json();
    if (!res.ok || data.status === false) {
      const _werr = 'Fonnte: ' + (data.reason || data.message || 'unknown');
      try { const _wm = await import('@/lib/wa-outbox-log'); await _wm.logWA({ context: 'finance', phone, message, status: 'failed', state: 'failed', reason: _werr, senderToken: token }); } catch {}
      return { error: _werr };
    }
    const _wfid = Array.isArray(data.id) ? data.id[0] : (data.id || null);
    try { const _wm = await import('@/lib/wa-outbox-log'); await _wm.logWA({ context: 'finance', phone, message, status: 'sent', state: 'sent', fonnteId: _wfid, senderToken: token }); } catch {}
    return { ok: true };
  } catch (e) {
    return { error: 'Network: ' + (e?.message || 'unknown') };
  }
}

function revalidateAll(tripId) {
  revalidatePath('/cs');
  revalidatePath('/accounting');
  revalidatePath('/finance');
  revalidatePath('/finance/payments');
  revalidatePath('/dashboard');
  revalidatePath('/invoices');
  if (tripId) {
    revalidatePath(`/finance/payments/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
  }
}

// ============================================================
// CREATE DP REQUEST
// ============================================================
export async function createDPRequest({
  trip_id, passenger_id, customer_id, amount,
  payment_date, payment_method = 'transfer', notes, proof_url,
}) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  if (!trip_id || !passenger_id || !amount || Number(amount) <= 0) {
    return { error: 'trip_id, passenger_id, amount wajib (amount > 0)' };
  }

  const supabase = getServiceClient() || authClient;

  const [tripRes, custRes, paxRes] = await Promise.all([
    supabase.from('trips').select('name, kode_trip').eq('id', trip_id).maybeSingle(),
    customer_id
      ? supabase.from('customers').select('name, phone, email').eq('id', customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('trip_passengers').select('customer_id').eq('id', passenger_id).maybeSingle(),
  ]);

  const trip = tripRes.data || {};
  let cust = custRes.data;
  if (!cust && paxRes.data?.customer_id) {
    const r = await supabase.from('customers').select('name, phone, email').eq('id', paxRes.data.customer_id).maybeSingle();
    cust = r.data;
  }

  const requested_by = user.user_metadata?.full_name || user.email || 'unknown';

  const payload = {
    trip_id,
    passenger_id,
    customer_id: customer_id || paxRes.data?.customer_id || null,
    customer_name: cust?.name || null,
    customer_phone: cust?.phone || null,
    trip_name: trip.name || null,
    trip_kode: trip.kode_trip || null,
    amount: Number(amount) || 0,
    payment_date: payment_date || new Date().toISOString().slice(0, 10),
    payment_method,
    proof_url: proof_url || null,
    status: 'pending',
    notes: notes || null,
    requested_by,
  };

  const { data, error } = await supabase
    .from('dp_payment_requests')
    .insert(payload)
    .select('id')
    .single();

  if (error) return { error: error.message };

  revalidateAll(trip_id);
  return { ok: true, dp_request_id: data.id };
}

// ============================================================
// Helper: sync 1 DP request to matrix (insert/update participant_payments)
// ============================================================
async function syncDPToMatrix(supabase, req, approved_by) {
  const noteText = `DP approved by ${approved_by} (DP Request #${req.id})`;
  const { data: existing } = await supabase
    .from('participant_payments')
    .select('id, amount')
    .eq('passenger_id', req.passenger_id)
    .eq('type', 'DP')
    .maybeSingle();

  if (existing) {
    await supabase
      .from('participant_payments')
      .update({ amount: req.amount, notes: noteText, paid_at: req.payment_date })
      .eq('id', existing.id);
  } else {
    await supabase.from('participant_payments').insert({
      passenger_id: req.passenger_id,
      type: 'DP',
      amount: req.amount,
      paid_at: req.payment_date || new Date().toISOString(),
      notes: noteText,
    });
  }
}

// Peserta dari CS Daily/DP tak pernah punya baris `invoices`, jadi WA konfirmasi
// tak bisa menampilkan link tanda terima. Buat receipt invoice (status paid) di sini.
// Idempoten: kalau peserta sudah punya invoice (sendiri / lewat family) -> lewati.
async function ensureReceiptInvoice(supabase, { trip_id, passenger_id, customer_id, amount, payment_date, family_group_id = null, covers_passenger_ids = null, is_family_invoice = false }) {
  try {
    if (!trip_id || !passenger_id || !(Number(amount) > 0)) return null;

    const { data: own } = await supabase.from('invoices').select('id').eq('passenger_id', passenger_id).limit(1);
    if (own && own.length) return null;
    const { data: fam } = await supabase.from('invoices').select('id')
      .eq('trip_id', trip_id).contains('covers_passenger_ids', JSON.stringify([passenger_id])).limit(1);
    if (fam && fam.length) return null;

    const r = await createInvoiceAsPaid({
      trip_id, passenger_id, customer_id: customer_id || null,
      milestone: 'DP', amount: Number(amount) || 0,
      payment_date: payment_date || null,
      description: 'Tanda terima DP',
      family_group_id, covers_passenger_ids, is_family_invoice,
    });
    return r && !r.error ? r : null;
  } catch { return null; }
}

// ============================================================
// APPROVE DP REQUEST (INDIVIDUAL) — Round 102
// ============================================================
export async function approveDPRequest(requestId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const supabase = getServiceClient() || authClient;
  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: req } = await supabase
    .from('dp_payment_requests').select('*').eq('id', requestId).maybeSingle();
  if (!req) return { error: 'Request tidak ditemukan' };
  if (req.status === 'approved') return { error: 'Sudah ter-approve sebelumnya' };

  await supabase
    .from('dp_payment_requests')
    .update({ status: 'approved', approved_by, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', requestId);

  await syncDPToMatrix(supabase, req, approved_by);

  // Tanda terima (invoice paid) -> supaya WA konfirmasi bisa memuat link invoice
  await ensureReceiptInvoice(supabase, {
    trip_id: req.trip_id, passenger_id: req.passenger_id, customer_id: req.customer_id,
    amount: req.amount, payment_date: req.payment_date,
  });

  // WA konfirmasi PEMBAYARAN DITERIMA — pakai template lengkap (detail trip, rincian, riwayat, link invoice)
  // yg sama dgn Payment Checklist (sendPaymentReceivedWA). Catatan pembayaran sudah dicatat via syncDPToMatrix.
  // PIC dgn WA manual (device belum tersambung): jangan auto-kirim, balikan template.
  const _waManual = await isPicWaManualForTrip(supabase, req.trip_id);
  if (_waManual && req.passenger_id) {
    // Coba kirim otomatis via WABA resmi dulu (khusus PIC yang nomornya sudah WABA, mis. Anis).
    const _waba = await tryWabaApproval(req.passenger_id);
    if (_waba?.ok) {
      try { await supabase.from('dp_payment_requests').update({ wa_sent: true, wa_sent_at: new Date().toISOString() }).eq('id', requestId); } catch {}
      revalidateAll(req.trip_id);
      return { ok: true, wa_sent: true, via: 'waba' };
    }
    let tpl = null;
    try { tpl = await sendPaymentReceivedWA(req.passenger_id, true); } catch {}
    revalidateAll(req.trip_id);
    return {
      ok: true, wa_manual: true, wa_sent: false,
      wa_message: tpl?.message || null,
      wa_phone: tpl?.phone || req.customer_phone || null,
      customer_name: tpl?.customerName || req.customer_name || null,
    };
  }

  let waResult = { ok: false };
  if (req.passenger_id) {
    try {
      const r = await sendPaymentReceivedWA(req.passenger_id);
      waResult = r?.ok ? { ok: true } : { ok: false, error: r?.error };
    } catch (e) { waResult = { ok: false, error: e?.message }; }
    if (waResult.ok) {
      await supabase.from('dp_payment_requests')
        .update({ wa_sent: true, wa_sent_at: new Date().toISOString() })
        .eq('id', requestId);
    }
  }

  revalidateAll(req.trip_id);
  return { ok: true, wa_sent: !!waResult.ok, wa_error: waResult.error || null };
}

// ============================================================
// Round 102d: APPROVE DP BATCH (Family) — 1 WA ke kepala dgn breakdown
// ============================================================
export async function approveDPBatch(requestIds) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    return { error: 'requestIds wajib (array)' };
  }

  const supabase = getServiceClient() || authClient;
  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Fetch semua requests
  const { data: reqs } = await supabase
    .from('dp_payment_requests')
    .select('*')
    .in('id', requestIds.map(Number));

  if (!reqs || reqs.length === 0) return { error: 'Requests tidak ditemukan' };

  // Filter yang masih pending
  const pendingReqs = reqs.filter((r) => r.status !== 'approved');
  if (pendingReqs.length === 0) return { error: 'Semua request sudah ter-approve sebelumnya' };

  // Tentukan trip_id (asumsi semua dari trip yang sama)
  const tripId = pendingReqs[0].trip_id;

  // Update status semua jadi approved
  const nowISO = new Date().toISOString();
  await supabase
    .from('dp_payment_requests')
    .update({ status: 'approved', approved_by, approved_at: nowISO, updated_at: nowISO })
    .in('id', pendingReqs.map((r) => r.id));

  // Sync ke matrix per peserta
  for (const r of pendingReqs) {
    await syncDPToMatrix(supabase, r, approved_by);
  }

  // === SINGLE WA ke kepala family ===
  // Cari kepala family — lookup passenger.family_group_id, then family_groups.head_passenger_id
  const passengerIds = pendingReqs.map((r) => r.passenger_id).filter(Boolean);
  const _totalDP = pendingReqs.reduce((s2, r) => s2 + Number(r.amount || 0), 0);
  let headInfo = null;
  let waResult = { ok: false };

  if (passengerIds.length > 0) {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, family_group_id, customer_id, is_family_head')
      .in('id', passengerIds);
    const safePax = pax || [];
    const familyId = safePax.find((p) => p.family_group_id)?.family_group_id;

    if (familyId) {
      // Group family — ambil kepala
      const { data: fam } = await supabase
        .from('family_groups')
        .select('id, name, head_passenger_id, head_customer_id')
        .eq('id', familyId)
        .maybeSingle();
      if (fam) {
        const { data: headCust } = await supabase
          .from('customers')
          .select('name, phone')
          .eq('id', fam.head_customer_id)
          .maybeSingle();
        headInfo = { family: fam, customer: headCust };
      }
    }
  }

  // Tanda terima: family -> 1 invoice atas nama kepala (covers semua anggota); selain itu per peserta
  try {
    const _headPid = headInfo?.family?.head_passenger_id || null;
    if (_headPid && passengerIds.length > 1) {
      await ensureReceiptInvoice(supabase, {
        trip_id: tripId, passenger_id: _headPid,
        customer_id: headInfo?.family?.head_customer_id || null,
        amount: _totalDP, payment_date: pendingReqs[0]?.payment_date,
        family_group_id: headInfo.family.id, covers_passenger_ids: passengerIds, is_family_invoice: true,
      });
    } else {
      for (const r of pendingReqs) {
        await ensureReceiptInvoice(supabase, {
          trip_id: r.trip_id, passenger_id: r.passenger_id, customer_id: r.customer_id,
          amount: r.amount, payment_date: r.payment_date,
        });
      }
    }
  } catch {}

  // PIC dgn WA manual: tandai approved (sudah di atas), tapi JANGAN kirim WA.
  // Kembalikan template utk kepala keluarga supaya PIC copy-paste sendiri.
  const _waManualBatch = await isPicWaManualForTrip(supabase, tripId);
  if (_waManualBatch) {
    const _hpid = headInfo?.family?.head_passenger_id || passengerIds[0] || null;
    // Coba kirim otomatis via WABA resmi dulu (PIC bernomor WABA, mis. Anis).
    if (_hpid) {
      const _waba = await tryWabaApproval(_hpid);
      if (_waba?.ok) {
        revalidateAll(tripId);
        return { ok: true, approved: pendingReqs.length, family_name: headInfo?.family?.name || null, wa_sent_to_head: true, via: 'waba' };
      }
    }
    let tpl = null;
    if (_hpid) { try { tpl = await sendPaymentReceivedWA(_hpid, true); } catch {} }
    revalidateAll(tripId);
    return {
      ok: true, approved: pendingReqs.length,
      family_name: headInfo?.family?.name || null,
      wa_manual: true, wa_sent_to_head: false,
      wa_message: tpl?.message || null,
      wa_phone: tpl?.phone || headInfo?.customer?.phone || pendingReqs[0]?.customer_phone || null,
      customer_name: tpl?.customerName || headInfo?.customer?.name || null,
    };
  }

  // Build WA message
  if (headInfo && headInfo.customer?.phone) {
    const { data: company } = await supabase.from('brands').select('*, company_name:name, company_logo_url:logo_url').eq('id', pendingReqs[0]?.brand_id || 1).maybeSingle();
    const companyName = company?.company_name || 'Traveling Eropa';

    // Breakdown per peserta
    const lines = pendingReqs.map((r) => {
      return `• ${r.customer_name || `#${r.passenger_id}`}: ${fmtRupiah(r.amount)}`;
    });
    const totalAmt = pendingReqs.reduce((s, r) => s + Number(r.amount || 0), 0);

    const message = `Halo ${headInfo.customer.name || 'Bapak/Ibu'},

✅ *DP Family Sudah Diterima*

Trip: ${pendingReqs[0].trip_name || ''}${pendingReqs[0].trip_kode ? ` (${pendingReqs[0].trip_kode})` : ''}
Family: *${headInfo.family.name}*

📋 Breakdown DP:
${lines.join('\n')}

Total DP: *${fmtRupiah(totalAmt)}*

Pembayaran DP family Anda sudah kami verifikasi.
Status booking trip kini ter-konfirmasi ✓

Terima kasih,
${companyName}`;

    const _hpid = headInfo.family?.head_passenger_id || passengerIds[0] || null;
    let _full = _hpid ? await sendPaymentReceivedWA(_hpid).catch(() => ({ error: 'x' })) : { error: 'no-pid' };
    waResult = (_full && !_full.error) ? { ok: true } : await sendFonnte(normalizePhone(headInfo.customer.phone), message, await getPicFonnteTokenById(supabase, pendingReqs[0]?.trip_id));
    if (waResult.ok) {
      // Tandai semua DP request wa_sent
      await supabase
        .from('dp_payment_requests')
        .update({ wa_sent: true, wa_sent_at: nowISO })
        .in('id', pendingReqs.map((r) => r.id));
    }
  } else {
    // Fallback: bukan family / no head — kirim individual ke setiap peserta yang punya phone
    for (const r of pendingReqs) {
      if (!r.customer_phone) continue;
      const { data: company } = await supabase.from('brands').select('*, company_name:name, company_logo_url:logo_url').eq('id', r.brand_id || 1).maybeSingle();
      const companyName = company?.company_name || 'Traveling Eropa';
      const message = `Halo ${r.customer_name || 'Bapak/Ibu'},

✅ *DP Pembayaran Sudah Diterima*

Trip: ${r.trip_name || ''}${r.trip_kode ? ` (${r.trip_kode})` : ''}
DP: *${fmtRupiah(r.amount)}*
Tanggal: ${r.payment_date || '—'}

Terima kasih,
${companyName}`;
      let _fi = r.passenger_id ? await sendPaymentReceivedWA(r.passenger_id).catch(() => ({ error: 'x' })) : { error: 'no-pid' };
      if (!_fi || _fi.error) await sendFonnte(normalizePhone(r.customer_phone), message, await getPicFonnteTokenById(supabase, r.trip_id));
      await supabase
        .from('dp_payment_requests')
        .update({ wa_sent: true, wa_sent_at: nowISO })
        .eq('id', r.id);
    }
    waResult = { ok: true };
  }

  revalidateAll(tripId);
  return {
    ok: true,
    approved: pendingReqs.length,
    family_name: headInfo?.family?.name || null,
    wa_sent_to_head: !!(headInfo && waResult.ok),
    wa_target: headInfo?.customer?.phone || null,
    wa_error: waResult.error || null,
  };
}

// ============================================================
// REJECT DP REQUEST
// ============================================================
export async function rejectDPRequest(requestId, reason) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const supabase = getServiceClient() || authClient;
  const rejected_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: req } = await supabase
    .from('dp_payment_requests').select('trip_id, status').eq('id', requestId).maybeSingle();
  if (!req) return { error: 'Request tidak ditemukan' };

  const { error } = await supabase
    .from('dp_payment_requests')
    .update({
      status: 'rejected', rejected_by,
      rejected_at: new Date().toISOString(),
      rejected_reason: reason || 'Tidak ada alasan',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) return { error: error.message };

  revalidateAll(req.trip_id);
  return { ok: true };
}

// ============================================================
// DELETE DP REQUEST
// ============================================================
export async function deleteDPRequest(requestId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const _g = await assertStaff(user, '/invoices'); if (_g.error) return { error: _g.error }; }

  const supabase = getServiceClient() || authClient;

  const { data: req } = await supabase
    .from('dp_payment_requests').select('trip_id').eq('id', requestId).maybeSingle();

  const { error } = await supabase.from('dp_payment_requests').delete().eq('id', requestId);
  if (error) return { error: error.message };

  revalidateAll(req?.trip_id);
  return { ok: true };
}
