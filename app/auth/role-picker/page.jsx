// Round 112: Role picker page — yang HILANG dari repo, sebabkan loop ERR_TOO_MANY_REDIRECTS
// Path: app/auth/role-picker/page.jsx
// User baru login → role pending → ke sini → pilih role → ke dashboard

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import RolePickerClient from './RolePickerClient';

export const dynamic = 'force-dynamic';

export default async function RolePickerPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Belum login → ke /login
  if (!user) {
    redirect('/login');
  }

  // Udah ada role yang valid (bukan pending) → langsung ke dashboard
  const currentRole = user.user_metadata?.role || user.app_metadata?.role;
  if (currentRole && currentRole !== 'pending') {
    redirect('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl px-8 py-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-xl">
            ✈
          </div>
          <h1 className="text-xl font-bold text-brand-700">Welcome to TEONE</h1>
          <p className="text-xs text-slate-500 mt-1">{user.email}</p>
        </div>

        <RolePickerClient userEmail={user.email} />
      </div>
    </main>
  );
}
