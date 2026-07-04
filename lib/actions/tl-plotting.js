'use server';
// Plotting TL — gabung trip TEONE (TE) + Khasanah (KT), untuk card/kalender/jadwal per TL.
import { createClient as svc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { supabaseEnvFor } from '@/lib/brand-shared';
import { revalidatePath } from 'next/cache';

const COLS = 'id, kode_trip, name, destination, departure, return_date, quota, sold, seat_left, status, tl_name, tl_id, tl_plan';
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
export async function finalPlotTl(brand, tripId) {
  const g = await guard(); if (g.error) return g;
  const db = brandClient(brand); if (!db) return { error: 'DB tidak tersedia' };
  const { data: trip } = await db.from('trips').select('tl_plan').eq('id', tripId).maybeSingle();
  const nm = (trip?.tl_plan || '').trim();
  if (!nm) return { error: 'Rencana nama TL masih kosong' };
  let tlId = null;
  try { const { data: tl } = await db.from('tour_leaders').select('id').ilike('name', nm).maybeSingle(); tlId = tl?.id || null; } catch {}
  const patch = { tl_name: nm };
  if (tlId) patch.tl_id = tlId;
  const { error } = await db.from('trips').update(patch).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath('/tl-plotting');
  return { ok: true, tl_name: nm, matched: Boolean(tlId) };
}
