'use server';

// Round 102d: DP Payment Request actions — Family Batch Approve
// - approveDPRequest: individual approve (Round 102, untuk peserta individu)
// - approveDPBatch: batch approve untuk family (1 WA ke kepala dengan breakdown)
// - rejectDPRequest: reject individual

import { revalidatePath } from 'next/cache';
import { assertStaff } from '@/lib/auth/require-staff';
import { getFonnteToken } from '@/lib/utils/fonnte';
import { getPicFonnteTokenById } from '@/lib/auth/pic-scope';
import { currentBrandCode } from '@/lib/supabase/service-env';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { sendPaymentReceivedWA } from '@/lib/actions/wa-payment-notif';
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
      try { const _wm = await import('@/lib/wa-outbox-log'); await _wm.logWA({ context: 'finance', phone, message, status: 'failed', state: 'failed', reason: _werr }); } catch {}
      return { error: _werr };
    }
    const _wfid = Array.isArray(data.id) ? data.id[0] : (data.id || null);
    try { const _wm = await import('@/lib/wa-outbox-log'); await _wm.logWA({ context: 'finance', phone, message, status: 'sent', state: 'sent', fonnteId: _wfid }); } catch {}
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

  // WA konfirmasi PEMBAYARAN DITERIMA — pakai template lengkap (detail trip, rincian, riwayat, link invoice)
  // yg sama dgn Payment Checklist (sendPaymentReceivedWA). Catatan pembayaran sudah dicatat via syncDPToMatrix.
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
