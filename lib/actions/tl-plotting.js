'use server';
// Plotting TL — gabung trip TEONE (TE) + Khasanah (KT), untuk card/kalender/jadwal per TL.
import { createClient as svc } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { supabaseEnvFor } from '@/lib/brand-shared';

const COLS = 'id, kode_trip, name, destination, departure, return_date, quota, sold, seat_left, status, tl_name';
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
          status: t.status || '',
        }));
    } catch { return []; }
  }

  const te = cli(teUrl, teKey);
  const kh = (khUrl && khUrl !== teUrl) ? cli(khUrl, khKey) : null; // hindari dobel kalau env KH belum di-set
  const [teTrips, khTrips] = await Promise.all([pull(te, 'TE'), pull(kh, 'KT')]);
  return { ok: true, trips: [...teTrips, ...khTrips] };
}
