// Guard server-side: pastikan pemanggil server action adalah STAF INTERNAL berwenang,
// bukan akun peserta/customer. Role dihitung dari gerbang otoritatif (employees/
// tour_leaders/mitra), bukan metadata yang bisa di-set sendiri.
//
// Pakai di dalam server action SETELAH mengambil `user` dari supabase.auth.getUser():
//   const guard = await assertStaff(user, '/invoices');
//   if (guard.error) return { error: guard.error };
//
// path default '/invoices' = lolos utk owner/accounting/manager/ops/pic/cs;
// ditolak utk tour_leader/mitra/pending/customer (null).

import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { getRoleFromUser, canAccessPath } from '@/lib/utils/roles';

export async function assertStaff(user, path = '/invoices') {
  if (!user) return { error: 'Not authenticated' };
  const role = await resolveAuthoritativeRole(user, getRoleFromUser(user));
  if (!role || role === 'pending' || (path && !canAccessPath(role, path))) {
    return { error: 'Akses ditolak: hanya staf internal yang diizinkan.' };
  }
  return { role };
}
