import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Greeting based on current hour
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Siang' : hour < 18 ? 'Selamat Sore' : 'Selamat Malam';
  const name = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';

  return (
    <main className="min-h-screen p-8 bg-slate-50">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <p className="text-sm text-slate-500 font-medium">{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1 className="mt-1 text-3xl font-bold text-brand-700">{greeting}, {name} 👋</h1>
          <p className="mt-2 text-slate-600">Selamat datang kembali di TEONE — Traveling Eropa One System.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-card p-8">
          <h2 className="text-lg font-bold text-brand-700 mb-2">🚧 V2 — Foundation</h2>
          <p className="text-slate-600">
            Ini adalah TEONE v2 yang sedang dibangun ulang dari awal dengan struktur yang lebih bersih dan aman.
            Fitur-fitur akan ditambahkan secara bertahap minggu demi minggu.
          </p>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-green-600">✓</span>
              <span><strong className="text-green-800">Week 1:</strong> Login + Dashboard shell</span>
            </div>
            <div className="flex items-start gap-2 p-3 bg-slate-100 border border-slate-200 rounded-lg">
              <span className="text-slate-400">○</span>
              <span><strong className="text-slate-600">Week 2:</strong> Master Trip + Portal TL</span>
            </div>
            <div className="flex items-start gap-2 p-3 bg-slate-100 border border-slate-200 rounded-lg">
              <span className="text-slate-400">○</span>
              <span><strong className="text-slate-600">Week 3:</strong> Finance + CS Daily</span>
            </div>
            <div className="flex items-start gap-2 p-3 bg-slate-100 border border-slate-200 rounded-lg">
              <span className="text-slate-400">○</span>
              <span><strong className="text-slate-600">Final:</strong> QA + Swap domain</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
