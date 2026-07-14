'use server';

// Broadcast WABA + Template Manager (Khasanah) — FITUR BARU. Kirim template Meta ke
// segmen peserta (per trip). Tiap kiriman tercatat di inbox.
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { metaConfig, sendMetaTemplate, fetchMetaTemplates, normalizeWaPhone } from '@/lib/utils/waba-meta';
import { logOutbound } from '@/lib/utils/waba-send';

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
