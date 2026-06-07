// lib/actions/tl-assignment.js
// R198: Server actions untuk TL assignment via WA Fonnte
// v2: skip baris kosong di template, fallback field name lebih banyak

'use server';

import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { revalidatePath } from 'next/cache';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
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
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return null;
  }
}

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

async function lookupTL(supabase, tlId) {
  if (!tlId) return null;
  try {
    const { data } = await supabase
      .from('tour_leaders')
      .select('id, name, phone')
      .eq('id', tlId)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Build pesan WA — skip baris yg datanya kosong
 */
function buildWAMessage({ greetingName, tripName, kodeTrip, tripStart, tripEnd, pax, destination, approveUrl, rejectUrl }) {
  const lines = [];

  lines.push(`${greetingName} 👋`);
  lines.push('');
  lines.push(`Anda di-assign sebagai *Tour Leader* untuk trip:`);
  lines.push('');

  // Nama trip (utama)
  if (tripName) {
    lines.push(`🌍 *${tripName}*`);
  }

  // Kode trip (tambahan)
  if (kodeTrip && kodeTrip !== tripName) {
    lines.push(`🏷️ Kode: ${kodeTrip}`);
  }

  // Destination
  if (destination) {
    lines.push(`📍 ${destination}`);
  }

  // Tanggal — hanya tampilkan kalau minimal start ada
  if (tripStart && tripEnd) {
    lines.push(`📅 ${tripStart} → ${tripEnd}`);
  } else if (tripStart) {
    lines.push(`📅 Berangkat: ${tripStart}`);
  }

  // Pax — hanya kalau ada
  if (pax && pax !== '-' && pax !== 0) {
    lines.push(`👥 ${pax} pax`);
  }

  lines.push('');
  lines.push(`Mohon konfirmasi ketersediaan Kakak:`);
  lines.push('');
  lines.push(`✅ APPROVE: ${approveUrl}`);
  lines.push('');
  lines.push(`❌ REJECT: ${rejectUrl}`);
  lines.push('');
  lines.push(`Terima kasih 🙏`);
  lines.push(`_TEONE — Traveling Eropa_`);

  return lines.join('\n');
}

export async function sendTLAssignmentWA(formData) {
  try {
    const supabase = getServiceClient();
    if (!supabase) return { error: 'Service role gak ke-set' };

    const tripId = formData.get('tripId');
    let tlPhone = formData.get('tlPhone') || '';
    let tlName = formData.get('tlName') || '';
    const tlId = formData.get('tlId') || null;

    if (!tripId) return { error: 'Trip ID kosong' };

    if (!tlPhone && tlId) {
      const tl = await lookupTL(supabase, tlId);
      if (tl) {
        tlPhone = tl.phone || '';
        if (!tlName) tlName = tl.name || '';
      }
    }

    if (!tlPhone) {
      return { error: 'Nomor HP TL kosong. Pilih TL dulu dari Master TL & save trip.' };
    }

    const normalizedPhone = normalizePhone(tlPhone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
      return { error: 'Nomor HP TL gak valid' };
    }

    const { data: trip, error: tripErr } = await supabase
      .from('trips')
      .select('*')
      .eq('id', tripId)
      .maybeSingle();

    if (tripErr) return { error: 'DB error: ' + tripErr.message };
    if (!trip) return { error: 'Trip gak ketemu' };

    const token = generateToken();

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

    // PENTING: NEXT_PUBLIC_APP_URL harus di-set ke https://teone.dev di Vercel
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://teone.dev'; // hard fallback, JANGAN pakai VERCEL_URL (preview URL expire)
    const fullBase = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;

    const approveUrl = `${fullBase}/api/tl-confirm/${token}?action=approve`;
    const rejectUrl = `${fullBase}/api/tl-confirm/${token}?action=reject`;

    // Fallback nama trip — coba beberapa field
    const tripName =
      (trip.name && !trip.name.startsWith('Trip dari PNR')) ? trip.name : null;
    const kodeTrip = trip.kode_trip || null;
    const displayName = tripName || kodeTrip || trip.name || `Trip #${tripId}`;

    const tripStart = formatDate(trip.departure || trip.start_date || trip.departure_date);
    const tripEnd = formatDate(trip.arrival || trip.end_date || trip.return_date);

    // Pax / kapasitas
    const pax = trip.quota || trip.pax || trip.total_pax || null;

    const destination = trip.destination || null;

    const greetingName = tlName ? `Halo Kak ${tlName}` : 'Halo Kak TL';

    const message = buildWAMessage({
      greetingName,
      tripName: displayName,
      kodeTrip: kodeTrip,
      tripStart,
      tripEnd,
      pax,
      destination,
      approveUrl,
      rejectUrl,
    });

    const sendResult = await sendViaFonnte(normalizedPhone, message);

    if (!sendResult.ok) {
      return { error: 'Fonnte gagal kirim: ' + sendResult.error };
    }

    revalidatePath('/trips');
    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/edit`);

    return {
      ok: true,
      message: `WA berhasil dikirim ke ${normalizedPhone}`,
      phone: normalizedPhone,
    };
  } catch (e) {
    return { error: 'Exception: ' + (e?.message || String(e)) };
  }
}

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

    revalidatePath('/trips');
    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/edit`);
    return { ok: true };
  } catch (e) {
    return { error: 'Exception: ' + (e?.message || String(e)) };
  }
}
