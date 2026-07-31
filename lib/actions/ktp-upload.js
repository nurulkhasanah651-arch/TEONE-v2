'use server';

// KTP Upload + auto-scan AI — ADDITIVE, KHUSUS KHASANAH.
// Tidak mengubah alur passport apa pun. Memakai TOKEN & bucket privat yang sama
// dengan passport (path prefix 'ktp/'), token per kepala keluarga/solo.
// Path: lib/actions/ktp-upload.js

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, brandSupabaseAnonKey, currentBrandCode } from '@/lib/supabase/service-env';
import { extractKtpData } from '@/lib/actions/ktp';
import { assertStaff } from '@/lib/auth/require-staff';
import { revalidatePath } from 'next/cache';

const BUCKET = 'passport-uploads';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

function isKhasanah() { try { return currentBrandCode() === 'khasanah'; } catch { return false; } }
function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function membersForTokenPax(db, tokenPax) {
  if (tokenPax.family_group_id) {
    const { data: mem } = await db.from('trip_passengers')
      .select('id, customer_id, ktp_upload_path, ktp_uploaded_at, ktp_autofilled')
      .eq('trip_id', tokenPax.trip_id).eq('family_group_id', tokenPax.family_group_id);
    return mem || [tokenPax];
  }
  return [tokenPax];
}

// Rangkai alamat lengkap KTP dari hasil scan.
function fullAlamat(d) {
  const parts = [];
  if (d.alamat) parts.push(d.alamat);
  if (d.rt_rw) parts.push('RT/RW ' + d.rt_rw);
  if (d.kel_desa) parts.push('Kel/Desa ' + d.kel_desa);
  if (d.kecamatan) parts.push('Kec. ' + d.kecamatan);
  if (d.kota_kabupaten) parts.push(d.kota_kabupaten);
  if (d.provinsi) parts.push(d.provinsi);
  return parts.join(', ') || null;
}

// Terapkan hasil scan KTP ke customer. NIK & alamat KTP selalu ditulis (data KTP),
// data identitas lain (nama/dob/tempat lahir/gender) hanya diisi bila masih kosong.
async function applyKtpToCustomer(db, customerId, d) {
  if (!customerId || !d) return;
  const { data: c } = await db.from('customers')
    .select('name, first_name, birthday, dob, city, place_of_birth, gender')
    .eq('id', customerId).maybeSingle();
  const upd = { ktp_scan: d };
  if (d.nik) upd.nik = String(d.nik).replace(/\D/g, '');
  const alamat = fullAlamat(d);
  if (alamat) upd.ktp_alamat = alamat;
  if (d.tgl_lahir && c && !c.birthday) { upd.birthday = d.tgl_lahir; upd.dob = d.tgl_lahir; }
  if (d.tempat_lahir && c && !c.place_of_birth) { upd.place_of_birth = d.tempat_lahir; if (!c.city) upd.city = d.tempat_lahir; }
  if (d.jenis_kelamin && c && !c.gender) {
    const g = /LAKI/i.test(d.jenis_kelamin) ? 'L' : /PEREM/i.test(d.jenis_kelamin) ? 'P' : null;
    if (g) upd.gender = g;
  }
  if (c && (!c.name || /^Peserta/i.test(c.name)) && d.nama) upd.name = d.nama;
  const { error } = await db.from('customers').update(upd).eq('id', customerId);
  if (error) console.error('[applyKtpToCustomer] gagal simpan', { customerId, error: error.message });
}

async function runKtpScan(db, pax) {
  if (!pax?.ktp_upload_path) return { error: 'Belum ada KTP diupload' };
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(pax.ktp_upload_path, 300);
  if (!signed?.signedUrl) return { error: 'Gagal membuat akses file' };
  const r = await extractKtpData(signed.signedUrl);
  if (r?.error) return { error: r.error };
  await applyKtpToCustomer(db, pax.customer_id, r.data || {});
  await db.from('trip_passengers').update({ ktp_autofilled: true }).eq('id', pax.id);
  return { ok: true, data: r.data };
}

// ====== PUBLIC: status KTP per anggota (utk render di halaman upload) ======
export async function getKtpStatus(token) {
  if (!isKhasanah()) return { ok: true, enabled: false, members: [] };
  if (!token || !/^pp_/.test(String(token))) return { error: 'Link tidak valid' };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const { data: tokenPax } = await db.from('trip_passengers')
    .select('id, trip_id, family_group_id').eq('passport_upload_token', token).maybeSingle();
  if (!tokenPax) return { error: 'Link tidak valid' };
  const members = await membersForTokenPax(db, tokenPax);
  return { ok: true, enabled: true, members: members.map((m) => ({ id: m.id, ktpUploaded: !!m.ktp_upload_path })) };
}

// ====== PUBLIC: tiket upload KTP langsung ke storage ======
export async function createKtpUploadTicket(token, passengerId, contentType) {
  try {
    if (!isKhasanah()) return { error: 'Fitur KTP hanya untuk Khasanah' };
    if (!token || !/^pp_/.test(String(token))) return { error: 'Link tidak valid' };
    if (!ALLOWED.includes(contentType)) return { error: 'Format harus foto (JPG/PNG/WEBP) atau PDF' };
    const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
    const { data: tokenPax } = await db.from('trip_passengers')
      .select('id, trip_id, family_group_id').eq('passport_upload_token', token).maybeSingle();
    if (!tokenPax) return { error: 'Link tidak valid' };
    const allowed = await membersForTokenPax(db, tokenPax);
    if (!allowed.find((m) => String(m.id) === String(passengerId))) return { error: 'Peserta tidak sesuai link' };

    const ext = contentType === 'application/pdf' ? 'pdf' : (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const path = `ktp/${tokenPax.trip_id}/${passengerId}-${Date.now()}.${ext}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error) return { error: 'Gagal menyiapkan upload: ' + error.message };
    return { ok: true, supabaseUrl: brandSupabaseUrl(), anonKey: brandSupabaseAnonKey(), bucket: BUCKET, path, token: data.token };
  } catch (e) {
    return { error: 'Gagal menyiapkan upload: ' + (e?.message || 'unknown') };
  }
}

// ====== PUBLIC: konfirmasi KTP ter-upload -> simpan path + auto-scan ======
export async function confirmKtpUpload(token, passengerId, path) {
  try {
    if (!isKhasanah()) return { error: 'Fitur KTP hanya untuk Khasanah' };
    if (!token || !/^pp_/.test(String(token))) return { error: 'Link tidak valid' };
    const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
    const { data: tokenPax } = await db.from('trip_passengers')
      .select('id, trip_id, family_group_id').eq('passport_upload_token', token).maybeSingle();
    if (!tokenPax) return { error: 'Link tidak valid' };
    const allowed = await membersForTokenPax(db, tokenPax);
    if (!allowed.find((m) => String(m.id) === String(passengerId))) return { error: 'Peserta tidak sesuai link' };
    if (!path || !String(path).startsWith(`ktp/${tokenPax.trip_id}/${passengerId}-`)) return { error: 'Path file tidak valid' };

    await db.from('trip_passengers').update({
      ktp_upload_path: path, ktp_uploaded_at: new Date().toISOString(), ktp_autofilled: false,
    }).eq('id', passengerId);

    let autofilled = false;
    try {
      const { data: pax2 } = await db.from('trip_passengers').select('id, customer_id, ktp_upload_path').eq('id', passengerId).maybeSingle();
      const r = await runKtpScan(db, pax2);
      autofilled = !!r?.ok;
    } catch {}
    try { revalidatePath(`/trips/${tokenPax.trip_id}/passport-manage`); } catch {}
    return { ok: true, autofilled };
  } catch (e) {
    return { error: 'Gagal menyimpan: ' + (e?.message || 'unknown') };
  }
}

// ====== STAFF: re-scan KTP manual ======
export async function scanUploadedKtp(passengerId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/trips'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const { data: pax } = await db.from('trip_passengers').select('id, customer_id, trip_id, ktp_upload_path').eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };
  const r = await runKtpScan(db, pax);
  try { revalidatePath(`/trips/${pax.trip_id}/passport-edit/${passengerId}`); } catch {}
  return r;
}

// ====== STAFF: signed URL utk preview KTP ======
export async function getKtpSignedUrl(passengerId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/trips'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const { data: pax } = await db.from('trip_passengers').select('ktp_upload_path').eq('id', passengerId).maybeSingle();
  if (!pax?.ktp_upload_path) return { error: 'Belum ada KTP' };
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(pax.ktp_upload_path, 3600);
  return signed?.signedUrl ? { ok: true, url: signed.signedUrl } : { error: 'Gagal membuat akses file' };
}

// ====== STAFF: upload + scan KTP dari halaman internal (Passport AI edit) ======
// file: dataURL/URL yang sudah ke storage lewat FileUploadInput. Simpan sebagai path & scan.
export async function saveKtpFromUrl(passengerId, publicUrl) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/trips'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  if (!publicUrl) return { error: 'File belum ada' };
  const { data: pax } = await db.from('trip_passengers').select('id, customer_id, trip_id').eq('id', passengerId).maybeSingle();
  if (!pax) return { error: 'Peserta tidak ditemukan' };

  const r = await extractKtpData(publicUrl);
  if (r?.error) return { error: r.error };
  await applyKtpToCustomer(db, pax.customer_id, r.data || {});
  await db.from('trip_passengers').update({ ktp_autofilled: true }).eq('id', passengerId);
  await db.from('customers').update({ ktp_photo_url: publicUrl }).eq('id', pax.customer_id);
  try { revalidatePath(`/trips/${pax.trip_id}/passport-edit/${passengerId}`); } catch {}
  return { ok: true, data: r.data };
}

// ====== STAFF: simpan field KTP manual (edit) ======
export async function saveKtpFields(passengerId, fields) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/trips'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const { data: pax } = await db.from('trip_passengers').select('customer_id, trip_id').eq('id', passengerId).maybeSingle();
  if (!pax?.customer_id) return { error: 'Peserta tidak ditemukan' };
  const upd = {};
  if (fields.nik != null) upd.nik = String(fields.nik).replace(/\D/g, '') || null;
  if (fields.ktp_alamat != null) upd.ktp_alamat = String(fields.ktp_alamat).trim() || null;
  const { error } = await db.from('customers').update(upd).eq('id', pax.customer_id);
  if (error) return { error: error.message };
  try { revalidatePath(`/trips/${pax.trip_id}/passport-edit/${passengerId}`); } catch {}
  return { ok: true };
}
