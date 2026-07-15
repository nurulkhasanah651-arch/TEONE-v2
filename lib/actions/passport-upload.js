'use server';

// Passport Upload via WA link + auto-scan AI.
// ADDITIVE — tidak mengubah alur passport AI existing.
// Keamanan: file disimpan di bucket PRIVAT 'passport-uploads' (bukan publik).
//   - Upload publik (peserta) lewat server action ini via service role (kunci tak terekspos).
//   - Scan AI pakai SIGNED URL singkat (≤5 menit), bukan URL publik.
//   - Akses dibatasi token acak per kepala keluarga/solo; anggota wajib 1 family group.

import { createClient } from '@/lib/supabase/server';
import { getPicNameForTrip, getPicFonnteTokenById } from '@/lib/auth/pic-scope';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, brandSupabaseAnonKey, currentBrandCode } from '@/lib/supabase/service-env';
import { sendFonnte } from '@/lib/utils/fonnte';
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { extractPassportData } from '@/lib/actions/passport';
import { assertStaff } from '@/lib/auth/require-staff';
import { revalidatePath } from 'next/cache';
import { trySendWabaForTrip, trySendWabaTemplateForTrip } from '@/lib/utils/waba-send';

const BUCKET = 'passport-uploads';
const MAX_BYTES = 20 * 1024 * 1024; // 20MB (upload langsung ke storage, lewati batas body Vercel)
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function genToken() {
  return `pp_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function salam() {
  const h = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
}

// Anggota yg ditanggung token (kepala keluarga -> semua anggota; solo -> dirinya)
async function membersForTokenPax(db, tokenPax) {
  if (tokenPax.family_group_id) {
    const { data: mem } = await db.from('trip_passengers')
      .select('id, customer_id, passport_upload_path, passport_uploaded_at, is_family_head, passport_extra_paths')
      .eq('trip_id', tokenPax.trip_id)
      .eq('family_group_id', tokenPax.family_group_id);
    return mem || [tokenPax];
  }
  return [tokenPax];
}

// Pax tujuan kirim (kepala keluarga bila famili, else dirinya) + pastikan token
async function ensureHeadToken(db, passengerId) {
  const { data: pax } = await db.from('trip_passengers')
    .select('id, trip_id, customer_id, family_group_id, is_family_head, passport_upload_token')
    .eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };

  let head = pax;
  if (pax.family_group_id) {
    // Grup HARUS milik trip yg sama. Ada data lama yg menunjuk grup trip lain -> tanpa
    // penjaga ini link peserta bisa terkirim ke kepala keluarga di TRIP BERBEDA.
    const { data: fg } = await db.from('family_groups').select('head_passenger_id, trip_id').eq('id', pax.family_group_id).maybeSingle();
    if (fg?.head_passenger_id && fg.trip_id === pax.trip_id) {
      const { data: hp } = await db.from('trip_passengers')
        .select('id, trip_id, customer_id, family_group_id, is_family_head, passport_upload_token')
        .eq('id', fg.head_passenger_id).eq('trip_id', pax.trip_id).maybeSingle();
      if (hp) head = hp;
    } else if (fg && fg.trip_id !== pax.trip_id) {
      console.error('[passport ensureHeadToken] family_group lintas trip diabaikan', { pax_id: pax.id, pax_trip: pax.trip_id, fgid: pax.family_group_id, fg_trip: fg.trip_id });
    }
  }
  let token = head.passport_upload_token;
  if (!token) {
    token = genToken();
    await db.from('trip_passengers').update({ passport_upload_token: token }).eq('id', head.id);
  }
  return { head, token };
}

// ====== STAFF: kirim WA link upload ke kepala keluarga / solo (nomor CS) ======
export async function sendPassportUploadWA(passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/trips'); if (g.error) return { error: g.error }; }

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  const { head, token, error } = await ensureHeadToken(db, passengerId);
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
  const link = `${base}/passport/upload/${token}`;
  const brandName = code === 'khasanah' ? 'Khasanah Travel' : 'Traveling Eropa';
  const _picName = await getPicNameForTrip(db, head.trip_id);

  const lines = [
    `${salam()} *${cust?.name || 'Kak'}* 🙏`,
    _picName ? `Saya *${_picName}*, PIC trip kamu di *${brandName}*.` : `Perkenalkan, kami tim *${brandName}*.`,
    '',
    `Untuk kelengkapan dokumen trip *${trip?.kode_trip ? trip.kode_trip + ' — ' : ''}${trip?.name || ''}*, mohon upload *foto/scan halaman biodata paspor* (boleh foto atau PDF) untuk peserta berikut:`,
    ...memNames.map((n) => `• ${n}`),
    '',
    `Silakan upload lewat link berikut (aman, khusus keluarga Anda):`,
    link,
    '',
    `Cukup buka link, lalu upload paspor tiap peserta. Terima kasih 🙏`,
  ];

  // WABA: template resmi dulu (bisa ke peserta yg belum chat / di luar 24 jam), lalu teks (24 jam), lalu Fonnte.
  const _tplPassport = process.env[`WABA_TPL_PASSPORT_${code === 'khasanah' ? 'KHASANAH' : 'TEONE'}`] || `dokumen_paspor_${code}`;
  const _tripLabel = `${trip?.kode_trip ? trip.kode_trip + ' \u2014 ' : ''}${trip?.name || ''}`.trim();
  // Param template dokumen_paspor_<brand>: {{1}}Kak nama {{2}}trip {{3}}link (link di BODY, template tanpa tombol)
  const _passportParams = [(cust?.name ? 'Kak ' + cust.name : 'Kak'), _tripLabel || '-', link];
  let _waba = await trySendWabaTemplateForTrip(db, head.trip_id, phone, _tplPassport, _passportParams, { kind: 'waba_passport' });
  if (!_waba?.ok) _waba = await trySendWabaForTrip(db, head.trip_id, phone, lines.join('\n'), { context: 'cs', kind: 'waba_passport' });
  if (!_waba?.ok) {
    const _picTok = await getPicFonnteTokenById(db, head.trip_id); // dari nomor PIC bila di-set, else fallback CS
    const res = await sendFonnte(phone, lines.join('\n'), { context: 'cs', brand: code, token: _picTok });
    if (res.error) return { error: res.error };
  }
  try { revalidatePath(`/trips/${head.trip_id}/passport-manage`); } catch {}
  return { ok: true, sentTo: cust?.name || phone, members: memNames.length };
}

// ====== STAFF: kirim ke semua keluarga/solo yg belum lengkap upload ======
export async function sendPassportUploadWABulk(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/trips'); if (g.error) return { error: g.error }; }

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  const { data: pax } = await db.from('trip_passengers')
    .select('id, customer_id, family_group_id, is_family_head, passport_upload_path')
    .eq('trip_id', tripId);
  if (!pax || !pax.length) return { ok: true, sent: 0, message: 'Tidak ada peserta' };

  // Tentukan 1 "perwakilan" per keluarga (kepala) + tiap solo
  const fgHeads = {}; // family_group_id -> headPaxId
  const solos = [];
  const famHasMissing = {}; // family_group_id -> bool (ada anggota belum upload)
  for (const p of pax) {
    if (p.family_group_id) {
      if (p.is_family_head) fgHeads[p.family_group_id] = p.id;
      if (!p.passport_upload_path) famHasMissing[p.family_group_id] = true;
    } else {
      solos.push(p);
    }
  }
  // fallback kepala bila is_family_head tak ada
  for (const p of pax) {
    if (p.family_group_id && !fgHeads[p.family_group_id]) fgHeads[p.family_group_id] = p.id;
  }

  const targets = [];
  for (const [fgId, headId] of Object.entries(fgHeads)) {
    if (famHasMissing[fgId]) targets.push(headId);
  }
  for (const s of solos) {
    if (!s.passport_upload_path) targets.push(s.id);
  }

  let sent = 0, failed = 0, skipped = 0;
  const errors = [];
  for (const pid of targets) {
    const r = await sendPassportUploadWA(pid);
    if (r?.ok) sent++;
    else if (r?.error && /no HP/.test(r.error)) { skipped++; }
    else { failed++; if (r?.error) errors.push(r.error); }
  }
  return { ok: true, sent, failed, skipped, message: `📨 ${sent} terkirim${skipped ? ` · ${skipped} tanpa no HP` : ''}${failed ? ` · ${failed} gagal` : ''}`, errors };
}

// ====== PUBLIC: konteks halaman upload (validasi token) ======
export async function getPassportUploadContext(token) {
  if (!token || !/^pp_/.test(String(token))) return { error: 'Link tidak valid' };
  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  const { data: tokenPax } = await db.from('trip_passengers')
    .select('id, trip_id, customer_id, family_group_id')
    .eq('passport_upload_token', token).maybeSingle();
  if (!tokenPax) return { error: 'Link tidak valid atau sudah kedaluwarsa' };

  const { data: trip } = await db.from('trips').select('kode_trip, name').eq('id', tokenPax.trip_id).maybeSingle();
  const members = await membersForTokenPax(db, tokenPax);
  const custIds = [...new Set(members.map((m) => m.customer_id).filter(Boolean))];
  const { data: cs } = custIds.length ? await db.from('customers').select('id, name').in('id', custIds) : { data: [] };
  const nameMap = Object.fromEntries((cs || []).map((c) => [c.id, c.name]));

  return {
    ok: true,
    tripName: `${trip?.kode_trip ? trip.kode_trip + ' — ' : ''}${trip?.name || 'Trip'}`,
    members: members.map((m) => ({
      id: m.id,
      name: nameMap[m.customer_id] || `Peserta #${m.id}`,
      uploaded: !!m.passport_upload_path,
      extraCount: Array.isArray(m.passport_extra_paths) ? m.passport_extra_paths.length : 0,
    })),
  };
}

// helper: terapkan hasil extract ke customer (TANPA menimpa nama jika sudah ada)
async function applyExtractToCustomer(db, customerId, d) {
  if (!customerId || !d) return;
  const { data: c } = await db.from('customers').select('name, first_name, surname, passport_number, dob, nationality, sex, place_of_birth').eq('id', customerId).maybeSingle();
  const upd = {};
  if (d.passport_number) upd.passport_number = String(d.passport_number).toUpperCase();
  if (d.expiry) upd.passport_expiry = d.expiry;
  if (d.issue_date) upd.passport_issued_date = d.issue_date;
  if (d.place_of_issue) upd.passport_issued_at = d.place_of_issue;
  if (d.nationality_full || d.nationality) upd.nationality = d.nationality_full || d.nationality;
  if (d.dob) upd.dob = d.dob;
  if (d.sex) upd.sex = d.sex;
  if (d.place_of_birth) upd.place_of_birth = d.place_of_birth;
  const mrz = [d.mrz_line1, d.mrz_line2].filter(Boolean).join('\n');
  if (mrz) upd.mrz_raw = mrz;
  // Nama: isi hanya jika kosong (jangan menimpa data yg sudah ada)
  if (c && !c.first_name && d.given_names) upd.first_name = d.given_names;
  if (c && !c.surname && d.surname) upd.surname = d.surname;
  if (c && (!c.name || /^Peserta/i.test(c.name)) && (d.given_names || d.surname)) upd.name = [d.given_names, d.surname].filter(Boolean).join(' ');
  if (Object.keys(upd).length) await db.from('customers').update(upd).eq('id', customerId);
}

// Token nama yg berarti (>=3 huruf), huruf saja, kapital.
function nameTokens(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z\s]/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
}
// SEMUA kata nama peserta harus muncul di paspor (toleran substring dua arah, mis.
// "fia" cocok dgn "SOFIA"). Sengaja KETAT: skenario utamanya tertukar antar anggota
// keluarga yg sering satu marga / sama-sama "Muhammad", jadi "asal ada 1 kata sama"
// terlalu longgar. Alarm palsu murah (CS scan paksa); kelolosan mahal (nomor paspor
// & tgl lahir orang lain menempel diam-diam ke peserta).
// Nama sistem kosong/placeholder ("Peserta #12") atau scan tak terbaca -> lewati.
export function passportNameMismatch(sysName, scannedFull) {
  const raw = String(sysName || '').trim();
  if (!raw || /^peserta/i.test(raw)) return false;
  const a = nameTokens(raw);
  const b = nameTokens(scannedFull);
  if (!a.length || !b.length) return false;
  const cocok = (t) => b.some((x) => x === t || x.includes(t) || t.includes(x));
  return !a.every(cocok);
}

async function runScan(db, pax, opts = {}) {
  if (!pax?.passport_upload_path) return { error: 'Belum ada paspor diupload' };
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(pax.passport_upload_path, 300);
  if (!signed?.signedUrl) return { error: 'Gagal membuat akses file' };
  const r = await extractPassportData(signed.signedUrl);
  if (r?.error) return { error: r.error };

  const d = r.data || {};
  const scannedFull = [d.given_names, d.surname].filter(Boolean).join(' ').trim();

  // VERIFIKASI NAMA: cegah paspor orang lain menimpa data peserta ini.
  // applyExtractToCustomer menimpa passport_number/dob/sex/place_of_birth tanpa syarat,
  // jadi salah slot = data identitas peserta tertukar diam-diam.
  if (!opts.force) {
    const { data: cust } = await db.from('customers').select('name').eq('id', pax.customer_id).maybeSingle();
    if (passportNameMismatch(cust?.name, scannedFull)) {
      await db.from('trip_passengers').update({
        passport_name_mismatch: true,
        passport_scan_name: scannedFull || null,
        passport_autofilled: false,
      }).eq('id', pax.id);
      return { ok: false, mismatch: true, scannedName: scannedFull, expectedName: cust?.name || '', data: d };
    }
  }

  await applyExtractToCustomer(db, pax.customer_id, d);
  await db.from('trip_passengers').update({
    passport_autofilled: true, passport_name_mismatch: false, passport_scan_name: scannedFull || null,
  }).eq('id', pax.id);
  return { ok: true, data: d };
}

// ====== PUBLIC: minta tiket upload langsung ke storage (lewati batas body Vercel) ======
export async function createPassportUploadTicket(token, passengerId, contentType) {
  try {
    if (!token || !/^pp_/.test(String(token))) return { error: 'Link tidak valid' };
    if (!ALLOWED.includes(contentType)) return { error: 'Format harus foto (JPG/PNG/WEBP) atau PDF' };
    const db = svc();
    if (!db) return { error: 'Service tidak tersedia' };
    const { data: tokenPax } = await db.from('trip_passengers')
      .select('id, trip_id, family_group_id').eq('passport_upload_token', token).maybeSingle();
    if (!tokenPax) return { error: 'Link tidak valid' };
    const allowed = await membersForTokenPax(db, tokenPax);
    if (!allowed.find((m) => String(m.id) === String(passengerId))) return { error: 'Peserta tidak sesuai link' };

    const ext = contentType === 'application/pdf' ? 'pdf' : (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `${tokenPax.trip_id}/${passengerId}-${Date.now()}.${ext}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return { error: 'Gagal menyiapkan upload: ' + error.message };
    return { ok: true, supabaseUrl: brandSupabaseUrl(), anonKey: brandSupabaseAnonKey(), bucket: BUCKET, path, token: data.token };
  } catch (e) {
    return { error: 'Gagal menyiapkan upload: ' + (e?.message || 'unknown') };
  }
}

// ====== PUBLIC: konfirmasi setelah file ter-upload langsung -> simpan path + auto-scan ======
export async function confirmPassportUpload(token, passengerId, path) {
  try {
    if (!token || !/^pp_/.test(String(token))) return { error: 'Link tidak valid' };
    const db = svc();
    if (!db) return { error: 'Service tidak tersedia' };
    const { data: tokenPax } = await db.from('trip_passengers')
      .select('id, trip_id, family_group_id').eq('passport_upload_token', token).maybeSingle();
    if (!tokenPax) return { error: 'Link tidak valid' };
    const allowed = await membersForTokenPax(db, tokenPax);
    if (!allowed.find((m) => String(m.id) === String(passengerId))) return { error: 'Peserta tidak sesuai link' };
    if (!path || !String(path).startsWith(`${tokenPax.trip_id}/${passengerId}-`)) return { error: 'Path file tidak valid' };

    await db.from('trip_passengers').update({
      passport_upload_path: path, passport_uploaded_at: new Date().toISOString(), passport_autofilled: false,
    }).eq('id', passengerId);

    let autofilled = false;
    let mismatch = null;
    try {
      const { data: pax2 } = await db.from('trip_passengers').select('id, customer_id, passport_upload_path').eq('id', passengerId).maybeSingle();
      const r = await runScan(db, pax2);
      autofilled = !!r?.ok;
      if (r?.mismatch) mismatch = { scannedName: r.scannedName, expectedName: r.expectedName };
    } catch {}
    try { revalidatePath(`/trips/${tokenPax.trip_id}/passport-manage`); } catch {}
    return { ok: true, autofilled, mismatch };
  } catch (e) {
    return { error: 'Gagal menyimpan: ' + (e?.message || 'unknown') };
  }
}

// ====== PUBLIC: dokumen tambahan (endorse / lainnya) — append ke passport_extra_paths ======
export async function confirmPassportExtra(token, passengerId, path, label) {
  try {
    if (!token || !/^pp_/.test(String(token))) return { error: 'Link tidak valid' };
    const db = svc();
    if (!db) return { error: 'Service tidak tersedia' };
    const { data: tokenPax } = await db.from('trip_passengers')
      .select('id, trip_id, family_group_id').eq('passport_upload_token', token).maybeSingle();
    if (!tokenPax) return { error: 'Link tidak valid' };
    const allowed = await membersForTokenPax(db, tokenPax);
    if (!allowed.find((m) => String(m.id) === String(passengerId))) return { error: 'Peserta tidak sesuai link' };
    if (!path || !String(path).startsWith(`${tokenPax.trip_id}/${passengerId}-`)) return { error: 'Path file tidak valid' };

    const { data: cur } = await db.from('trip_passengers').select('passport_extra_paths').eq('id', passengerId).maybeSingle();
    const arr = Array.isArray(cur?.passport_extra_paths) ? cur.passport_extra_paths : [];
    if (arr.length >= 5) return { error: 'Maksimal 5 dokumen tambahan' };
    arr.push({ path, label: String(label || 'Dokumen tambahan').slice(0, 40), at: new Date().toISOString() });
    await db.from('trip_passengers').update({ passport_extra_paths: arr }).eq('id', passengerId);
    try { revalidatePath(`/trips/${tokenPax.trip_id}/passport-manage`); } catch {}
    return { ok: true, count: arr.length };
  } catch (e) {
    return { error: 'Gagal menyimpan: ' + (e?.message || 'unknown') };
  }
}

// ====== PUBLIC: simpan file upload + auto-scan ======
export async function saveUploadedPassport(token, passengerId, formData) {
  try {
  if (!token || !/^pp_/.test(String(token))) return { error: 'Link tidak valid' };
  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };

  const { data: tokenPax } = await db.from('trip_passengers')
    .select('id, trip_id, family_group_id')
    .eq('passport_upload_token', token).maybeSingle();
  if (!tokenPax) return { error: 'Link tidak valid' };

  // validasi: passengerId milik token (dirinya / 1 family group)
  const allowed = await membersForTokenPax(db, tokenPax);
  const target = allowed.find((m) => String(m.id) === String(passengerId));
  if (!target) return { error: 'Peserta tidak sesuai link' };

  const file = formData.get('file');
  if (!file || typeof file === 'string') return { error: 'File tidak ada' };
  const type = file.type || '';
  if (!ALLOWED.includes(type)) return { error: 'Format harus foto (JPG/PNG/WEBP) atau PDF' };
  if (file.size > MAX_BYTES) return { error: 'Ukuran file maksimal 8MB' };

  const ext = type === 'application/pdf' ? 'pdf' : (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${tokenPax.trip_id}/${passengerId}-${Date.now()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const up = await db.storage.from(BUCKET).upload(path, buf, { contentType: type, upsert: true });
  if (up.error) return { error: 'Gagal upload: ' + up.error.message };

  await db.from('trip_passengers').update({
    passport_upload_path: path, passport_uploaded_at: new Date().toISOString(), passport_autofilled: false,
  }).eq('id', passengerId);

  // auto-scan (best-effort) — kalau gagal, file tetap tersimpan & bisa di-scan manual CS
  let autofilled = false;
  let mismatch = null;
  try {
    const { data: pax2 } = await db.from('trip_passengers').select('id, customer_id, passport_upload_path').eq('id', passengerId).maybeSingle();
    const r = await runScan(db, pax2);
    autofilled = !!r?.ok;
    if (r?.mismatch) mismatch = { scannedName: r.scannedName, expectedName: r.expectedName };
  } catch {}

  try { revalidatePath(`/trips/${tokenPax.trip_id}/passport-manage`); } catch {}
  return { ok: true, autofilled, mismatch };
  } catch (e) {
    return { error: 'Gagal memproses upload: ' + (e?.message || 'unknown') };
  }
}

// ====== STAFF: scan / scan ulang dari paspor yg sudah diupload ======
export async function scanUploadedPassport(passengerId, force = false) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/trips'); if (g.error) return { error: g.error }; }

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };
  const { data: pax } = await db.from('trip_passengers').select('id, trip_id, customer_id, passport_upload_path').eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };
  const r = await runScan(db, pax, { force });
  if (r?.error) return { error: r.error };
  try { revalidatePath(`/trips/${pax.trip_id}/passport-manage`); } catch {}
  if (r?.mismatch) {
    return { ok: false, mismatch: true, scannedName: r.scannedName, expectedName: r.expectedName,
      error: `Nama di paspor ("${r.scannedName}") tidak cocok dgn peserta ("${r.expectedName}"). Data TIDAK diisi otomatis. Cek apakah file-nya tertukar; kalau memang benar, scan ulang dgn paksa.` };
  }
  return { ok: true, data: r.data };
}

// ====== STAFF: signed URL utk preview paspor (singkat) ======
export async function getPassportSignedUrl(passengerId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  { const g = await assertStaff(user, '/trips'); if (g.error) return { error: g.error }; }
  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };
  const { data: pax } = await db.from('trip_passengers').select('passport_upload_path').eq('id', passengerId).maybeSingle();
  if (!pax?.passport_upload_path) return { error: 'Belum ada paspor' };
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(pax.passport_upload_path, 600);
  return { ok: true, url: signed?.signedUrl || null };
}
