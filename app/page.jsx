import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { isStorefrontHost } from '@/lib/brand-shared';

export default async function HomePage() {
  // Ambil host (jangan bungkus redirect dalam try/catch — redirect melempar error khusus)
  let host = '';
  try { host = headers().get('host') || ''; } catch {}

  // Domain etalase publik (mis. khasanahtravel.com / travelingeropa.com) → storefront
  if (isStorefrontHost(host)) redirect('/home');

  // Domain internal (mis. khasanahtravel.app / teone.dev) → login/dashboard
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/dashboard');
  redirect('/login');
}
