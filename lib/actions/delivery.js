'use server';

// Round 185 + R186b: Delivery perlengkapan — public form + CS workflow
// R186b: Fix URL pakai teone.dev (production) — bukan preview Vercel URL
// Path: lib/actions/delivery.js

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { resolveClientByToken } from '@/lib/supabase/public-brand';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { sendFonnte, normalizePhone } from '@/lib/utils/fonnte';
import { getPicFonnteTokenById, getPicNameForTrip, isPicWaManualForTrip } from '@/lib/auth/pic-scope';
import { currentBrandCode } from '@/lib/supabase/service-env';
function _salamWord(){let c='teone';try{c=currentBrandCode();}catch{}return c==='khasanah'?"Assalamu'alaikum":'Hai';}
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { queueManualWA } from '@/lib/utils/wa-manual-queue';
import { plainForBrand } from '@/lib/utils/wa-plain';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function revalidateAll(tripId) {
  if (tripId) {
    revalidatePath(`/trips/${tripId}`);
    revalidatePath(`/trips/${tripId}/participants`);
  }
  revalidatePath('/trips');
}

// R186b: Hardcode production domain biar link WA gak pernah pakai preview URL Vercel
// (preview URL di-protect Vercel auth, peserta non-login ga bisa buka)
function getAppUrl() {
  // Link delivery dikirim ke customer → pakai domain publik (travelingeropa.com)
  return process.env.NEXT_PUBLIC_CUSTOMER_URL || customerSiteUrlFor('teone');
}

// ============ PUBLIC: Get passenger info by token (untuk display di form) ============
export async function getDeliveryInfoByToken(token) {
  if (!token) return { error: 'Token gak valid' };
  const resolved = await resolveClientByToken('delivery_token', token);
  if (!resolved) return { error: 'Token tidak valid atau peserta gak ditemukan' };
  const supabase = resolved.client;
  try {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, customer_id, delivery_status, delivery_recipient, delivery_phone, delivery_email, delivery_street, delivery_kelurahan, delivery_kecamatan, delivery_kota, delivery_provinsi, delivery_kode_pos, delivery_notes, delivery_filled_at, delivery_courier, delivery_resi, delivery_sent_at, delivery_received_at')
      .eq('delivery_token', token)
      .maybeSingle();
    if (!pax) return { error: 'Token tidak valid atau peserta gak ditemukan' };

    // Get customer name + trip info
    const [{ data: customer }, { data: trip }] = await Promise.all([
      supabase.from('customers').select('name, phone, email').eq('id', pax.customer_id).maybeSingle(),
      supabase.from('trips').select('id, kode_trip, name, departure').eq('id', pax.trip_id).maybeSingle(),
    ]);

    return {
      ok: true,
      passenger: pax,
      customer,
      trip,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ PUBLIC: Submit address (gak perlu auth) ============
export async function submitDeliveryAddress(token, formData) {
  if (!token) return { error: 'Token gak valid' };
  const resolved = await resolveClientByToken('delivery_token', token);
  if (!resolved) return { error: 'Token tidak valid atau peserta gak ditemukan' };
  const supabase = resolved.client;

  function v(key) { return (formData.get(key) || '').toString().trim() || null; }

  const recipient = v('recipient');
  const phone = v('phone');
  const street = v('street');
  const kelurahan = v('kelurahan');
  const kecamatan = v('kecamatan');
  const kota = v('kota');
  const provinsi = v('provinsi');
  const kode_pos = v('kode_pos');
  const email = v('email');
  const notes = v('notes');

  if (!recipient) return { error: 'Nama penerima wajib diisi' };
  if (!phone) return { error: 'No. HP wajib diisi' };
  if (!street) return { error: 'Alamat (jalan + nomor) wajib' };
  if (!kelurahan) return { error: 'Kelurahan wajib' };
  if (!kecamatan) return { error: 'Kecamatan wajib' };
  if (!kota) return { error: 'Kota wajib' };
  if (!provinsi) return { error: 'Provinsi wajib' };
  if (!kode_pos) return { error: 'Kode Pos wajib' };

  try {
    const { data: pax, error } = await supabase
      .from('trip_passengers')
      .update({
        delivery_recipient: recipient,
        delivery_phone: phone,
        delivery_email: email,
        delivery_street: street,
        delivery_kelurahan: kelurahan,
        delivery_kecamatan: kecamatan,
        delivery_kota: kota,
        delivery_provinsi: provinsi,
        delivery_kode_pos: kode_pos,
        delivery_notes: notes,
        delivery_status: 'filled',
        delivery_filled_at: new Date().toISOString(),
      })
      .eq('delivery_token', token)
      .select('trip_id')
      .single();

    if (error) return { error: error.message };

    revalidateAll(pax?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ CS: Send delivery link via WhatsApp ============
export async function sendDeliveryLink(passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  try {
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, customer_id, delivery_token')
      .eq('id', passengerId)
      .maybeSingle();
    if (!pax) return { error: 'Peserta gak ditemukan' };

    const { data: customer } = await supabase
      .from('customers')
      .select('name, phone, whatsapp')
      .eq('id', pax.customer_id)
      .maybeSingle();
    if (!customer) return { error: 'Customer info gak ditemukan' };

    const phone = customer.whatsapp || customer.phone;
    if (!phone) return { error: `Peserta "${customer.name}" gak punya nomor HP/WA` };

    const { data: trip } = await supabase
      .from('trips')
      .select('kode_trip, name')
      .eq('id', pax.trip_id)
      .maybeSingle();

    const appUrl = getAppUrl().replace(/\/$/, '');
    const link = `${appUrl}/delivery/${pax.delivery_token}`;
    const _picNm = await getPicNameForTrip(supabase, pax.trip_id);

    const message = plainForBrand([
      `🎒 *TEONE — Form Alamat Pengiriman Perlengkapan*`,
      ``,
      `${_salamWord()} *${customer.name}*,${_picNm ? `\nSaya *${_picNm}* dari Khasanah Travel \ud83d\ude4f` : ''}`,
      `Trip *${trip?.kode_trip || ''} ${trip?.name || ''}*`.trim(),
      ``,
      `Untuk pengiriman perlengkapan trip (koper, dll), mohon isi alamat lengkap kamu via link berikut:`,
      ``,
      `🔗 ${link}`,
      ``,
      `Form ini aman & cuma untuk kamu. Setelah terisi, perlengkapan akan kami kirim H-7 sebelum keberangkatan.`,
      ``,
      `Terima kasih 🙏`,
      `_TEONE — Traveling Eropa_`,
    ].join('\n'));

    if (await isPicWaManualForTrip(supabase, pax.trip_id)) {
      await queueManualWA(supabase, { phone, message, kind: 'manual_pending_ongkir', context: 'finance', tripId: pax.trip_id });
      return { ok: true, wa_manual: true, wa_message: message, wa_phone: phone };
    }
    const result = await sendFonnte(phone, message, { context: 'finance', token: await getPicFonnteTokenById(supabase, pax.trip_id) });
    if (result.error) return { error: result.error };

    // Track sent timestamp
    await supabase
      .from('trip_passengers')
      .update({ delivery_link_sent_at: new Date().toISOString() })
      .eq('id', passengerId);

    revalidateAll(pax.trip_id);
    return { ok: true, target: normalizePhone(phone), link };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ CS: Bulk send link ke semua peserta yg belum isi ============
export async function bulkSendDeliveryLinks(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  try {
    const { data: paxList } = await supabase
      .from('trip_passengers')
      .select('id, delivery_status')
      .eq('trip_id', tripId)
      .in('delivery_status', ['pending']);

    if (!paxList || paxList.length === 0) {
      return { ok: true, sent: 0, message: 'Semua peserta sudah isi alamat — tidak ada yg perlu di-blast' };
    }

    let sent = 0, failed = 0, errors = [];
    for (const p of paxList) {
      try {
        const r = await sendDeliveryLink(p.id);
        if (r.error) { failed++; errors.push(`#${p.id}: ${r.error}`); }
        else sent++;
      } catch (e) {
        failed++;
        errors.push(`#${p.id}: ${e?.message || 'unknown'}`);
      }
    }

    revalidateAll(tripId);
    return {
      ok: true,
      sent,
      failed,
      total: paxList.length,
      errors,
      message: `📨 ${sent}/${paxList.length} link terkirim${failed > 0 ? ` · ${failed} gagal` : ''}`,
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ CS: Mark dikirim (input resi + courier) ============
export async function markDeliverySent(passengerId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
  const sentBy = user.user_metadata?.full_name || user.email || 'unknown';

  const courier = (formData.get('courier') || '').toString().trim();
  const resi = (formData.get('resi') || '').toString().trim();
  if (!courier) return { error: 'Kurir wajib diisi' };
  if (!resi) return { error: 'Nomor resi wajib diisi' };

  try {
    const { data: pax, error } = await supabase
      .from('trip_passengers')
      .update({
        delivery_status: 'sent',
        delivery_courier: courier,
        delivery_resi: resi,
        delivery_sent_at: new Date().toISOString(),
        delivery_sent_by: sentBy,
      })
      .eq('id', passengerId)
      .select('trip_id, customer_id, delivery_phone')
      .single();
    if (error) return { error: error.message };

    // Auto-send WA notification dgn resi
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('name, phone, whatsapp')
        .eq('id', pax.customer_id)
        .maybeSingle();
      const phone = pax.delivery_phone || customer?.whatsapp || customer?.phone;
      if (phone) {
        const { data: trip } = await supabase
          .from('trips')
          .select('kode_trip, name')
          .eq('id', pax.trip_id)
          .maybeSingle();
        const msg = plainForBrand([
          `📦 *Perlengkapan Sudah Dikirim!*`,
          ``,
          `Hai *${customer?.name || 'Kak'}*,`,
          `Perlengkapan untuk trip *${trip?.kode_trip || ''} ${trip?.name || ''}*`.trim(),
          `sudah dikirim 🚚`,
          ``,
          `📦 Kurir: *${courier}*`,
          `🔢 No. Resi: *${resi}*`,
          ``,
          `Mohon cek pengiriman via tracking kurir. Konfirmasi kalau sudah diterima ya 🙏`,
          ``,
          `_TEONE — Traveling Eropa_`,
        ].join('\n'));
        if (await isPicWaManualForTrip(supabase, pax.trip_id)) {
          await queueManualWA(supabase, { phone, message: msg, kind: 'manual_pending_ongkir', context: 'finance', tripId: pax.trip_id });
        } else {
          await sendFonnte(phone, msg, { context: 'finance', token: await getPicFonnteTokenById(supabase, pax.trip_id) });
        }
      }
    } catch (e) { console.error('[markDeliverySent WA]', e?.message); }

    revalidateAll(pax.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ CS: Mark diterima ============
export async function markDeliveryReceived(passengerId) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: pax, error } = await supabase
      .from('trip_passengers')
      .update({
        delivery_status: 'received',
        delivery_received_at: new Date().toISOString(),
      })
      .eq('id', passengerId)
      .select('trip_id')
      .single();
    if (error) return { error: error.message };
    revalidateAll(pax.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ CS: Skip (peserta gak butuh pengiriman) ============
export async function skipDelivery(passengerId) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: pax, error } = await supabase
      .from('trip_passengers')
      .update({ delivery_status: 'skip' })
      .eq('id', passengerId)
      .select('trip_id')
      .single();
    if (error) return { error: error.message };
    revalidateAll(pax.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ Reset (kalau perlu edit ulang) ============
export async function resetDeliveryStatus(passengerId) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: pax, error } = await supabase
      .from('trip_passengers')
      .update({
        delivery_status: 'filled',
        delivery_sent_at: null,
        delivery_received_at: null,
        delivery_courier: null,
        delivery_resi: null,
      })
      .eq('id', passengerId)
      .select('trip_id')
      .single();
    if (error) return { error: error.message };
    revalidateAll(pax.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}
