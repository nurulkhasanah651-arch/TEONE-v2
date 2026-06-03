// lib/actions/tl-assignment.js
// R198: Server actions untuk TL assignment via WA Fonnte

'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function generateToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '62' + p.slice(1);
  if (p.startsWith('8')) p = '62' + p;
  return p;
}

function formatDate(date) {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return String(date);
  }
}

/**
 * Kirim WA via Fonnte (sama kayak yg dipake invoice)
 */
async function sendViaFonnte(target, message) {
  const token = process.env.FONNTE_TOKEN || process.env.FONNTE_API_KEY;
  if (!token) {
    return { ok: false, error: 'FONNTE_TOKEN gak ke-set di env' };
  }

  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        target,
        message,
        countryCode: '62',
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || data.status === false) {
      return {
        ok: false,
        error: data?.reason || data?.message || `Fonnte error ${res.status}`,
        raw: data,
      };
    }

    return { ok: true, raw: data };
  } catch (e) {
    return { ok: false, error: 'Fonnte exception: ' + (e?.message || String(e)) };
  }
}

/**
 * Generate token + kirim WA ke TL via Fonnte
 * Form sends: tripId, tlPhone, tlName (optional)
 */
export async function sendTLAssignmentWA(formData) {
  try {
    const supabase = getServiceClient();
    if (!supabase) return { error: 'Service role gak ke-set' };

    const tripId = formData.get('tripId');
    const tlPhone = formData.get('tlPhone');
    const tlName = formData.get('tlName') || '';

    if (!tripId) return { error: 'Trip ID kosong' };
    if (!tlPhone) return { error: 'Nomor HP TL kosong' };

    const normalizedPhone = normalizePhone(tlPhone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return { error: 'Nomor HP TL gak valid' };
    }

    // Ambil data trip untuk template
    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();

    if (tripErr) return { error: 'DB error: ' + tripErr.message };
    if (!trip) return { error: 'Trip gak ketemu' };

    // Generate token unik
    const token = generateToken();

    // Update trip dengan tl_phone + token + status pending DULU
    // (kalau Fonnte gagal, status pending tetep aman utk retry)
    const { error: updateErr } = await supabase
      .from('trips')
      .update({
        tl_phone: normalizedPhone,
        tl_assignment_token: token,
        tl_assignment_status: 'pending',
        tl_assignment_sent_at: new Date().toISOString(),
        tl_assignment_responded_at: null,
        tl_assignment_response_note: null,
      })
      .eq('id', tripId);

    if (updateErr) return { error: 'Update failed: ' + updateErr.message };

    // Bangun URL base
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      'https://teone.dev';
    const fullBase = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

    const approveUrl = `${fullBase}/api/tl-confirm/${token}?action=approve`;
    const rejectUrl = `${fullBase}/api/tl-confirm/${token}?action=reject`;

    // Template pesan WA
    const greetingName = tlName ? `Halo Kak ${tlName}` : 'Halo Kak TL';
    const tripName = trip.name || trip.trip_name || `Trip #${tripId}`;
    const tripDate = formatDate(trip.start_date || trip.departure_date);
    const tripEnd = formatDate(trip.end_date || trip.return_date);
    const pax = trip.pax || trip.total_pax || '-';

    const message = [
      `${greetingName} 👋`,
      '',
      `Anda di-assign sebagai *Tour Leader* untuk trip:`,
      '',
      `🌍 *${tripName}*`,
      `📅 ${tripDate} - ${tripEnd}`,
      `👥 ${pax} pax`,
      '',
      `Mohon konfirmasi ketersediaan Kakak:`,
      '',
      `✅ APPROVE: ${approveUrl}`,
      '',
      `❌ REJECT: ${rejectUrl}`,
      '',
      `Terima kasih 🙏`,
      `_TEONE — Traveling Eropa_`,
    ].join('\n');

    // Kirim via Fonnte
    const sendResult = await sendViaFonnte(normalizedPhone, message);

    if (!sendResult.ok) {
      return { error: 'Fonnte gagal kirim: ' + sendResult.error };
    }

    revalidatePath('/master-trip');
    revalidatePath(`/master-trip/${tripId}`);

    return {
      ok: true,
      message: `WA berhasil dikirim ke ${normalizedPhone}`,
      phone: normalizedPhone,
    };
  } catch (e) {
    return { error: 'Exception: ' + (e?.message || String(e)) };
  }
}

/**
 * Manual reset (kirim ulang setelah TL minta resend)
 */
export async function resetTLAssignment(formData) {
  try {
    const supabase = getServiceClient();
    if (!supabase) return { error: 'Service role gak ke-set' };

    const tripId = formData.get('tripId');
    if (!tripId) return { error: 'Trip ID kosong' };

    const { error } = await supabase
      .from('trips')
      .update({
        tl_assignment_status: 'pending',
        tl_assignment_token: null,
        tl_assignment_sent_at: null,
        tl_assignment_responded_at: null,
        tl_assignment_response_note: null,
      })
      .eq('id', tripId);

    if (error) return { error: error.message };

    revalidatePath('/master-trip');
    revalidatePath(`/master-trip/${tripId}`);
    return { ok: true };
  } catch (e) {
    return { error: 'Exception: ' + (e?.message || String(e)) };
  }
}
