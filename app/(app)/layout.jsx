// Authenticated app layout — wraps all logged-in pages with sidebar + header
// Server Component: checks auth, redirects to /login if not signed in

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

export default async function AppLayout({ children }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar />
      <div className="md:pl-60">
        <Header user={user} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
