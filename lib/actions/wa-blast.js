'use server';

// Broadcast WABA + Template Manager (Khasanah) — FITUR BARU. Kirim template Meta ke
// segmen peserta (per trip). Tiap kiriman tercatat di inbox.
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { metaConfig, sendMetaTemplate, fetchMetaTemplates, normalizeWaPhone } from '@/lib/utils/waba-meta';
import { logOutbound, trySendWabaTemplateForTrip } from '@/lib/utils/waba-send';
import { apicoidConfig } from '@/lib/utils/waba-apicoid';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}
function isKh() { try { const b = currentBrandCode(); return b === 'khasanah' || b === 'teone'; } catch { return false; } }

// Nomor pengirim yang boleh dipakai user (PIC -> miliknya; owner/manager -> semua).
async function senderNumbers(db, user) {
  const role = await resolveAuthoritativeRole(user);
  let empId = null;
  try { const { data: e } = await db.from('employees').select('id').ilike('email', (user.email || '').toLowerCase()).maybeSingle(); empId = e?.id || null; } catch {}
  const { data: nums } = await db.from('wa_numbers').select('id, phone_number_id, display_phone, pic_name, pic_employee_id').eq('active', true);
  const all = nums || [];
  return role === 'pic' ? all.filter((n) => n.pic_employee_id === empId) : all;
}

export async function getBroadcastData() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/wa-broadcast'); if (g.error) return { error: g.error };
  if (!isKh()) return { ok: true, notKhasanah: true };
  const db = svc() || auth;
  const numbers = await senderNumbers(db, user);
  const { data: trips } = await db.from('trips').select('id, kode_trip, name').order('kode_trip');
  const cfg = metaConfig();
  let templates = []; let tplError = null;
  if (cfg) {
    const r = await fetchMetaTemplates(cfg);
    if (r.ok) templates = (r.templates || []).filter((t) => t.status === 'APPROVED');
    else tplError = r.error;
  } else tplError = 'Meta WABA belum dikonfigurasi';
  return { ok: true, numbers, trips: trips || [], templates, tplError };
}

// Hitung penerima (peserta aktif trip yang punya nomor).
export async function previewBroadcastAudience(tripId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  const { data: pax } = await db.from('trip_passengers').select('customer_id, status, transfer_status, refund_status').eq('trip_id', tripId);
  const active = (pax || []).filter((p) => p.status !== 'cancelled' && p.transfer_status !== 'transferred' && p.refund_status !== 'refunded');
  const ids = [...new Set(active.map((p) => p.customer_id).filter(Boolean))];
  if (!ids.length) return { ok: true, count: 0, recipients: [] };
  const { data: custs } = await db.from('customers').select('id, name, phone, whatsapp').in('id', ids);
  const recipients = (custs || []).map((c) => ({ name: c.name || '', phone: normalizeWaPhone(c.whatsapp || c.phone) })).filter((r) => r.phone);
  return { ok: true, count: recipients.length, recipients: recipients.slice(0, 5).map((r) => r.name) };
}

// Broadcast lewat NOMOR PIC trip (Api.co.id / Meta fallback) — pakai nama template
// per-PIC dari HR (waba_tpl_perubahan_jadwal / waba_tpl_finalisasi_tiket).
// kind: 'waba_perubahan_jadwal' | 'waba_finalisasi_tiket'. 1 pesan per nomor (keluarga).
const PIC_BROADCAST_DEFAULT_TPL = {
  waba_perubahan_jadwal: 'info_perubahan_jadwal',
  waba_finalisasi_tiket: 'info_finalisasi_tiket',
};
export async function sendPicWabaBroadcast({ tripId, kind, extraParams = [] }) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/wa-broadcast'); if (g.error) return { error: g.error };
  if (!tripId || !kind) return { error: 'Trip & jenis broadcast wajib' };
  const defaultTpl = PIC_BROADCAST_DEFAULT_TPL[kind];
  if (!defaultTpl) return { error: 'Jenis broadcast tidak dikenal' };
  if (!apicoidConfig() && !metaConfig()) return { error: 'WABA (Api.co.id/Meta) belum dikonfigurasi.' };
  const db = svc() || auth;

  // Peserta aktif -> 1 pesan per NOMOR (keluarga), sapaan = nama depan kepala keluarga.
  const { data: pax } = await db.from('trip_passengers')
    .select('customer_id, status, transfer_status, refund_status, is_family_head').eq('trip_id', tripId);
  const active = (pax || []).filter((p) => p.status !== 'cancelled' && p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.customer_id);
  const ids = [...new Set(active.map((p) => p.customer_id))];
  if (!ids.length) return { error: 'Tidak ada peserta aktif di trip ini' };
  const { data: custs } = await db.from('customers').select('id, name, phone, whatsapp').in('id', ids);
  const cmap = Object.fromEntries((custs || []).map((c) => [c.id, c]));

  const byPhone = {};
  for (const p of active) {
    const c = cmap[p.customer_id] || {};
    const phone = normalizeWaPhone(c.whatsapp || c.phone);
    if (!phone) continue;
    (byPhone[phone] = byPhone[phone] || []).push({ name: c.name || '', isHead: !!p.is_family_head });
  }
  const phones = Object.keys(byPhone);
  if (!phones.length) return { error: 'Tidak ada peserta dengan nomor HP di trip ini' };

  const _cleanExtra = (Array.isArray(extraParams) ? extraParams : []).map((x) => String(x ?? '').trim());
  let sent = 0, failed = 0, noPic = 0; const errors = [];
  for (const phone of phones) {
    const arr = byPhone[phone];
    const head = arr.find((x) => x.isHead) || arr[0];
    const first = (String(head.name).trim().split(/\s+/)[0]) || 'Kak';
    const params = [first, ..._cleanExtra];
    const res = await trySendWabaTemplateForTrip(db, tripId, phone, defaultTpl, params, { kind });
    if (res === null) { noPic++; continue; } // PIC belum punya nomor WABA / config
    if (res.ok) sent++;
    else { failed++; if (errors.length < 5) errors.push(`${phone}: ${res.error}`); }
  }
  if (sent === 0 && noPic === phones.length) {
    return { error: 'PIC trip ini belum punya nomor WABA (Api.co.id) aktif — set di HR (Meta Phone Number ID) dulu.' };
  }
  return { ok: true, sent, failed, noPic, total: phones.length, errors };
}

// Kirim broadcast: template ke semua peserta aktif trip. {{1}} auto = nama; sisanya static.
export async function sendBroadcast({ numberId, tripId, templateName, extraParams = [] }) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/wa-broadcast'); if (g.error) return { error: g.error };
  if (!isKh()) return { error: 'Broadcast WABA khusus Khasanah' };
  const cfg = metaConfig(); if (!cfg) return { error: 'Meta WABA belum dikonfigurasi' };
  if (!numberId || !tripId || !templateName) return { error: 'Nomor pengirim, trip, dan template wajib' };
  const db = svc() || auth;

  const numbers = await senderNumbers(db, user);
  const num = numbers.find((n) => n.id === Number(numberId));
  if (!num) return { error: 'Nomor pengirim tidak valid / bukan milikmu' };

  const { data: pax } = await db.from('trip_passengers').select('customer_id, status, transfer_status, refund_status').eq('trip_id', tripId);
  const active = (pax || []).filter((p) => p.status !== 'cancelled' && p.transfer_status !== 'transferred' && p.refund_status !== 'refunded');
  const ids = [...new Set(active.map((p) => p.customer_id).filter(Boolean))];
  const { data: custs } = ids.length ? await db.from('customers').select('id, name, phone, whatsapp').in('id', ids) : { data: [] };
  const recipients = (custs || []).map((c) => ({ name: c.name || 'Bapak/Ibu', phone: normalizeWaPhone(c.whatsapp || c.phone) })).filter((r) => r.phone);
  if (!recipients.length) return { error: 'Tidak ada peserta dengan nomor HP di trip ini' };

  let sent = 0, failed = 0; const errors = [];
  for (const r of recipients) {
    const params = [r.name, ...extraParams];
    const res = await sendMetaTemplate(cfg, num.phone_number_id, r.phone, templateName, cfg.lang, params);
    if (res.ok) {
      sent++;
      await logOutbound(db, { phoneNumberId: num.phone_number_id, numberRowId: num.id, toPhone: r.phone, templateName, wamid: res.wamid });
    } else {
      failed++;
      if (errors.length < 5) errors.push(`${r.phone}: ${res.error}`);
    }
  }
  return { ok: true, sent, failed, total: recipients.length, errors };
}
