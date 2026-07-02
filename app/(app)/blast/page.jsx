// Blast WA — kirim pesan ke semua peserta aktif satu trip (nomor CS). Staf internal.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRoleFromUser } from '@/lib/utils/roles';
import { listBlastTrips } from '@/lib/actions/blast';
import BlastClient from '@/components/blast/BlastClient';

export const dynamic = 'force-dynamic';

export default async function BlastPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let role = getRoleFromUser(user);
  if (user?.id) {
    const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
    if (u?.role) role = u.role;
  }
  if (role === 'tour_leader' || role === 'mitra' || role === 'pending' || !role) redirect('/dashboard');

  const r = await listBlastTrips();
  const trips = r?.trips || [];

  return (
    <div className="max-w-3xl mx-auto pb-16">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-2xl">📣</span>
        <h1 className="text-2xl font-bold text-slate-800">Blast WA</h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">Kirim satu pesan ke semua peserta aktif dalam satu trip. Personalisasi nama otomatis, nomor pengirim CS.</p>
      <BlastClient trips={trips} />
    </div>
  );
}
