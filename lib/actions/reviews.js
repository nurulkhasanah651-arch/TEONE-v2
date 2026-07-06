'use server';

// Review After Trip — server actions.
// - sendReviewBlast: generate token per peserta + blast WA dari nomor PIC (link review unik).
// - getReviewByToken / submitReview: dipakai halaman publik /review/[token] (service-role).
// - getReviews: tab Review internal. getReviewPendingTrips: kartu H+4 di dashboard PIC.
// Semua ADDITIVE — tidak menyentuh alur lain.

import crypto from 'node:crypto';
import { createClient, createPublicClient } from '@/lib/supabase/server';
import { assertStaff } from '@/lib/auth/require-staff';
import { getBrandCode } from '@/lib/brand';
import { siteUrlFor } from '@/lib/brand-shared';
import { getPicFonnteTokenForTrip } from '@/lib/auth/pic-scope';
import { sendFonnte } from '@/lib/utils/fonnte';

function newToken() { return 'rvw_' + crypto.randomBytes(12).toString('hex'); }
function norm(p) { let s = String(p || '').replace(/\D/g, ''); if (s.startsWith('0')) s = '62' + s.slice(1); if (s.startsWith('8')) s = '62' + s; return s; }
const paxActive = (p) => (p.transfer_status !== 'transferred' && p.refund_status !== 'refunded' && p.refund_status !== 'partial_refund');
const iso = (d) => d.toISOString().slice(0, 10);

// Trip yang sudah pulang H+4 & belum dikirim review (kartu dashboard). PIC hanya trip-nya sendiri.
export async function getReviewPendingTrips() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error, trips: [] };
  const now = new Date();
  const h4 = new Date(now); h4.setDate(h4.getDate() - 4);
  const lo = new Date(now); lo.setDate(lo.getDate() - 45);
  const { data } = await supabase.from('trips')
    .select('id, name, kode_trip, pic, pic_email, tl_name, return_date, review_blast_sent_at')
    .is('review_blast_sent_at', null)
    .lte('return_date', iso(h4))
    .gte('return_date', iso(lo))
    .order('return_date', { ascending: false });
  let trips = data || [];
  if (g.role === 'pic') {
    const email = (user.email || '').toLowerCase();
    trips = trips.filter((t) => (t.pic_email || '').toLowerCase() === email || (t.pic || '').toLowerCase() === email);
  }
  return { ok: true, trips };
}

// Kirim blast review ke semua peserta aktif (link unik per peserta, dari nomor PIC).
export async function sendReviewBlast(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error };
  if (!tripId) return { error: 'Trip belum dipilih.' };
  const brand = getBrandCode();

  const { data: trip } = await supabase.from('trips')
    .select('id, name, kode_trip, pic, pic_email, tl_name').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan.' };

  const { data: pax } = await supabase.from('trip_passengers')
    .select('id, customer_id, transfer_status, refund_status, is_family_head, review_token')
    .eq('trip_id', tripId);
  const active = (pax || []).filter(paxActive).filter((p) => p.customer_id);
  if (!active.length) return { error: 'Tidak ada peserta aktif di trip ini.' };

  const ids = [...new Set(active.map((p) => p.customer_id))];
  const custMap = {};
  const { data: cs } = await supabase.from('customers').select('id, name, phone').in('id', ids);
  for (const c of (cs || [])) custMap[c.id] = c;

  // Pastikan setiap peserta punya review_token + tandai review_sent_at.
  for (const p of active) {
    const patch = { review_sent_at: new Date().toISOString() };
    if (!p.review_token) { p.review_token = newToken(); patch.review_token = p.review_token; }
    await supabase.from('trip_passengers').update(patch).eq('id', p.id);
  }

  // Grup per nomor (keluarga) → kirim 1 pesan ke kepala keluarga dgn link-nya.
  const byPhone = {};
  for (const p of active) {
    const c = custMap[p.customer_id] || {};
    const ph = norm(c.phone);
    if (!ph || ph.length < 9) continue;
    (byPhone[ph] = byPhone[ph] || []).push({ ...p, name: c.name });
  }
  const base = siteUrlFor(brand);
  let picTok = null;
  try { picTok = await getPicFonnteTokenForTrip({ pic: trip.pic, pic_email: trip.pic_email }); } catch {}

  let sent = 0, failed = 0;
  for (const ph of Object.keys(byPhone)) {
    const arr = byPhone[ph];
    const head = arr.find((x) => x.is_family_head) || arr[0];
    const first = (String(head.name || 'Kak').trim().split(/\s+/)[0]) || 'Kak';
    const link = `${base}/review/${head.review_token}`;
    const message = `Selamat siang Kak ${first} 🙏\n\nTerima kasih sudah trip bareng kami di *${trip.name}*. Gimana kesan & pesannya selama perjalanan kemarin? Kami ingin sekali mendengar pengalaman Kaka — masukanmu jadi bahan evaluasi kami untuk terus meningkatkan pelayanan.\n\nMohon luangkan waktu sebentar untuk mengisi review singkat di link berikut ya:\n${link}\n\nTerima kasih banyak atas kepercayaannya 💙`;
    const res = await sendFonnte(ph, message, { context: 'cs', brand, token: picTok, kind: 'review', tripId });
    if (res?.ok) sent++; else failed++;
  }

  await supabase.from('trips').update({ review_blast_sent_at: new Date().toISOString() }).eq('id', tripId);
  return { ok: true, sent, failed, contacts: Object.keys(byPhone).length, usedPicNumber: !!picTok };
}

// ===== Halaman publik /review/[token] =====
export async function getReviewByToken(token) {
  if (!token) return { error: 'Token kosong.' };
  const db = createPublicClient();
  const { data: p } = await db.from('trip_passengers')
    .select('id, trip_id, customer_id, review_submitted_at').eq('review_token', token).maybeSingle();
  if (!p) return { error: 'Link review tidak valid atau sudah kedaluwarsa.' };
  const { data: trip } = await db.from('trips').select('id, name, kode_trip, pic, tl_name').eq('id', p.trip_id).maybeSingle();
  let custName = '';
  if (p.customer_id) { const { data: c } = await db.from('customers').select('name').eq('id', p.customer_id).maybeSingle(); custName = c?.name || ''; }
  return { ok: true, already: !!p.review_submitted_at, tripName: trip?.name || '', kodeTrip: trip?.kode_trip || '', picName: trip?.pic || '', tlName: trip?.tl_name || '', participantName: custName };
}

export async function submitReview(token, payload) {
  if (!token) return { error: 'Token kosong.' };
  const db = createPublicClient();
  const { data: p } = await db.from('trip_passengers')
    .select('id, trip_id, customer_id, review_submitted_at, brand_id').eq('review_token', token).maybeSingle();
  if (!p) return { error: 'Link review tidak valid.' };
  if (p.review_submitted_at) return { error: 'already' };

  const num = (v) => { const n = Number(v); return (n >= 1 && n <= 5) ? Math.round(n) : null; };
  const cs = num(payload?.cs_rating), pic = num(payload?.pic_rating), tl = num(payload?.tl_rating);
  if (!cs || !pic || !tl) return { error: 'Mohon beri bintang untuk CS, PIC, dan Tour Leader.' };

  const { data: trip } = await db.from('trips').select('name, kode_trip, pic, tl_name, brand_id').eq('id', p.trip_id).maybeSingle();
  let custName = '';
  if (p.customer_id) { const { data: c } = await db.from('customers').select('name').eq('id', p.customer_id).maybeSingle(); custName = c?.name || ''; }
  const chans = Array.isArray(payload?.source_channels) ? payload.source_channels.filter(Boolean).slice(0, 10) : [];

  const { error } = await db.from('trip_reviews').insert({
    trip_id: p.trip_id, passenger_id: p.id, brand_id: p.brand_id ?? trip?.brand_id ?? null,
    participant_name: custName, trip_name: trip?.name || '', kode_trip: trip?.kode_trip || '',
    pic_name: trip?.pic || '', tl_name: trip?.tl_name || '',
    cs_rating: cs, cs_note: String(payload?.cs_note || '').slice(0, 2000),
    pic_rating: pic, pic_note: String(payload?.pic_note || '').slice(0, 2000),
    tl_rating: tl, tl_note: String(payload?.tl_note || '').slice(0, 2000),
    additional_note: String(payload?.additional_note || '').slice(0, 4000),
    source_channels: chans, source_other: String(payload?.source_other || '').slice(0, 500),
    next_trip_interest: String(payload?.next_trip_interest || '').slice(0, 1000),
  });
  if (error) return { error: error.message };
  await db.from('trip_passengers').update({ review_submitted_at: new Date().toISOString() }).eq('id', p.id);
  return { ok: true };
}

// ===== Tab Review internal =====
export async function getReviews(tripId = null) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/wa-history');
  if (g.error) return { error: g.error, reviews: [], trips: [] };
  let q = supabase.from('trip_reviews').select('*').order('submitted_at', { ascending: false }).limit(500);
  if (tripId) q = q.eq('trip_id', tripId);
  const { data } = await q;
  const reviews = data || [];
  const trips = [...new Map(reviews.map((r) => [r.trip_id, { id: r.trip_id, name: r.trip_name, kode: r.kode_trip }])).values()];
  return { ok: true, reviews, trips };
}

// Daftar trip yang bisa dikirim review manual (dari tab Review), tanpa nunggu H+4.
// PIC hanya trip-nya sendiri; role lain semua. Hanya trip yang punya peserta aktif.
export async function getReviewSendableTrips() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/blast');
  if (g.error) return { error: g.error, trips: [] };
  const { data } = await supabase.from('trips')
    .select('id, name, kode_trip, pic, pic_email, return_date, review_blast_sent_at')
    .order('return_date', { ascending: false, nullsFirst: false })
    .limit(300);
  // Filter per PIC (PIC hanya trip miliknya). Tetap tampilkan SEMUA status trip —
  // termasuk yang belum di-publish di web — dan tanpa filter jumlah peserta.
  let list = data || [];
  if (g.role === 'pic') {
    const email = (user.email || '').toLowerCase();
    list = list.filter((t) => (t.pic_email || '').toLowerCase() === email || (t.pic || '').toLowerCase() === email);
  }
  const ids = list.map((t) => t.id);
  const cnt = {};
  if (ids.length) {
    const { data: pax } = await supabase.from('trip_passengers').select('trip_id, transfer_status, refund_status').in('trip_id', ids);
    for (const p of (pax || [])) { if (paxActive(p)) cnt[p.trip_id] = (cnt[p.trip_id] || 0) + 1; }
  }
  list = list.map((t) => ({ ...t, pax: cnt[t.id] || 0 }));
  return { ok: true, trips: list };
}
