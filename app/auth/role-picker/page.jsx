// Role Picker — page after first Google login

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRoleFromUser, defaultPathForRole } from '@/lib/utils/roles';
import RolePickerForm from './RolePickerForm';

export const dynamic = 'force-dynamic';

export default async function RolePickerPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const existingRole = getRoleFromUser(user);

  // Kalau sudah punya role, redirect ke default page-nya
  if (existingRole && existingRole !== 'pending') {
    redirect(defaultPathForRole(existingRole));
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-200 shadow-xl p-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white text-2xl">
            ✈
          </div>
          <h1 className="text-2xl font-bold text-brand-700">Pilih Role Kamu</h1>
          <p className="mt-2 text-sm text-slate-600">
            Login: <strong>{user.email}</strong>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Pilih sekali aja — disimpan di akun kamu. Akses kamu disesuaikan dengan role.
          </p>
        </div>

        <RolePickerForm userEmail={user.email} />

        <div className="mt-6 pt-6 border-t border-slate-200">
          <p className="text-xs text-slate-500 text-center">
            <strong>Manager / Owner?</strong> Kontak admin untuk set role manual via Supabase dashboard.
          </p>
        </div>
      </div>
    </main>
  );
}
