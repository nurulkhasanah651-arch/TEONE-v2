'use server';
// Plotting TL — gabung trip TEONE (TE) + Khasanah (KT), untuk card/kalender/jadwal per TL.
import { createClient as svc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { supabaseEnvFor } from '@/lib/brand-shared';
import { revalidatePath } from 'next/cache';
import { runWithBrand, serviceClientFor } from '@/lib/supabase/service-env';
import { sendTLAssignmentWA } from '@/lib/actions/tl-assignment';

const COLS = 'id, kode_trip, name, destination, departure, return_date, quota, sold, seat_left, status, tl_name, tl_id, tl_plan, tl_assignment_status';
const ALLOWED = ['owner', 'manager', 'ops', 'accounting'];

function cli(url, key) { return (url && key) ? svc(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null; }

export async function getTlPlotting() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { data: u } = await auth.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!ALLOWED.includes(u?.role)) return { error: 'Akses khusus management' };

  const teUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const teKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const khUrl = supabaseEnvFor('khasanah').url;
  const khKey = process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || teKey;

  async function pull(cl, brand) {
    if (!cl) return [];
    try {
      const { data } = await cl.from('trips').select(COLS)
        .not('departure', 'is', null)
        .order('departure', { ascending: true });
      return (data || [])
        .filter((t) => !['cancelled', 'completed'].includes(t.status))
        .map((t) => ({
          brand, id: t.id, kode: t.kode_trip || t.id, name: t.name || '',
          kategori: t.destination || '', departure: t.departure, return_date: t.return_date,
          seat: Number(t.quota) || 0,
          terisi: t.sold != null ? Number(t.sold) : Math.max((Number(t.quota) || 0) - (Number(t.seat_left) || 0), 0),
          tl: (t.tl_name || '').trim(),
          tl_plan: (t.tl_plan || '').trim(),
          connected: Boolean((t.tl_name || '').trim()),
          assign_status: t.tl_assignment_status || null,
          status: t.status || '',
        }));
    } catch { return []; }
  }

  const te = cli(teUrl, teKey);
  const kh = (khUrl && khUrl !== teUrl) ? cli(khUrl, khKey) : null; // hindari dobel kalau env KH belum di-set
  async function pullTls(cl) {
    if (!cl) return [];
    try {
      const { data } = await cl.from('tour_leaders').select('name').order('name');
      return (data || []).map((x) => (x.name || '').trim()).filter(Boolean);
    } catch { return []; }
  }
  const [teTrips, khTrips, teTls, khTls] = await Promise.all([
    pull(te, 'TE'), pull(kh, 'KT'), pullTls(te), pullTls(kh),
  ]);
  const tlOptions = [...new Set([...teTls, ...khTls])].sort((a, b) => a.localeCompare(b));
  return { ok: true, trips: [...teTrips, ...khTrips], tlOptions };
}

function brandClient(brand) {
  const teUrl = process.env.NEXT_PUBLIC_SUPABASE_URL, teKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (brand === 'KT') {
    const url = supabaseEnvFor('khasanah').url;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY_KHASANAH || teKey;
    return cli(url, key);
  }
  return cli(teUrl, teKey);
}
async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { data: u } = await auth.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!ALLOWED.includes(u?.role)) return { error: 'Akses khusus management' };
  return { ok: true, email: user.email };
}

// Simpan RENCANA nama TL (draft) — TIDAK menyentuh Master Trip.
export async function setTlPlan(brand, tripId, name) {
  const g = await guard(); if (g.error) return g;
  const db = brandClient(brand); if (!db) return { error: 'DB tidak tersedia' };
  const { error } = await db.from('trips').update({ tl_plan: (name || '').trim() || null }).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath('/tl-plotting');
  return { ok: true };
}

// FINAL PLOT — dorong rencana ke Master Trip (isi tl_name; cocokkan tl_id dari tour_leaders bila ada).
// Cari TL di Master TL. Cocok PERSIS dulu; kalau tak ada, coba cocok SEBAGIAN
// (nama panggilan, mis. "hanif" -> "Muhammad Hanif").
// Kalau cocok sebagian ketemu >1 orang, JANGAN menebak — biarkan kosong,
// lebih baik gagal jelas daripada mengirim ke TL yang salah.
async function findTlByName(db, nm) {
  const q = String(nm || '').trim();
  if (!q) return null;
  try {
    const { data: exact } = await db.from('tour_leaders').select('id, name, phone, email').ilike('name', q);
    if (exact?.length === 1) return exact[0];
    if (exact?.length > 1) return exact.find((x) => x.phone) || exact[0];   // duplikat nama: utamakan yg punya nomor
    const { data: part } = await db.from('tour_leaders').select('id, name, phone, email').ilike('name', `%${q}%`);
    if (part?.length === 1) return part[0];
    return null;
  } catch { return null; }
}

export async function finalPlotTl(brand, tripId) {
  const g = await guard(); if (g.error) return g;
  const db = brandClient(brand); if (!db) return { error: 'DB tidak tersedia' };
  const { data: trip } = await db.from('trips').select('tl_plan').eq('id', tripId).maybeSingle();
  const nm = (trip?.tl_plan || '').trim();
  if (!nm) return { error: 'Rencana nama TL masih kosong' };
  const tl = await findTlByName(db, nm);
  const patch = {
    tl_name: nm,
    tl_id: tl?.id || null,
    tl_phone: tl?.phone || null,        // penting: update nomor ke TL baru (jangan pakai nomor TL lama)
    tl_email: tl?.email || null,
    // TL baru → reset status konfirmasi biar mulai fresh (tak terbawa approved/rejected TL lama)
    tl_assignment_status: null,
    tl_assignment_token: null,
    tl_assignment_sent_at: null,
    tl_assignment_responded_at: null,
    tl_assignment_response_note: null,
  };
  const { error } = await db.from('trips').update(patch).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath('/tl-plotting');
  return { ok: true, tl_name: nm, matched: Boolean(tl?.id) };
}

// Kirim ulang WA konfirmasi TL untuk sebuah trip, dari halaman Plotting TL.
// Jalan di konteks brand trip (runWithBrand) supaya link konfirmasi & nomor benar.
export async function resendTlAssignmentWA(brand, tripId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const { data: u } = await auth.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!ALLOWED.includes(u?.role)) return { error: 'Akses khusus management' };

  const code = (brand === 'KT' || brand === 'khasanah') ? 'khasanah' : 'teone';
  return runWithBrand(code, async () => {
    const cl = serviceClientFor(code);
    if (!cl) return { error: 'Service tidak tersedia' };
    const { data: trip } = await cl.from('trips').select('id, tl_id, tl_name, tl_phone').eq('id', tripId).maybeSingle();
    if (!trip) return { error: 'Trip tidak ditemukan' };

    let tlId = trip.tl_id;
    let tlPhone = trip.tl_phone;

    // Master TL bisa berubah SETELAH plotting (TL baru ditambah / nomor baru diisi).
    // Jadi kalau trip belum punya kaitan, coba resolve ulang dari namanya sekarang.
    if (!tlId && trip.tl_name) {
      const found = await findTlByName(cl, trip.tl_name);
      if (found) {
        tlId = found.id;
        tlPhone = found.phone || tlPhone || null;
        try {
          await cl.from('trips').update({ tl_id: found.id, tl_phone: found.phone || null, tl_email: found.email || null }).eq('id', tripId);
        } catch {}
      }
    }

    if (!tlId && !tlPhone) {
      return { error: `TL "${trip.tl_name || '-'}" tidak ketemu di Master TL. Cek ejaan namanya, atau tambahkan TL-nya dulu di Master TL.` };
    }

    // TL-nya ADA tapi nomornya kosong -> pesan yg tepat (dulu bilang "set TL dulu", padahal TL sudah di-set)
    if (tlId && !tlPhone) {
      const { data: tlRow } = await cl.from('tour_leaders').select('name, phone').eq('id', tlId).maybeSingle();
      if (!tlRow?.phone) {
        return { error: `TL "${tlRow?.name || trip.tl_name}" sudah di-set, tapi NOMOR HP-nya kosong di Master TL. Isi nomornya dulu di Master TL, lalu kirim lagi.` };
      }
      tlPhone = tlRow.phone;
    }

    const fd = new FormData();
    fd.set('tripId', String(tripId));
    // Utamakan tl_id → sendTLAssignmentWA lookup nomor TERKINI dari Master TL.
    if (tlId) fd.set('tlId', String(tlId));
    else if (tlPhone) fd.set('tlPhone', String(tlPhone));
    if (trip.tl_name) fd.set('tlName', String(trip.tl_name));
    return sendTLAssignmentWA(fd);
  });
}
