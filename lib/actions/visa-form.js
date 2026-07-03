'use server';

// Form Tambahan Visa (France/USA/UK) — isi via web, kirim WA, submit + notif.
// ADDITIVE. Aman: data via service role; akses publik dibatasi token acak per kepala keluarga/solo.

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { sendFonnte } from '@/lib/utils/fonnte';
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { assertStaff } from '@/lib/auth/require-staff';
import { getVisaForm, visaFormLabel, VISA_FORMS } from '@/lib/utils/visa-form-defs';
import { revalidatePath } from 'next/cache';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
function genToken() { return `vf_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`; }
function salam() {
  const h = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
}

async function membersForTokenPax(db, tokenPax) {
  if (tokenPax.family_group_id) {
    const { data } = await db.from('trip_passengers')
      .select('id, customer_id, family_group_id, is_family_head')
      .eq('family_group_id', tokenPax.family_group_id);
    return data && data.length ? data : [tokenPax];
  }
  return [tokenPax];
}

// Prefill dari customer
function prefillFor(cust) {
  const sexLabel = (() => {
    const s = String(cust?.sex || cust?.gender || '').toUpperCase();
    if (s === 'M' || s === 'L') return 'Laki-laki';
    if (s === 'F' || s === 'P') return 'Perempuan';
    return '';
  })();
  return {
    name: cust?.name || '',
    passport_no: cust?.passport_number || cust?.passport_no || '',
    dob: cust?.dob || cust?.birthday || '',
    pob: cust?.place_of_birth || cust?.city || '',
    nationality: cust?.nationality || 'INDONESIA',
    sex: sexLabel,
    phone: cust?.phone || cust?.whatsapp || '',
    email: cust?.email || '',
  };
}
// map prefill -> nilai default per field key
function defaultsFromForm(formType, cust) {
  const form = getVisaForm(formType);
  const pf = prefillFor(cust);
  const out = {};
  if (!form) return out;
  for (const sec of form.sections) for (const f of sec.fields) {
    if (f.prefill && pf[f.prefill]) out[f.key] = pf[f.prefill];
  }
  return out;
}

async function ensureHeadToken(db, passengerId, formType) {
  const { data: pax } = await db.from('trip_passengers')
    .select('id, trip_id, customer_id, family_group_id, is_family_head, visa_form_token')
    .eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };
  let head = pax;
  if (pax.family_group_id) {
    const { data: fg } = await db.from('family_groups').select('head_passenger_id').eq('id', pax.family_group_id).maybeSingle();
    if (fg?.head_passenger_id) {
      const { data: hp } = await db.from('trip_passengers')
        .select('id, trip_id, customer_id, family_group_id, is_family_head, visa_form_token')
        .eq('id', fg.head_passenger_id).maybeSingle();
      if (hp) head = hp;
    }
  }
  let token = head.visa_form_token;
  if (!token) token = genToken();
  // selalu set form_type terbaru (CS pilih saat kirim)
  await db.from('trip_passengers').update({ visa_form_token: token, visa_form_type: formType }).eq('id', head.id);
  return { head, token };
}

// ===== STAFF: kirim WA form ke kepala keluarga/solo (nomor visa/CS) =====
export async function sendVisaFormWA(passengerId, formType) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/visa'); if (g.error) return { error: g.error }; }
  if (!VISA_FORMS[formType]) return { error: 'Jenis form tidak valid' };

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };
  const { head, token, error } = await ensureHeadToken(db, passengerId, formType);
  if (error) return { error };

  const [{ data: cust }, { data: trip }] = await Promise.all([
    db.from('customers').select('name, phone, whatsapp').eq('id', head.customer_id).maybeSingle(),
    db.from('trips').select('kode_trip, name').eq('id', head.trip_id).maybeSingle(),
  ]);
  const phone = cust?.whatsapp || cust?.phone;
  if (!phone) return { error: `Kepala keluarga "${cust?.name || '-'}" belum punya no HP/WA` };

  const members = await membersForTokenPax(db, head);
  const memCustIds = [...new Set(members.map((m) => m.customer_id).filter(Boolean))];
  let memNames = [];
  if (memCustIds.length) {
    const { data: cs } = await db.from('customers').select('id, name').in('id', memCustIds);
    const map = Object.fromEntries((cs || []).map((c) => [c.id, c.name]));
    memNames = members.map((m) => map[m.customer_id] || '-');
  }

  const code = currentBrandCode();
  const base = (customerSiteUrlFor(code) || 'https://travelingeropa.com').replace(/\/$/, '');
  const link = `${base}/visa/form/${token}`;
  const brandName = code === 'khasanah' ? 'Khasanah Travel' : 'Traveling Eropa';

  const lines = [
    `${salam()} *${cust?.name || 'Kak'}* 🙏`,
    `Kami tim Visa *${brandName}*.`,
    '',
    `Sebelum jadwal biometrik, mohon lengkapi *Formulir Aplikasi Visa ${visaFormLabel(formType)}* untuk peserta berikut:`,
    ...memNames.map((n) => `• ${n}`),
    '',
    `Isi lengkap di link berikut (sebagian data sudah kami isikan otomatis):`,
    link,
    '',
    `Mohon diisi secepatnya & jujur ya. Terima kasih 🙏`,
  ];
  const res = await sendFonnte(phone, lines.join('\n'), { context: 'visa', brand: code });
  if (res.error) return { error: res.error };
  try { revalidatePath(`/visa/${head.trip_id}`); } catch {}
  return { ok: true, sentTo: cust?.name || phone, members: memNames.length };
}

// ===== STAFF: kirim ke semua keluarga/solo yg belum submit =====
export async function sendVisaFormWABulk(tripId, formType) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/visa'); if (g.error) return { error: g.error }; }
  if (!VISA_FORMS[formType]) return { error: 'Jenis form tidak valid' };

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };
  const { data: pax } = await db.from('trip_passengers')
    .select('id, family_group_id, is_family_head, include_visa, visa_ready').eq('trip_id', tripId);
  if (!pax || !pax.length) return { ok: true, sent: 0, message: 'Tidak ada peserta' };
  // Hanya peserta yang visanya DIURUS di kita (include_visa). Yang sudah ready / tidak diurus dilewati.
  const needsVisa = (p) => !!p.include_visa;

  // peserta yg sudah submit form ini
  const ids = pax.map((p) => p.id);
  const { data: subs } = await db.from('visa_form_responses')
    .select('passenger_id, status').eq('form_type', formType).in('passenger_id', ids);
  const submittedSet = new Set((subs || []).filter((s) => s.status === 'submitted').map((s) => s.passenger_id));

  const fgHead = {}; const solos = []; const famMissing = {};
  for (const p of pax) {
    if (p.family_group_id) {
      if (p.is_family_head) fgHead[p.family_group_id] = p.id;
      if (needsVisa(p) && !submittedSet.has(p.id)) famMissing[p.family_group_id] = true;
    } else if (needsVisa(p) && !submittedSet.has(p.id)) solos.push(p.id);
  }
  for (const p of pax) if (p.family_group_id && !fgHead[p.family_group_id]) fgHead[p.family_group_id] = p.id;

  const targets = [];
  for (const [fg, hid] of Object.entries(fgHead)) if (famMissing[fg]) targets.push(hid);
  targets.push(...solos);

  let sent = 0, failed = 0, skipped = 0; const errors = [];
  for (const pid of targets) {
    const r = await sendVisaFormWA(pid, formType);
    if (r?.ok) sent++;
    else if (r?.error && /no HP/.test(r.error)) skipped++;
    else { failed++; if (r?.error) errors.push(r.error); }
  }
  return { ok: true, sent, failed, skipped, message: `📨 ${sent} terkirim${skipped ? ` · ${skipped} tanpa no HP` : ''}${failed ? ` · ${failed} gagal` : ''}`, errors };
}

// ===== PUBLIC: konteks halaman isi form =====
export async function getVisaFormContext(token) {
  if (!token || !/^vf_/.test(String(token))) return { error: 'Link tidak valid' };
  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };
  const { data: tokenPax } = await db.from('trip_passengers')
    .select('id, trip_id, customer_id, family_group_id, visa_form_type')
    .eq('visa_form_token', token).maybeSingle();
  if (!tokenPax) return { error: 'Link tidak valid atau sudah kedaluwarsa' };
  const formType = tokenPax.visa_form_type || 'france';
  if (!VISA_FORMS[formType]) return { error: 'Jenis form tidak dikenal' };

  const { data: trip } = await db.from('trips').select('kode_trip, name').eq('id', tokenPax.trip_id).maybeSingle();
  const members = await membersForTokenPax(db, tokenPax);
  const custIds = [...new Set(members.map((m) => m.customer_id).filter(Boolean))];
  const { data: cs } = custIds.length ? await db.from('customers').select('*').in('id', custIds) : { data: [] };
  const custMap = Object.fromEntries((cs || []).map((c) => [c.id, c]));

  const memberIds = members.map((m) => m.id);
  const { data: resp } = await db.from('visa_form_responses')
    .select('passenger_id, data, status').eq('form_type', formType).in('passenger_id', memberIds);
  const respMap = Object.fromEntries((resp || []).map((r) => [r.passenger_id, r]));

  return {
    ok: true,
    formType,
    formLabel: visaFormLabel(formType),
    tripName: `${trip?.kode_trip ? trip.kode_trip + ' — ' : ''}${trip?.name || 'Trip'}`,
    members: members.map((m) => {
      const cust = custMap[m.customer_id] || {};
      const existing = respMap[m.id];
      const data = { ...defaultsFromForm(formType, cust), ...(existing?.data || {}) };
      return { id: m.id, name: cust.name || `Peserta #${m.id}`, status: existing?.status || 'none', data };
    }),
  };
}

async function writeForm(db, token, passengerId, data, submit) {
  if (!token || !/^vf_/.test(String(token))) return { error: 'Link tidak valid' };
  const { data: tokenPax } = await db.from('trip_passengers')
    .select('id, trip_id, family_group_id, visa_form_type').eq('visa_form_token', token).maybeSingle();
  if (!tokenPax) return { error: 'Link tidak valid' };
  const formType = tokenPax.visa_form_type || 'france';
  const allowed = await membersForTokenPax(db, tokenPax);
  const target = allowed.find((m) => String(m.id) === String(passengerId));
  if (!target) return { error: 'Peserta tidak sesuai link' };

  const clean = (data && typeof data === 'object') ? data : {};
  if (submit) {
    const form = getVisaForm(formType);
    const missing = [];
    for (const sec of form.sections) for (const f of sec.fields) {
      if (f.required && !String(clean[f.key] ?? '').trim()) missing.push(f.label);
    }
    if (missing.length) return { error: 'Wajib diisi: ' + missing.slice(0, 6).join('; ') + (missing.length > 6 ? `; +${missing.length - 6} lagi` : '') };
  }

  const payload = {
    passenger_id: passengerId, trip_id: tokenPax.trip_id, form_type: formType,
    data: clean, status: submit ? 'submitted' : 'draft',
    submitted_at: submit ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
  };
  const { error } = await db.from('visa_form_responses')
    .upsert(payload, { onConflict: 'passenger_id,form_type' });
  if (error) return { error: 'Gagal simpan: ' + error.message };
  try { revalidatePath(`/visa/${tokenPax.trip_id}`); } catch {}
  return { ok: true, status: payload.status };
}

export async function saveVisaFormDraft(token, passengerId, data) {
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  try { return await writeForm(db, token, passengerId, data, false); }
  catch (e) { return { error: 'Gagal: ' + (e?.message || 'unknown') }; }
}
export async function submitVisaForm(token, passengerId, data) {
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  try { return await writeForm(db, token, passengerId, data, true); }
  catch (e) { return { error: 'Gagal: ' + (e?.message || 'unknown') }; }
}

// ===== STAFF: lihat jawaban (review) =====
export async function getVisaFormResponse(passengerId, formType) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/visa'); if (g.error) return { error: g.error }; }
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const { data } = await db.from('visa_form_responses')
    .select('data, status, submitted_at').eq('passenger_id', passengerId).eq('form_type', formType).maybeSingle();
  return { ok: true, response: data || null };
}
