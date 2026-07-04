'use server';

// Jeda acak (detik) antar pesan blast: 70-140 dtk (>1 menit) -> Fonnte sebar pengiriman, cegah limit/ban WA.
const BLAST_DELAY = '70-140';
// Blast WA ke semua peserta aktif satu trip. Nomor pengirim: CS. Personalisasi {{nama}}.
import { createClient } from '@/lib/supabase/server';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getBrandCode } from '@/lib/brand';
import { sendFonnte } from '@/lib/utils/fonnte';
import { assertStaff } from '@/lib/auth/require-staff';
import { logFailedWA } from '@/lib/wa-outbox-log';
import { getPicFonnteTokenForTrip } from '@/lib/auth/pic-scope';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

function svc() {
  const u = brandSupabaseUrl(); const k = brandServiceRoleKey();
  return (u && k) ? createSvcClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

const norm = (p) => {
  let s = String(p || '').replace(/[^0-9]/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s.startsWith('620')) s = '62' + s.slice(3);
  return s;
};
function paxActive(p) {
  return p.status !== 'cancelled' && p.transfer_status !== 'transferred'
    && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund';
}

// Daftar trip (yang punya peserta aktif) untuk pemilih blast
export async function listBlastTrips() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };

  const [{ data: trips }, pax] = await Promise.all([
    supabase.from('trips').select('id, name, kode_trip, departure, status').order('departure', { ascending: false, nullsFirst: false }),
    fetchAll(() => supabase.from('trip_passengers').select('trip_id, status, transfer_status, refund_status')),
  ]);
  const cnt = {};
  for (const p of (pax || [])) if (paxActive(p)) cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1;
  const list = (trips || [])
    .map((t) => ({ id: t.id, kode: t.kode_trip || t.name, name: t.name, departure: t.departure, status: t.status, pax: cnt[t.id] || 0 }))
    .filter((t) => t.pax > 0);
  return { ok: true, trips: list };
}

// Penerima dikelompokkan per KELUARGA (per nomor kontak = unit kirim).
export async function getBlastRecipients(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih.' };

  const { data: pax } = await supabase.from('trip_passengers')
    .select('id, customer_id, status, transfer_status, refund_status, is_family_head').eq('trip_id', tripId);
  const active = (pax || []).filter(paxActive).filter((p) => p.customer_id);
  const ids = [...new Set(active.map((p) => p.customer_id))];
  const custMap = {};
  if (ids.length) {
    const { data: cs } = await supabase.from('customers').select('id, name, phone').in('id', ids);
    for (const c of (cs || [])) custMap[c.id] = c;
  }
  const recipients = active.map((p) => {
    const c = custMap[p.customer_id] || {};
    const ph = norm(c.phone);
    const valid = !!(ph && ph.length >= 9);
    return { id: p.id, name: c.name || '(tanpa nama)', phone: valid ? ph : '', hasPhone: valid, isHead: !!p.is_family_head };
  });
  // grup per nomor (keluarga). Tanpa nomor -> grup sendiri (disabled).
  const byKey = {};
  for (const r of recipients) {
    const key = r.hasPhone ? ('ph:' + r.phone) : ('np:' + r.id);
    (byKey[key] = byKey[key] || { key, phone: r.phone, hasPhone: r.hasPhone, members: [] }).members.push(r);
  }
  const families = Object.values(byKey).map((grp) => {
    const head = grp.members.find((m) => m.isHead) || grp.members[0];
    return {
      key: grp.key, phone: grp.phone, hasPhone: grp.hasPhone, headName: head.name,
      memberIds: grp.members.map((m) => m.id),
      members: grp.members.map((m) => ({ id: m.id, name: m.name })),
      count: grp.members.length,
    };
  });
  families.sort((a, b) => (b.count - a.count) || String(a.headName).localeCompare(String(b.headName)));
  const noPhone = recipients.filter((r) => !r.hasPhone).length;
  return { ok: true, recipients, families, noPhone, total: recipients.length };
}

// Kirim blast ke peserta terpilih (selectedIds = id peserta). 1 pesan per nomor (keluarga),
// sapaan {{nama}} pakai nama kepala keluarga. Kalau selectedIds kosong -> semua yg punya nomor.
export async function sendBlast(tripId, message, selectedIds) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };
  const msg = String(message || '').trim();
  if (!msg) return { error: 'Pesan kosong.' };

  const r = await getBlastRecipients(tripId);
  if (r.error) return r;

  const sel = Array.isArray(selectedIds) && selectedIds.length ? new Set(selectedIds.map(String)) : null;
  let pool = r.recipients.filter((x) => x.hasPhone);
  if (sel) pool = pool.filter((x) => sel.has(String(x.id)));
  if (!pool.length) return { error: 'Tidak ada penerima terpilih dengan nomor valid.' };

  // kumpulkan per nomor -> 1 pesan; nama = kepala keluarga
  const byPhone = {};
  for (const rc of pool) (byPhone[rc.phone] = byPhone[rc.phone] || []).push(rc);

  const brand = getBrandCode();
  let sent = 0, failed = 0;
  for (const phone of Object.keys(byPhone)) {
    const arr = byPhone[phone];
    const head = arr.find((x) => x.isHead) || arr[0];
    const first = (String(head.name).trim().split(/\s+/)[0]) || 'Kak';
    const personalized = msg.replace(/\{\{\s*nama\s*\}\}/gi, first);
    const res = await sendFonnte(phone, personalized, { context: 'cs', brand, delay: BLAST_DELAY, typing: true });
    if (res?.ok) sent++;
    else {
      failed++;
      try { await logFailedWA({ context: 'cs', phone, message: personalized, kind: 'blast', reason: res?.error || 'gagal' }); } catch {}
    }
  }
  return { ok: true, sent, failed, contacts: Object.keys(byPhone).length };
}


// ===== BLAST PERKENALAN PIC (semua peserta di trip yang di-assign ke PIC) =====

// Init: apakah user PIC (kirim utk dirinya) atau owner/manager (pilih PIC)
export async function getPicBlastInit() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast'); if (g.error) return { error: g.error };
  const db = svc() || supabase;
  const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  const role = u?.role;
  if (role === 'pic') {
    const email = (user.email || '').toLowerCase();
    const { data: emp } = await db.from('employees').select('full_name, nickname').ilike('email', email).maybeSingle();
    return { ok: true, mode: 'self', picEmail: email, picName: (emp?.nickname || '').trim() || emp?.full_name || 'PIC' };
  }
  const { data: pics } = await db.from('employees').select('email, full_name, nickname, status').eq('role', 'pic');
  const list = (pics || []).filter((p) => p.email && p.status !== 'inactive')
    .map((p) => ({ email: String(p.email).toLowerCase(), name: (p.nickname || '').trim() || p.full_name || p.email }));
  return { ok: true, mode: 'choose', pics: list };
}

async function resolvePicEmail(supabase, user, picEmailArg) {
  const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (u?.role === 'pic') return (user.email || '').toLowerCase();       // PIC hanya boleh dirinya
  return String(picEmailArg || '').toLowerCase();
}

// Penerima: peserta aktif di trip milik PIC (bisa dibatasi tripIds). Return juga daftar trip utk pemilih.
export async function getPicBlastRecipients(picEmailArg, tripIdsArg) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast'); if (g.error) return { error: g.error };
  const db = svc() || supabase;
  const email = await resolvePicEmail(supabase, user, picEmailArg);
  if (!email) return { error: 'PIC belum dipilih.' };

  const { data: emp } = await db.from('employees').select('full_name, nickname').ilike('email', email).maybeSingle();
  const picName = (emp?.nickname || '').trim() || emp?.full_name || email;

  const { data: trips } = await db.from('trips').select('id, kode_trip, name').ilike('pic_email', email);
  const allTripIds = (trips || []).map((t) => t.id);
  if (!allTripIds.length) return { ok: true, picEmail: email, picName, trips: [], tripCount: 0, families: [], totalPax: 0, noPhone: 0 };

  const sel = (Array.isArray(tripIdsArg) && tripIdsArg.length) ? new Set(tripIdsArg.map(String)) : null;
  const { data: pax } = await db.from('trip_passengers')
    .select('id, customer_id, status, transfer_status, refund_status, is_family_head, trip_id').in('trip_id', allTripIds);
  const active = (pax || []).filter(paxActive).filter((p) => p.customer_id);

  const perTrip = {};
  for (const p of active) perTrip[p.trip_id] = (perTrip[p.trip_id] || 0) + 1;
  const tripList = (trips || []).map((t) => ({ id: t.id, kode: t.kode_trip || t.name, pax: perTrip[t.id] || 0 }));

  const filtered = sel ? active.filter((p) => sel.has(String(p.trip_id))) : active;
  const ids = [...new Set(filtered.map((p) => p.customer_id))];
  const custMap = {};
  if (ids.length) { const { data: cs } = await db.from('customers').select('id, name, phone').in('id', ids); for (const c of (cs || [])) custMap[c.id] = c; }

  const byPhone = {}; let noPhone = 0;
  for (const p of filtered) {
    const c = custMap[p.customer_id] || {};
    const ph = norm(c.phone);
    if (!ph || ph.length < 9) { noPhone++; continue; }
    (byPhone[ph] = byPhone[ph] || { phone: ph, members: [] }).members.push({ id: p.id, name: c.name || '', isHead: !!p.is_family_head });
  }
  const families = Object.values(byPhone).map((grp) => {
    const head = grp.members.find((m) => m.isHead) || grp.members[0];
    return { key: 'ph:' + grp.phone, phone: grp.phone, headName: head.name, memberIds: grp.members.map((m) => m.id), members: grp.members.map((m) => ({ id: m.id, name: m.name })), count: grp.members.length };
  });
  families.sort((a, b) => (b.count - a.count) || String(a.headName).localeCompare(String(b.headName)));
  const tripCount = sel ? allTripIds.filter((id) => sel.has(String(id))).length : allTripIds.length;
  return { ok: true, picEmail: email, picName, trips: tripList, tripCount, families, totalPax: filtered.length, noPhone };
}

// Kirim blast perkenalan dari nomor PIC. {{nama}}->nama depan kepala keluarga, {{pic}}->nama PIC
export async function sendPicBlast(picEmailArg, message, tripIdsArg) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast'); if (g.error) return { error: g.error };
  const msg = String(message || '').trim(); if (!msg) return { error: 'Pesan kosong.' };

  const r = await getPicBlastRecipients(picEmailArg, tripIdsArg);
  if (r.error) return r;
  if (!r.families.length) return { error: 'Tidak ada penerima (belum ada trip/peserta dengan nomor valid).' };

  const picTok = await getPicFonnteTokenForTrip({ pic_email: r.picEmail }); // null -> fallback CS
  const brand = getBrandCode();
  let sent = 0, failed = 0;
  for (const fam of r.families) {
    const first = (String(fam.headName).trim().split(/\s+/)[0]) || 'Kak';
    const personalized = msg
      .replace(/\{\{\s*nama\s*\}\}/gi, first)
      .replace(/\{\{\s*pic\s*\}\}/gi, r.picName);
    const res = await sendFonnte(fam.phone, personalized, { context: 'cs', brand, token: picTok, delay: BLAST_DELAY, typing: true });
    if (res?.ok) sent++;
    else { failed++; try { await logFailedWA({ context: 'cs', phone: fam.phone, message: personalized, kind: 'blast-pic', reason: res?.error || 'gagal' }); } catch {} }
  }
  return { ok: true, sent, failed, contacts: r.families.length, totalPax: r.totalPax, usedPicNumber: !!picTok };
}
