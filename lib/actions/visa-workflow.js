// R215m + R215n: Visa workflow server actions
// R215n FIX:
//   - updateTripVisaConfig: defensive — kalau column missing, retry tanpa field itu
//   - REMOVE visa_biometric_time dari trip-level (sekarang per-pax)
//   - NEW updatePassengerBiometricTime — per peserta
//   - sendVisaWA: jam_biometrik prefer pax.visa_biometric_time, fallback trip
// Path: lib/actions/visa-workflow.js

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { renderTemplate, VISA_WA_TEMPLATES, autoDeadlineDoc } from '@/lib/utils/visa-templates';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ============================================================
// 1. UPDATE TRIP VISA CONFIG (R215n FIX — defensive retry)
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
    // R215n: visa_biometric_time DIHAPUS dari trip-level (sekarang per pax)
    'visa_pickup_address',
    'visa_default_biometric_cost', 'visa_default_visa_cost',
    'visa_deadline_doc',
    'visa_country', 'visa_notes',
  ];
  const update = {};
  for (const k of allowed) {
    if (config[k] !== undefined) {
      // Convert empty string to null untuk date/text optional fields
      if (config[k] === '') update[k] = null;
      else update[k] = config[k];
    }
  }
  if (Object.keys(update).length === 0) return { error: 'Tidak ada field yg di-update' };

  // R215n: Defensive retry — strip missing columns
  const droppedCols = [];
  let attempt = 0;
  const maxAttempts = 10;

  while (attempt < maxAttempts) {
    attempt++;
    const { error } = await supabase.from('trips').update(update).eq('id', tripId);
    if (!error) {
      revalidatePath(`/visa/${tripId}`);
      revalidatePath('/visa');
      if (droppedCols.length > 0) {
        return {
          ok: true,
          warning: `Kolom belum ada di DB: ${droppedCols.join(', ')}. Jalankan SQL R215m untuk add columns. Field lain udah ke-save.`
        };
      }
      return { ok: true };
    }
    // Try detect missing column dari error message
    const missingMatch = error.message.match(/column "([^"]+)" .* does not exist/i) ||
                         error.message.match(/Could not find the '([^']+)' column/i);
    if (missingMatch) {
      const missingCol = missingMatch[1];
      delete update[missingCol];
      droppedCols.push(missingCol);
      if (Object.keys(update).length === 0) {
        return { error: `Semua field belum ada di DB. Jalankan SQL R215m. Dropped: ${droppedCols.join(', ')}` };
      }
      continue; // retry
    }
    return { error: 'Update failed: ' + error.message };
  }
  return { error: 'Gagal setelah ' + maxAttempts + ' attempts. Dropped: ' + droppedCols.join(', ') };
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
    if (new RegExp(field).test(error.message)) {
      return { error: `Kolom ${field} belum ada — jalankan SQL R215m dulu` };
    }
    return { error: 'Update failed: ' + error.message };
  }

  revalidatePath(`/visa/${pax.trip_id}`);
  return { ok: true };
}

// ============================================================
// R215n NEW — UPDATE PER-PESERTA BIOMETRIC TIME
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

  if (error) {
    if (/visa_biometric_time/.test(error.message)) {
      return { error: 'Kolom visa_biometric_time belum ada — jalankan SQL R215n' };
    }
    return { error: 'Update failed: ' + error.message };
  }

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

  const { data: cust } = await supabase
    .from('customers')
    .select('name')
    .eq('id', pax.customer_id)
    .maybeSingle();

  const paxName = cust?.name || `#${pax.id}`;
  const componentLabel = type === 'biometric'
    ? `Biaya Biometrik · ${paxName}`
    : `Biaya Visa · ${paxName}`;

  const PAYMENT_STATUS_CANDIDATES = ['belum lunas', 'pending', 'unpaid', null];
  let inserted = null;
  let lastErr = null;
  for (const status of PAYMENT_STATUS_CANDIDATES) {
    const payload = {
      trip_id: pax.trip_id,
      item_type: 'hpp',
      category: type === 'biometric' ? 'Biometrik Visa' : 'Visa',
      component: componentLabel,
      vendor_name: vendor || null,
      qty: 1,
      basic_fare: amount,
      total_amount: amount,
      notes: notes || `Request DP untuk ${type} ${paxName}`,
    };
    if (status !== null) payload.payment_status = status;

    const { data, error } = await supabase
      .from('trip_finance_items')
      .insert(payload)
      .select()
      .maybeSingle();
    if (!error) { inserted = data; break; }
    lastErr = error.message;
    if (!/payment_status/i.test(lastErr) && !/check.*constraint/i.test(lastErr)) break;
  }

  if (!inserted) return { error: 'Insert HPP failed: ' + lastErr };

  const refField = type === 'biometric' ? 'visa_biometric_hpp_item_id' : 'visa_cost_hpp_item_id';
  try {
    await supabase
      .from('trip_passengers')
      .update({
        [refField]: inserted.id,
        [type === 'biometric' ? 'visa_biometric_cost' : 'visa_visa_cost']: amount,
      })
      .eq('id', passengerId);
  } catch {}

  revalidatePath(`/visa/${pax.trip_id}`);
  revalidatePath(`/finance/cashflow/${pax.trip_id}`);
  revalidatePath(`/accounting/groups/${pax.trip_id}`);

  return {
    ok: true,
    hpp_item: inserted,
    message: `HPP item dibuat — silakan klik 💰 Request DP di Finance Cashflow untuk approval`,
  };
}

// ============================================================
// 4. SEND WA via FONNTE
// ============================================================
async function fonnteSend(targetPhone, message, attachmentUrl = null) {
  const token = process.env.FONNTE_TOKEN;
  if (!token) return { error: 'FONNTE_TOKEN env belum di-set' };

  const params = new URLSearchParams();
  params.append('target', targetPhone);
  params.append('message', message);
  if (attachmentUrl) params.append('url', attachmentUrl);

  try {
    const res = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const result = await res.json();
    if (result.status === true || result.status === 'true') {
      return { ok: true, fonnte: result };
    }
    return { error: 'Fonnte: ' + (result.reason || result.detail || 'unknown') };
  } catch (e) {
    return { error: 'Fonnte fetch failed: ' + e.message };
  }
}

// ============================================================
// 5. SEND VISA WA (R215n FIX — jam_biometrik prefer pax-level)
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

  const { data: passengers } = await supabase
    .from('trip_passengers')
    .select('*')
    .in('id', passengerIds);

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

  const deadlineDoc = trip.visa_deadline_doc || autoDeadlineDoc(trip.departure);
  const baseVars = {
    nama_trip: trip.name,
    country_name: trip.visa_country || 'Negara Tujuan',
    tanggal_keberangkatan: trip.departure,
    lokasi_biometrik: trip.visa_biometric_location,
    pickup_address: trip.visa_pickup_address,
    pdf_syarat_visa_url: trip.visa_pdf_syarat_url,
    pdf_template_dokumen_url: trip.visa_pdf_template_url,
    deadline_dokumen: deadlineDoc,
    ...customVars,
  };

  const results = [];
  for (const pax of targetPaxList) {
    const cust = custMap[pax.customer_id];
    if (!cust?.phone) {
      results.push({ pax_id: pax.id, error: 'Phone gak ada' });
      continue;
    }

    const paxVars = {
      ...baseVars,
      nama_peserta: cust.name,
      nama_kepala_keluarga: cust.name,
      list_nama_anggota_family: familyMemberMap[pax.id] || cust.name,
      // R215n FIX: jam_biometrik & tanggal_biometrik dari pax-level
      tanggal_biometrik: pax.visa_biometric_date || trip.visa_biometric_date,
      jam_biometrik: pax.visa_biometric_time || trip.visa_biometric_time,
      visa_valid_from: pax.visa_valid_from,
      visa_valid_until: pax.visa_valid_until,
      visa_entry_type: pax.visa_entry_type,
      return_kurir: pax.visa_return_kurir,
      return_resi: pax.visa_return_resi,
      rejection_reason: pax.visa_rejection_reason,
      upload_portal_url: pax.visa_upload_token
        ? `${process.env.NEXT_PUBLIC_SITE_URL || ''}/visa/upload/${pax.visa_upload_token}`
        : '(belum di-generate)',
    };

    const message = renderTemplate(templateKey, paxVars);

    let attachmentUrl = null;
    if (templateKey === 'visa_approved' || templateKey === 'visa_rejected') {
      attachmentUrl = pax.visa_result_photo_url;
    }

    const sendRes = await fonnteSend(cust.phone, message, attachmentUrl);
    results.push({
      pax_id: pax.id,
      pax_name: cust.name,
      phone: cust.phone,
      ...sendRes,
    });

    if (sendRes.ok) {
      try {
        await supabase
          .from('trip_passengers')
          .update({
            visa_last_wa_sent_at: new Date().toISOString(),
            visa_last_wa_template: templateKey,
          })
          .eq('id', pax.id);
      } catch {}
    }
  }

  revalidatePath(`/visa/${tripId}`);
  const okCount = results.filter((r) => r.ok).length;
  const errCount = results.length - okCount;
  return {
    ok: true,
    sent: okCount,
    failed: errCount,
    results,
    family_aware: familyAware,
    family_count: Object.keys(familyMemberMap).length,
  };
}

// ============================================================
// 6. UPLOAD VISA RESULT
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
  }
  if (result === 'rejected' && extras.rejection_reason) {
    update.visa_rejection_reason = extras.rejection_reason;
  }

  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const { error } = await supabase
    .from('trip_passengers')
    .update(update)
    .eq('id', passengerId);
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
// 7. GENERATE upload token
// ============================================================
export async function generateUploadToken(passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const token = `vsa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const { error } = await supabase
    .from('trip_passengers')
    .update({ visa_upload_token: token })
    .eq('id', passengerId);
  if (error) return { error: 'Update failed: ' + error.message };

  revalidatePath(`/visa/${pax.trip_id}`);
  const uploadUrl = `${process.env.NEXT_PUBLIC_SITE_URL || ''}/visa/upload/${token}`;
  return { ok: true, token, upload_url: uploadUrl };
}
