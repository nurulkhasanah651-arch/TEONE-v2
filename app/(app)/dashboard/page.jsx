// Dashboard — overview with greeting + key stats
// Server Component: fetches user + trip count from Supabase

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { greeting } from '@/lib/utils/format';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Fetch stat counts in parallel
  const [tripsRes, openSellingRes, csTodayRes] = await Promise.all([
    supabase.from('trips').select('id', { count: 'exact', head: true }),
    supabase.from('trips').select('id', { count: 'exact', head: true }).eq('status', 'open selling'),
    supabase.from('cs_daily_updates').select('id', { count: 'exact', head: true }).eq('tanggal', new Date().toISOString().slice(0, 10)),
  ]);

  const totalTrips = tripsRes.count ?? 0;
  const openSelling = openSellingRes.count ?? 0;
  const csToday = csTodayRes.count ?? 0;

  const name = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';

  const stats = [
    { label: 'Total Trip', value: totalTrips, color: 'text-brand-700', bg: 'bg-brand-50', href: '/trips' },
    { label: 'Open Selling', value: openSelling, color: 'text-blue-700', bg: 'bg-blue-50', href: '/trips' },
    { label: 'CS Update Hari Ini', value: csToday, color: 'text-green-700', bg: 'bg-green-50', href: '/cs' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">{greeting()}, {name} 👋</h1>
        <p className="mt-1 text-slate-600">Selamat datang kembali di TEONE — Traveling Eropa One System.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white rounded-xl border border-slate-200 shadow-card p-5 hover:shadow-card-hover transition-shadow"
          >
            <p className="text-sm font-medium text-slate-500">{s.label}</p>
            <p className={`mt-2 text-3xl font-bold ${s.color}`}>{s.value}</p>
            <div className={`mt-3 inline-block ${s.bg} ${s.color} text-xs font-semibold px-2 py-1 rounded`}>
              Lihat detail →
            </div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <h2 className="text-lg font-bold text-brand-700 mb-3">Akses Cepat</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link href="/trips" className="p-4 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-center">
            <p className="text-2xl mb-1">✈</p>
            <p className="text-sm font-semibold text-slate-700">Master Trip</p>
          </Link>
          <Link href="/cs/new" className="p-4 rounded-lg border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition-colors text-center">
            <p className="text-2xl mb-1">+</p>
            <p className="text-sm font-semibold text-slate-700">Input CS Daily</p>
          </Link>
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-center opacity-60">
            <p className="text-2xl mb-1">$</p>
            <p className="text-sm font-semibold text-slate-500">Finance</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">soon</p>
          </div>
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-center opacity-60">
            <p className="text-2xl mb-1">👤</p>
            <p className="text-sm font-semibold text-slate-500">Portal TL</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}
