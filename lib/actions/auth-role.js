'use server';

// Resolusi role staf dari GERBANG OTORITATIF (employees/tour_leaders/mitra) by email.
// Dipakai halaman login sebagai fallback ketika role belum ada di metadata / tabel users,
// supaya akun yg didefinisikan hanya di master `employees` (mis. role ops baru) tetap bisa login.
import { createClient } from '@/lib/supabase/server';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { getRoleFromUser } from '@/lib/utils/roles';

export async function getMyStaffRole() {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { role: null };
    const role = await resolveAuthoritativeRole(user, getRoleFromUser(user));
    return { role: role || null };
  } catch {
    return { role: null };
  }
}
