'use server';

// Tour Confirmation (TC) per trip — FITUR OPERASIONAL.
// Data trip (nama, kode, tanggal, itinerary) diambil dari master trip; itinerary +
// hotel + detail flight + meeting point bisa diubah manual. TC bisa didownload PDF
// (halaman print publik /tc/[token]) atau dikirim ke peserta dari nomor PIC.

import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { getBrandCode } from '@/lib/brand';
import { customerSiteUrlFor } from '@/lib/brand-shared';
import { assertStaff } from '@/lib/auth/require-staff';
import { getPicFonnteTokenForTrip } from '@/lib/auth/pic-scope';
import { sendFonnte } from '@/lib/utils/fonnte';
import { getTripCrew } from '@/lib/actions/crew';
import { logFailedWA } from '@/lib/wa-outbox-log';
import { randomUUID } from 'crypto';

const BLAST_DELAY = '70-140';

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
function pad2(n) { return String(n).padStart(2, '0'); }
function _d(dateStr) { if (!dateStr) return null; try { const dt = new Date(String(dateStr).slice(0, 10) + 'T00:00:00'); return isNaN(dt) ? null : dt; } catch { return null; } }
function fmtLong(dateStr) { const dt = _d(dateStr); if (!dt) return ''; return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
function fmtShort(dateStr) { const dt = _d(dateStr); if (!dt) return ''; return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
function addDays(dateStr, n) { const dt = _d(dateStr); if (!dt) return ''; dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10); }
function periodeText(dep, ret) {
  const a = fmtShort(dep); const b = fmtShort(ret);
  if (a && b) return `${a} - ${b}`;
  return a || b || '';
}
function genToken() {
  try { return 'tc_' + randomUUID().replace(/-/g, '').slice(0, 20); }
  catch { return 'tc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
}

// Bentuk TC default dari master trip (kalau belum pernah disimpan).
function buildDefault(trip, crew) {
  const title = (trip.public_title || trip.name || '').trim();
  const kode = (trip.kode_trip || '').trim();
  const groupName = [kode, title].filter(Boolean).join(' ').trim() || title || kode;
  const tl = (Array.isArray(crew) ? crew : [])
    .filter((c) => /tour ?leader|^tl$/i.test(String(c.role || '')))
    .map((c) => (c.name || '').trim()).filter(Boolean).join(', ');
  const rawItin = Array.isArray(trip.itinerary) ? trip.itinerary : [];
  const itinerary = rawItin.map((d, i) => ({
    day: `Day ${pad2(d.day || i + 1)}`,
    route: String(d.title || '').trim(),
    date: fmtLong(addDays(trip.departure, (Number(d.day) || i + 1) - 1)),
    schedule: String(d.detail || '').trim(),
    hotel: '',
  }));
  return {
    group_name: groupName,
    periode: periodeText(trip.departure, trip.return_date),
    tour_leader: tl || 'TBA',
    waktu_kumpul: '',
    meeting_point: '',
    meeting_note: 'Titik Kumpul akan diinfokan kembali oleh TL',
    detail_flight: '',
    itinerary,
    hotels: [],
  };
}

// Ambil trip (untuk info display) + TC (existing / default).
export async function getTourConfirmation(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/operasional'); if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih.' };
  const db = svc() || supabase;

  const { data: trip } = await db.from('trips')
    .select('id, kode_trip, name, public_title, departure, return_date, pic, pic_email, itinerary')
    .eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan.' };

  let crew = [];
  try { const r = await getTripCrew(tripId); crew = r?.crew || []; } catch {}

  const { data: existing } = await db.from('tour_confirmations').select('*').eq('trip_id', tripId).maybeSingle();
  const def = buildDefault(trip, crew);

  const tc = existing ? {
    group_name: existing.group_name ?? def.group_name,
    periode: existing.periode ?? def.periode,
    tour_leader: existing.tour_leader ?? def.tour_leader,
    waktu_kumpul: existing.waktu_kumpul ?? def.waktu_kumpul,
    meeting_point: existing.meeting_point ?? def.meeting_point,
    meeting_note: existing.meeting_note ?? def.meeting_note,
    detail_flight: existing.detail_flight ?? def.detail_flight,
    itinerary: Array.isArray(existing.itinerary) && existing.itinerary.length ? existing.itinerary : def.itinerary,
    hotels: Array.isArray(existing.hotels) ? existing.hotels : def.hotels,
    public_token: existing.public_token || '',
    saved: true,
  } : { ...def, public_token: '', saved: false };

  return {
    ok: true,
    tc,
    trip: {
      id: trip.id, kode_trip: trip.kode_trip, name: trip.name, public_title: trip.public_title,
      departure: trip.departure, return_date: trip.return_date, pic: trip.pic,
    },
  };
}

// Simpan TC (upsert). Selalu pastikan ada public_token.
export async function saveTourConfirmation(tripId, data = {}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/operasional'); if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih.' };
  const db = svc() || supabase;

  const { data: existing } = await db.from('tour_confirmations').select('id, public_token').eq('trip_id', tripId).maybeSingle();
  const token = existing?.public_token || genToken();

  const _str = (v) => (v == null ? '' : String(v));
  const itinerary = Array.isArray(data.itinerary) ? data.itinerary.map((d) => ({
    day: _str(d.day), route: _str(d.route), date: _str(d.date), schedule: _str(d.schedule), hotel: _str(d.hotel),
  })) : [];
  const hotels = Array.isArray(data.hotels) ? data.hotels.map((h) => ({ name: _str(h.name), address: _str(h.address) })).filter((h) => h.name || h.address) : [];

  const payload = {
    trip_id: tripId,
    public_token: token,
    group_name: _str(data.group_name),
    periode: _str(data.periode),
    tour_leader: _str(data.tour_leader),
    waktu_kumpul: _str(data.waktu_kumpul),
    meeting_point: _str(data.meeting_point),
    meeting_note: _str(data.meeting_note),
    detail_flight: _str(data.detail_flight),
    itinerary,
    hotels,
    updated_at: new Date().toISOString(),
  };

  const { error } = await db.from('tour_confirmations').upsert(payload, { onConflict: 'trip_id' });
  if (error) return { error: 'Gagal simpan: ' + error.message };
  return { ok: true, public_token: token };
}

// Daftar trip untuk halaman list TC (semua trip; tandai yang sudah punya TC + jumlah pax).
export async function listTourConfirmationTrips() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/operasional'); if (g.error) return { error: g.error };
  const db = svc() || supabase;

  const [{ data: trips }, { data: pax }, { data: tcs }] = await Promise.all([
    db.from('trips').select('id, kode_trip, name, public_title, departure, return_date, status, pic').order('departure', { ascending: false, nullsFirst: false }),
    db.from('trip_passengers').select('trip_id, status, transfer_status, refund_status'),
    db.from('tour_confirmations').select('trip_id, public_token, updated_at'),
  ]);
  const cnt = {};
  for (const p of (pax || [])) if (paxActive(p)) cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1;
  const tcMap = {};
  for (const t of (tcs || [])) tcMap[t.trip_id] = t;
  const list = (trips || []).map((t) => ({
    id: t.id, kode: t.kode_trip || '', name: t.public_title || t.name || '', departure: t.departure,
    return_date: t.return_date, status: t.status, pic: t.pic || '', pax: cnt[t.id] || 0,
    hasTc: !!tcMap[t.id], tcUpdated: tcMap[t.id]?.updated_at || null,
  }));
  return { ok: true, trips: list };
}

// URL publik TC (buat print PDF & dikirim ke peserta).
export async function tcPublicUrl(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/operasional'); if (g.error) return { error: g.error };
  const db = svc() || supabase;
  let { data: row } = await db.from('tour_confirmations').select('public_token').eq('trip_id', tripId).maybeSingle();
  let token = row?.public_token;
  if (!token) { const s = await saveTourConfirmation(tripId, (await getTourConfirmation(tripId)).tc || {}); if (s.error) return s; token = s.public_token; }
  const base = customerSiteUrlFor(getBrandCode());
  return { ok: true, url: `${base}/tc/${token}`, token };
}

// Daftar penerima (keluarga per nomor) untuk checklist kirim TC.
export async function getTCRecipients(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/operasional'); if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih.' };
  const db = svc() || supabase;

  const { data: pax } = await db.from('trip_passengers')
    .select('id, customer_id, status, transfer_status, refund_status, is_family_head').eq('trip_id', tripId);
  const active = (pax || []).filter(paxActive).filter((p) => p.customer_id);
  const ids = [...new Set(active.map((p) => p.customer_id))];
  const custMap = {};
  if (ids.length) { const { data: cs } = await db.from('customers').select('id, name, phone, whatsapp').in('id', ids); for (const c of (cs || [])) custMap[c.id] = c; }

  const byKey = {}; let noPhone = 0;
  for (const p of active) {
    const c = custMap[p.customer_id] || {};
    const ph = norm(c.whatsapp || c.phone);
    const valid = !!(ph && ph.length >= 9);
    if (!valid) { noPhone++; continue; }
    const key = 'ph:' + ph;
    (byKey[key] = byKey[key] || { key, phone: ph, members: [] }).members.push({ id: p.id, name: c.name || '(tanpa nama)', isHead: !!p.is_family_head });
  }
  const families = Object.values(byKey).map((grp) => {
    const head = grp.members.find((m) => m.isHead) || grp.members[0];
    return { key: grp.key, phone: grp.phone, headName: head.name, memberIds: grp.members.map((m) => m.id), members: grp.members, count: grp.members.length };
  });
  families.sort((a, b) => (b.count - a.count) || String(a.headName).localeCompare(String(b.headName)));
  return { ok: true, families, noPhone };
}

// Kirim TC ke peserta trip dari nomor PIC (Fonnte). 1 pesan per keluarga.
// selectedIds (opsional): id peserta terpilih; kosong = semua peserta aktif.
export async function sendTourConfirmation(tripId, customMessage, selectedIds) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/operasional'); if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih.' };
  const db = svc() || supabase;

  // Pastikan TC tersimpan + punya token.
  const urlRes = await tcPublicUrl(tripId);
  if (urlRes.error) return urlRes;
  const link = urlRes.url;

  const { data: trip } = await db.from('trips').select('id, name, public_title, kode_trip, pic, pic_email').eq('id', tripId).maybeSingle();
  const tripName = (trip?.public_title || trip?.name || '').trim();

  // Peserta aktif -> group per nomor (keluarga). Bisa dibatasi ke peserta terpilih.
  const sel = (Array.isArray(selectedIds) && selectedIds.length) ? new Set(selectedIds.map(String)) : null;
  const { data: pax } = await db.from('trip_passengers')
    .select('id, customer_id, status, transfer_status, refund_status, is_family_head').eq('trip_id', tripId);
  let active = (pax || []).filter(paxActive).filter((p) => p.customer_id);
  if (sel) active = active.filter((p) => sel.has(String(p.id)));
  if (!active.length) return { error: 'Tidak ada peserta terpilih.' };
  const ids = [...new Set(active.map((p) => p.customer_id))];
  const custMap = {};
  if (ids.length) { const { data: cs } = await db.from('customers').select('id, name, phone, whatsapp').in('id', ids); for (const c of (cs || [])) custMap[c.id] = c; }

  const byPhone = {};
  for (const p of active) {
    const c = custMap[p.customer_id] || {};
    const ph = norm(c.whatsapp || c.phone);
    if (!ph || ph.length < 9) continue;
    (byPhone[ph] = byPhone[ph] || []).push({ name: c.name || '', isHead: !!p.is_family_head });
  }
  const phones = Object.keys(byPhone);
  if (!phones.length) return { error: 'Tidak ada peserta dengan nomor HP di trip ini.' };

  const picTok = await getPicFonnteTokenForTrip({ pic: trip?.pic, pic_email: trip?.pic_email });
  const brand = getBrandCode();
  const baseMsg = String(customMessage || '').trim();

  let sent = 0, failed = 0;
  for (const phone of phones) {
    const arr = byPhone[phone];
    const head = arr.find((x) => x.isHead) || arr[0];
    const first = (String(head.name).trim().split(/\s+/)[0]) || 'Kak';
    const msg = (baseMsg
      ? baseMsg.replace(/\{\{\s*nama\s*\}\}/gi, first)
      : `Halo kak ${first} 🙏\n\nBerikut kami sampaikan *Final Tour Confirmation & Itinerary* untuk trip *${tripName}*.\n\nMohon dibaca kembali detail jadwal, meeting point, serta syarat & ketentuan yang berlaku ya kak.`)
      + `\n\n📄 Tour Confirmation:\n${link}`;
    const res = await sendFonnte(phone, msg, { context: 'cs', brand, token: picTok, delay: BLAST_DELAY, typing: true });
    if (res?.ok) sent++;
    else { failed++; try { await logFailedWA({ context: 'cs', phone, message: msg, kind: 'tour-confirmation', reason: res?.error || 'gagal' }); } catch {} }
  }
  return { ok: true, sent, failed, contacts: phones.length, usedPicNumber: !!picTok, link };
}

// PUBLIC (service role, by token) — untuk halaman /tc/[token].
export async function getTCByToken(token) {
  if (!token) return null;
  const db = svc();
  if (!db) return null;
  const { data: tc } = await db.from('tour_confirmations').select('*').eq('public_token', token).maybeSingle();
  if (!tc) return null;
  const { data: trip } = await db.from('trips').select('id, kode_trip, name, public_title, departure, return_date').eq('id', tc.trip_id).maybeSingle();
  return { tc, trip: trip || null };
}
