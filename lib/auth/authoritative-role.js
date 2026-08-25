// GERBANG OTORITATIF ROLE (server-only).
// Role TIDAK boleh berasal dari pilihan/metadata pengguna sendiri.
// Selalu dihitung ulang dari data resmi: employees (staf), tour_leaders, mitra.
// Kalau email/akun tidak ada di salah satu master → TIDAK ada akses (null).
// Ini mencegah siapa pun mengangkat dirinya jadi manager dsb.

import { cache } from 'react';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

const ROLE_MAP = { tl: 'tour_leader', finance: 'ops', team: 'ops' };

// Sentinel: core tak bisa memastikan (tanpa service key / error) → wrapper pakai fallback.
const UNKNOWN = Symbol('role-unknown');

// PERF: hasil di-cache PER REQUEST (React cache), di-key oleh user.id + email saja.
// Pemanggilan berulang dalam satu render (layout + pic-scope + halaman) TIDAK
// menjalankan ulang 3–6 query role. Logika query di dalamnya IDENTIK dgn sebelumnya;
// fallback ditangani di wrapper supaya key cache stabil (tak terpengaruh nilai fallback).
const _resolveCore = cache(async (userId, email) => {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return UNKNOWN; // tanpa service key, hindari lockout total

  const db = createServiceClient(url, key, { auth: { persistSession: false } });

  try {
    // 1) Staf internal — cocokkan via user_id dulu (id akun tidak pernah berubah,
    //    tahan terhadap ganti email), lalu fallback ke email.
    {
      const byId = await db.from('employees').select('role, status').eq('user_id', userId).maybeSingle();
      let emp = byId.data;
      if (!emp && email) {
        const byEmail = await db.from('employees').select('role, status').ilike('email', email).maybeSingle();
        emp = byEmail.data;
      }
      // Blokir karyawan non-aktif (inactive) & yang sudah resign — tidak boleh akses lagi.
      if (emp && !['inactive', 'resigned'].includes(emp.status) && emp.role) {
        return ROLE_MAP[emp.role] || emp.role;
      }
    }

    // 2) Tour Leader — tertaut via user_id atau email (aktif)
    {
      const byId = await db.from('tour_leaders').select('id, active').eq('user_id', userId).maybeSingle();
      let tl = byId.data;
      if (!tl && email) {
        const byEmail = await db.from('tour_leaders').select('id, active').ilike('email', email).maybeSingle();
        tl = byEmail.data;
      }
      if (tl && tl.active !== false) return 'tour_leader';
    }

    // 3) Mitra — tertaut via user_id atau email (aktif)
    {
      const byId = await db.from('mitra').select('id, active').eq('user_id', userId).maybeSingle();
      let m = byId.data;
      if (!m && email) {
        const byEmail = await db.from('mitra').select('id, active').ilike('email', email).maybeSingle();
        m = byEmail.data;
      }
      if (m && m.active !== false) return 'mitra';
    }
  } catch {
    return UNKNOWN; // error tak terduga → jangan kunci pengguna sah (wrapper pakai fallback)
  }

  return null; // tidak terdaftar di master mana pun → tidak ada akses
});

export async function resolveAuthoritativeRole(user, fallback = undefined) {
  if (!user) return null;
  const email = (user.email || '').toLowerCase();
  const res = await _resolveCore(user.id, email);
  return res === UNKNOWN ? fallback : res;
}
