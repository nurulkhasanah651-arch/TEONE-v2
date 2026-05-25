'use server';

// Round 102: DP Payment Request actions
// - createDPRequest: CS log DP yang sudah diterima (pending approval)
// - approveDPRequest: Accounting approve → centang matrix + send WA
// - rejectDPRequest: Accounting reject dengan reason

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

async function sendFonnte(phone, message) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) return { error: 'FONNTE_TOKEN belum di-set' };
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
      return { error: 'Fonnte: ' + (data.reason || data.message || 'unknown') };
    }
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
  if (tripId) {
    revalidatePath(`/finance/payments/${tripId}`);
    revalidatePath(`/trips/${tripId}`);
  }
}

// ============================================================
// CREATE DP REQUEST — dipanggil dari CS form / quick form
// ============================================================
export async function createDPRequest({
  trip_id, passenger_id, customer_id, amount,
  payment_date, payment_method = 'transfer', notes, proof_url,
}) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!trip_id || !passenger_id || !amount || Number(amount) <= 0) {
    return { error: 'trip_id, passenger_id, amount wajib (amount > 0)' };
  }

  const supabase = getServiceClient() || authClient;

  // Snapshot customer + trip info
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
// APPROVE DP REQUEST — Accounting click approve
// → Insert ke participant_payments (centang DP matrix)
// → Send WA konfirmasi
// ============================================================
export async function approveDPRequest(requestId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const approved_by = user.user_metadata?.full_name || user.email || 'unknown';

  // Fetch request
  const { data: req } = await supabase
    .from('dp_payment_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return { error: 'Request tidak ditemukan' };
  if (req.status === 'approved') return { error: 'Request sudah ter-approve sebelumnya' };

  // 1. Update status approved
  await supabase
    .from('dp_payment_requests')
    .update({
      status: 'approved',
      approved_by,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  // 2. Insert ke participant_payments → matrix DP centang
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

  // 3. Send WA confirmation ke peserta
  let waResult = { ok: false };
  if (req.customer_phone) {
    const { data: company } = await supabase.from('company_settings').select('*').eq('id', 1).maybeSingle();
    const companyName = company?.company_name || 'Traveling Eropa';

    const message = `Halo ${req.customer_name || 'Bapak/Ibu'},

✅ *DP Pembayaran Sudah Diterima*

Trip: ${req.trip_name || ''}${req.trip_kode ? ` (${req.trip_kode})` : ''}
DP: *${fmtRupiah(req.amount)}*
Tanggal: ${req.payment_date || '—'}

Pembayaran DP Anda sudah kami verifikasi.
Status booking trip kini ter-konfirmasi ✓

Untuk pembayaran selanjutnya (cicilan/pelunasan) akan kami informasikan
H-30 sebelum keberangkatan.

Terima kasih,
${companyName}`;

    waResult = await sendFonnte(normalizePhone(req.customer_phone), message);
    if (waResult.ok) {
      await supabase
        .from('dp_payment_requests')
        .update({ wa_sent: true, wa_sent_at: new Date().toISOString() })
        .eq('id', requestId);
    }
  }

  revalidateAll(req.trip_id);
  return {
    ok: true,
    wa_sent: !!waResult.ok,
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

  const supabase = getServiceClient() || authClient;
  const rejected_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { data: req } = await supabase
    .from('dp_payment_requests')
    .select('trip_id, status')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return { error: 'Request tidak ditemukan' };

  const { error } = await supabase
    .from('dp_payment_requests')
    .update({
      status: 'rejected',
      rejected_by,
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

  const supabase = getServiceClient() || authClient;

  const { data: req } = await supabase
    .from('dp_payment_requests')
    .select('trip_id')
    .eq('id', requestId)
    .maybeSingle();

  const { error } = await supabase.from('dp_payment_requests').delete().eq('id', requestId);
  if (error) return { error: error.message };

  revalidateAll(req?.trip_id);
  return { ok: true };
}
