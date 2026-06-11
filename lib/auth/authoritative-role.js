// GERBANG OTORITATIF ROLE (server-only).
// Role TIDAK boleh berasal dari pilihan/metadata pengguna sendiri.
// Selalu dihitung ulang dari data resmi: employees (staf), tour_leaders, mitra.
// Kalau email/akun tidak ada di salah satu master → TIDAK ada akses (null).
// Ini mencegah siapa pun mengangkat dirinya jadi manager dsb.

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

const ROLE_MAP = { tl: 'tour_leader', finance: 'ops', team: 'ops' };

export async function resolveAuthoritativeRole(user, fallback = undefined) {
  if (!user) return null;
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return fallback; // tanpa service key, hindari lockout total

  const db = createServiceClient(url, key, { auth: { persistSession: false } });
  const email = (user.email || '').toLowerCase();

  try {
    // 1) Staf internal — cocokkan email ke master karyawan
    if (email) {
      const { data: emp } = await db
        .from('employees').select('role, status').ilike('email', email).maybeSingle();
      if (emp && emp.status !== 'inactive' && emp.role) {
        return ROLE_MAP[emp.role] || emp.role;
      }
    }

    // 2) Tour Leader — tertaut via user_id atau email (aktif)
    {
      const byId = await db.from('tour_leaders').select('id, active').eq('user_id', user.id).maybeSingle();
      let tl = byId.data;
      if (!tl && email) {
        const byEmail = await db.from('tour_leaders').select('id, active').ilike('email', email).maybeSingle();
        tl = byEmail.data;
      }
      if (tl && tl.active !== false) return 'tour_leader';
    }

    // 3) Mitra — tertaut via user_id atau email (aktif)
    {
      const byId = await db.from('mitra').select('id, active').eq('user_id', user.id).maybeSingle();
      let m = byId.data;
      if (!m && email) {
        const byEmail = await db.from('mitra').select('id, active').ilike('email', email).maybeSingle();
        m = byEmail.data;
      }
      if (m && m.active !== false) return 'mitra';
    }
  } catch {
    return fallback; // error tak terduga → jangan kunci pengguna sah
  }

  return null; // tidak terdaftar di master mana pun → tidak ada akses
}
