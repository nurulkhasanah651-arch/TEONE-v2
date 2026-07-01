// Authenticated app layout — wraps all logged-in pages with sidebar + header
// Round 37: enforce role-based access

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { getRoleFromUser, canAccessPath, defaultPathForRole } from '@/lib/utils/roles';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { waOutboxSummary } from '@/lib/actions/wa-outbox';

export default async function AppLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Peserta (akun storefront) bukan staf — arahkan ke portal peserta.
  if (user.user_metadata?.role === 'peserta') {
    redirect('/akun');
  }

  // GERBANG OTORITATIF: role dihitung dari data resmi (employees/tour_leaders/mitra),
  // BUKAN dari metadata yang bisa di-set sendiri. Metadata hanya fallback bila
  // service key tidak tersedia (cegah lockout). Tidak terdaftar → tidak ada akses.
  const metaRole = getRoleFromUser(user);
  const role = await resolveAuthoritativeRole(user, metaRole);

  // Tidak terdaftar di master mana pun → arahkan ke verifikasi (TL/Mitra via No HP)
  if (!role || role === 'pending') {
    redirect('/auth/role-picker');
  }

  // Get current path dari header (set by middleware)
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || headersList.get('x-invoke-path') || '/';

  // Cek akses path
  if (!canAccessPath(role, pathname)) {
    redirect(defaultPathForRole(role));
  }

  const _wa = await waOutboxSummary().catch(() => ({ count: 0, depts: [] }));

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar role={role} />
      <div className="md:pl-60">
        <Header user={user} role={role} />
        <main className="p-3 sm:p-6">
          {_wa.count > 0 && (
            <a href="/wa-pending" className="block mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 font-bold hover:bg-red-100">
              ⚠ {_wa.count} pesan WA belum terkirim{_wa.depts?.length ? ` — nomor ${_wa.depts.join(', ').toUpperCase()} kemungkinan terputus dari Fonnte` : ''}. Klik untuk lihat &amp; Kirim Ulang →
            </a>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
