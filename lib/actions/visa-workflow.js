// R215m + R215n + R215o: Visa workflow server actions
// R215o FIX:
//   - sendVisaWA auto-switch ke doc_collection_no_biometric kalau trip.visa_needs_biometric=false
//   - Auto-generate upload_token kalau no-biometric template & belum ada token
//   - Pass return_method per peserta ke template
//   - Pass trip ke renderTemplate (untuk pakai override)
// Path: lib/actions/visa-workflow.js

'use server';

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { siteUrlFor } from '@/lib/brand-shared';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { renderTemplate, VISA_WA_TEMPLATES, autoDeadlineDoc } from '@/lib/utils/visa-templates';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ============================================================
// 1. UPDATE TRIP VISA CONFIG
// ============================================================
export async function updateTripVisaConfig(tripId, config) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const allowed = [
    'visa_pdf_syarat_url', 'visa_pdf_template_url',
    'visa_needs_biometric', 'visa_needs_physical_doc',
    'visa_biometric_location', 'visa_biometric_date',
    'visa_pickup_address',
    'visa_default_biometric_cost', 'visa_default_visa_cost',
    'visa_deadline_doc',
    'visa_country', 'visa_notes',
    'visa_field_team_phone',
  ];
  const update = {};
  for (const k of allowed) {
    if (config[k] !== undefined) {
      if (config[k] === '') update[k] = null;
      else update[k] = config[k];
    }
  }
  if (Object.keys(update).length === 0) return { error: 'Tidak ada field yg di-update' };

  const droppedCols = [];
  let attempt = 0;
  while (attempt < 10) {
    attempt++;
    const { error } = await supabase.from('trips').update(update).eq('id', tripId);
    if (!error) {
      revalidatePath(`/visa/${tripId}`);
      if (droppedCols.length > 0) {
        return { ok: true, warning: `Kolom belum ada di DB: ${droppedCols.join(', ')}. Jalankan SQL R215m.` };
      }
      return { ok: true };
    }
    const missingMatch = error.message.match(/column "([^"]+)" .* does not exist/i) ||
                         error.message.match(/Could not find the '([^']+)' column/i);
    if (missingMatch) {
      delete update[missingMatch[1]];
      droppedCols.push(missingMatch[1]);
      if (Object.keys(update).length === 0) return { error: `Semua field belum ada. Dropped: ${droppedCols.join(', ')}` };
      continue;
    }
    return { error: 'Update failed: ' + error.message };
  }
  return { error: 'Gagal setelah 10 attempts' };
}

// ============================================================
// 2. UPDATE PER-PESERTA VISA COST
// ============================================================
export async function updatePassengerVisaCost(passengerId, type, amount) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const field = type === 'biometric' ? 'visa_biometric_cost' :
                type === 'visa' ? 'visa_visa_cost' : null;
  if (!field) return { error: 'Type harus biometric atau visa' };

  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const { error } = await supabase
    .from('trip_passengers')
    .update({ [field]: Number(amount) || 0 })
    .eq('id', passengerId);
  if (error) {
    if (new RegExp(field).test(error.message)) return { error: `Kolom ${field} belum ada` };
    return { error: 'Update failed: ' + error.message };
  }
  revalidatePath(`/visa/${pax.trip_id}`);
  return { ok: true };
}

// ============================================================
// UPDATE PER-PESERTA BIOMETRIC TIME
// ============================================================
export async function updatePassengerBiometricTime(passengerId, time) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const timeValue = time && time !== '' ? time : null;
  const { error } = await supabase
    .from('trip_passengers')
    .update({ visa_biometric_time: timeValue })
    .eq('id', passengerId);
  if (error) return { error: 'Update failed: ' + error.message };
  revalidatePath(`/visa/${pax.trip_id}`);
  return { ok: true };
}

// Simpan kekurangan dokumen PER-PESERTA (beda tiap peserta) — auto masuk template Kekurangan Dokumen
export async function updatePassengerDocShortage(passengerId, text) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const { data: pax } = await supabase.from('trip_passengers').select('trip_id').eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const val = text && String(text).trim() ? String(text).trim() : null;
  const { error } = await supabase.from('trip_passengers').update({ visa_docs_shortage: val }).eq('id', passengerId);
  if (error) return { error: 'Update failed: ' + error.message };
  revalidatePath(`/visa/${pax.trip_id}`);
  return { ok: true };
}

// ============================================================
// 3. CREATE HPP ITEM untuk visa cost + REQUEST DP
// ============================================================
export async function requestVisaCostToFinance(passengerId, type, amount, vendor, notes) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  if (!amount || amount <= 0) return { error: 'Amount wajib > 0' };
  if (!['biometric', 'visa'].includes(type)) return { error: 'Type invalid' };

  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('id, trip_id, customer_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const { data: cust } = await supabase.from('customers').select('name').eq('id', pax.customer_id).maybeSingle();
  const paxName = cust?.name || `#${pax.id}`;
  const componentLabel = type === 'biometric' ? `Biaya Biometrik · ${paxName}` : `Biaya Visa · ${paxName}`;

  const requested_by = user.user_metadata?.full_name || user.email || 'unknown';
  // Field request payment ke Accounting (defensive — strip kalau kolom belum ada)
  const REQUEST_FIELDS = {
    payment_request_status: 'requested',
    payment_request_amount: amount,
    payment_phase: 'pelunasan',
    skip_deposit: true,
    payment_requested_at: new Date().toISOString(),
    payment_requested_by: requested_by,
    payment_requested_note: notes || `Request bayar ${type === 'biometric' ? 'Biometrik' : 'Visa'} · ${paxName}`,
  };
  const PAYMENT_STATUS_CANDIDATES = ['belum bayar', 'belum lunas', 'pending', 'unpaid', null];
  let inserted = null;
  let lastErr = null;
  for (const status of PAYMENT_STATUS_CANDIDATES) {
    let payload = {
      trip_id: pax.trip_id, item_type: 'hpp',
      category: type === 'biometric' ? 'Biometrik Visa' : 'Visa',
      component: componentLabel, vendor_name: vendor || null,
      qty: 1, basic_fare: amount, total_amount: amount,
      notes: notes || `Request bayar ${type} ${paxName}`,
      ...REQUEST_FIELDS,
    };
    if (status !== null) payload.payment_status = status;
    let { data, error } = await supabase.from('trip_finance_items').insert(payload).select().maybeSingle();
    // Kalau gagal karena kolom request belum ada, coba lagi tanpa field tsb
    if (error && /payment_request|payment_phase|skip_deposit|payment_requested/i.test(error.message)) {
      const stripped = { ...payload };
      Object.keys(REQUEST_FIELDS).forEach((k) => delete stripped[k]);
      ({ data, error } = await supabase.from('trip_finance_items').insert(stripped).select().maybeSingle());
    }
    if (!error) { inserted = data; break; }
    lastErr = error.message;
    if (!/payment_status/i.test(lastErr) && !/check.*constraint/i.test(lastErr)) break;
  }
  if (!inserted) return { error: 'Insert HPP failed: ' + lastErr };

  const refField = type === 'biometric' ? 'visa_biometric_hpp_item_id' : 'visa_cost_hpp_item_id';
  try {
    await supabase.from('trip_passengers').update({
      [refField]: inserted.id,
      [type === 'biometric' ? 'visa_biometric_cost' : 'visa_visa_cost']: amount,
    }).eq('id', passengerId);
  } catch {}

  revalidatePath(`/visa/${pax.trip_id}`);
  revalidatePath(`/finance/cashflow/${pax.trip_id}`);
  return { ok: true, hpp_item: inserted, message: `Request pembayaran terkirim ke Accounting — masuk HPP & menunggu approve` };
}

// ============================================================
// FONNTE SEND
// ============================================================
async function fonnteSend(targetPhone, message, attachmentUrl = null) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) return { error: 'FONNTE_TOKEN belum di-set' };
  const params = new URLSearchParams();
  params.append('target', targetPhone);
  params.append('message', message);
  if (attachmentUrl) {
    params.append('url', attachmentUrl);
    // filename membantu Fonnte mengenali & melampirkan media dgn benar
    const fname = String(attachmentUrl).split('/').pop().split('?')[0] || 'visa.jpg';
    params.append('filename', fname);
  }
  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { 'Authorization': token, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const result = await res.json();
    if (result.status === true || result.status === 'true') return { ok: true, fonnte: result };
    return { error: 'Fonnte: ' + (result.reason || result.detail || 'unknown') };
  } catch (e) {
    return { error: 'Fonnte fetch failed: ' + e.message };
  }
}

// ============================================================
// SEND VISA WA (R215o — auto-switch no-biometric + auto-gen token)
// ============================================================
export async function sendVisaWA({ tripId, passengerIds, templateKey, customVars = {}, familyAware = false }) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  if (!VISA_WA_TEMPLATES[templateKey]) return { error: 'Template invalid' };
  if (!Array.isArray(passengerIds) || passengerIds.length === 0) return { error: 'Pilih minimal 1 peserta' };

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };

  // R215o: AUTO-SWITCH template kalau trip no-biometric & template = doc_collection
  let effectiveTemplateKey = templateKey;
  if (templateKey === 'doc_collection' && trip.visa_needs_biometric === false) {
    effectiveTemplateKey = 'doc_collection_no_biometric';
  }

  const { data: passengers } = await supabase.from('trip_passengers').select('*').in('id', passengerIds);
  const custIds = (passengers || []).map((p) => p.customer_id).filter(Boolean);
  const { data: customers } = await supabase.from('customers').select('*').in('id', custIds);
  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));

  let targetPaxList = passengers || [];
  let familyMemberMap = {};
  if (familyAware) {
    const grouped = {};
    const noFamily = [];
    for (const p of targetPaxList) {
      if (p.family_group_id) {
        if (!grouped[p.family_group_id]) grouped[p.family_group_id] = [];
        grouped[p.family_group_id].push(p);
      } else noFamily.push(p);
    }
    targetPaxList = noFamily.slice();
    for (const [familyId, members] of Object.entries(grouped)) {
      const head = members[0];
      targetPaxList.push(head);
      familyMemberMap[head.id] = members.map((m) => custMap[m.customer_id]?.name || `#${m.id}`).join(', ');
    }
  }

  // R215o: Auto-generate upload_token kalau template no-biometric & belum ada token
  const needsToken = effectiveTemplateKey === 'doc_collection_no_biometric';
  if (needsToken) {
    for (const pax of targetPaxList) {
      if (!pax.visa_upload_token) {
        const token = `vsa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await supabase.from('trip_passengers').update({ visa_upload_token: token }).eq('id', pax.id);
        pax.visa_upload_token = token;
      }
    }
  }

  const deadlineDoc = trip.visa_deadline_doc || autoDeadlineDoc(trip.departure);
  const baseVars = {
    nama_trip: trip.name,
    country_name: trip.visa_country || 'Negara Tujuan',
    tanggal_keberangkatan: trip.departure,
    lokasi_biometrik: trip.visa_biometric_location,
    field_team_phone: trip.visa_field_team_phone,
    pickup_address: trip.visa_pickup_address,
    pdf_syarat_visa_url: trip.visa_pdf_syarat_url,
    pdf_template_dokumen_url: trip.visa_pdf_template_url,
    list_dokumen: trip.visa_doc_template,   // SINKRON dgn Template Dokumen Visa (chip yg di-save)
    deadline_dokumen: deadlineDoc,
    ...customVars,
  };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const siteBase = (siteUrlFor(currentBrandCode()) || 'https://teone.dev').replace(/\/$/, '');
  const results = [];
  for (const pax of targetPaxList) {
    const cust = custMap[pax.customer_id];
    if (!cust?.phone) { results.push({ pax_id: pax.id, error: 'Phone gak ada' }); continue; }

    // Link rapi & aman: teone.dev/visa/hasil/{token} (proxy ke file private; domain Supabase tidak tampil)
    let signedPhoto = null;
    if (pax.visa_result_photo_url) {
      if (!pax.visa_result_token) {
        const vtok = `vrs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await supabase.from('trip_passengers').update({ visa_result_token: vtok }).eq('id', pax.id);
        pax.visa_result_token = vtok;
      }
      signedPhoto = `${siteBase}/visa/hasil/${pax.visa_result_token}`;
    }

    const paxVars = {
      ...baseVars,
      nama_peserta: cust.name,
      nama_kepala_keluarga: cust.name,
      list_nama_anggota_family: familyMemberMap[pax.id] || cust.name,
      tanggal_biometrik: pax.visa_biometric_date || trip.visa_biometric_date,
      jam_biometrik: pax.visa_biometric_time || null,
      visa_valid_from: pax.visa_valid_from,
      visa_valid_until: pax.visa_valid_until,
      visa_entry_type: pax.visa_entry_type,
      return_kurir: pax.visa_return_kurir,
      return_resi: pax.visa_return_resi,
      rejection_reason: pax.visa_rejection_reason,
      // R215o: return_method per peserta
      return_method: pax.visa_return_method || 'kurir',
      // foto hasil visa (utk link fallback di pesan)
      visa_photo_url: signedPhoto,
      // kekurangan dokumen PER-PESERTA (tersimpan di pax), fallback ke input saat send
      list_dokumen_kurang: (pax.visa_docs_shortage && String(pax.visa_docs_shortage).trim())
        ? pax.visa_docs_shortage
        : (customVars.list_dokumen_kurang || undefined),
      // R215o: upload_portal_url generated above kalau needsToken
      upload_portal_url: pax.visa_upload_token
        ? `${siteUrl}/visa/upload/${pax.visa_upload_token}`
        : '(belum di-generate)',
    };

    // R215o: Render dgn trip param untuk pakai override
    const message = renderTemplate(effectiveTemplateKey, paxVars, trip);

    let attachmentUrl = null;
    if (effectiveTemplateKey === 'visa_approved' || effectiveTemplateKey === 'visa_rejected') {
      attachmentUrl = signedPhoto;   // signed URL 7 hari (bucket private)
    }

    const sendRes = await fonnteSend(cust.phone, message, attachmentUrl);
    results.push({ pax_id: pax.id, pax_name: cust.name, phone: cust.phone, ...sendRes });

    if (sendRes.ok) {
      try {
        await supabase.from('trip_passengers').update({
          visa_last_wa_sent_at: new Date().toISOString(),
          visa_last_wa_template: effectiveTemplateKey,
        }).eq('id', pax.id);
      } catch {}
    }
  }

  revalidatePath(`/visa/${tripId}`);
  const okCount = results.filter((r) => r.ok).length;
  return {
    ok: true,
    sent: okCount,
    failed: results.length - okCount,
    results,
    family_aware: familyAware,
    family_count: Object.keys(familyMemberMap).length,
    template_used: effectiveTemplateKey,
    template_switched: effectiveTemplateKey !== templateKey,
  };
}

// ============================================================
// UPLOAD VISA RESULT (sekarang fileUrl di-supply dari upload action separate)
// ============================================================
export async function uploadVisaResult(passengerId, fileUrl, result, extras = {}) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  if (!['approved', 'rejected'].includes(result)) return { error: 'Result harus approved atau rejected' };

  const update = {
    visa_result: result,
    visa_result_photo_url: fileUrl || null,
  };
  if (result === 'approved') {
    if (extras.valid_from) update.visa_valid_from = extras.valid_from;
    if (extras.valid_until) update.visa_valid_until = extras.valid_until;
    if (extras.entry_type) update.visa_entry_type = extras.entry_type;
    if (extras.return_kurir) update.visa_return_kurir = extras.return_kurir;
    if (extras.return_resi) update.visa_return_resi = extras.return_resi;
    if (extras.return_method) update.visa_return_method = extras.return_method;
  }
  if (result === 'rejected' && extras.rejection_reason) {
    update.visa_rejection_reason = extras.rejection_reason;
  }

  const { data: pax } = await supabase.from('trip_passengers').select('trip_id').eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const { error } = await supabase.from('trip_passengers').update(update).eq('id', passengerId);
  if (error) return { error: 'Update failed: ' + error.message };

  revalidatePath(`/visa/${pax.trip_id}`);

  if (extras.auto_send_wa) {
    const wares = await sendVisaWA({
      tripId: pax.trip_id,
      passengerIds: [passengerId],
      templateKey: result === 'approved' ? 'visa_approved' : 'visa_rejected',
      customVars: {},
      familyAware: false,
    });
    return { ok: true, wa_sent: wares.ok && wares.sent > 0, wa_result: wares };
  }
  return { ok: true };
}

// ============================================================
// GENERATE upload token (manual trigger)
// ============================================================
export async function generateUploadToken(passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const token = `vsa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const { data: pax } = await supabase.from('trip_passengers').select('trip_id').eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const { error } = await supabase.from('trip_passengers').update({ visa_upload_token: token }).eq('id', passengerId);
  if (error) return { error: 'Update failed: ' + error.message };

  revalidatePath(`/visa/${pax.trip_id}`);
  const uploadUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/visa/upload/${token}`;
  return { ok: true, token, upload_url: uploadUrl };
}
