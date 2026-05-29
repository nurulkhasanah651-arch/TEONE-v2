// Round 163: Quotations List Page — filter out templates + link ke Templates
// Path: app/(app)/quotations/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { fmtRupiah, fmtDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const CATEGORY_BADGE = {
  europe:        { label: 'Eropa', bg: 'bg-blue-100', text: 'text-blue-800' },
  asia:          { label: 'Asia', bg: 'bg-pink-100', text: 'text-pink-800' },
  umroh:         { label: 'Umroh', bg: 'bg-green-100', text: 'text-green-800' },
  international: { label: 'Internasional', bg: 'bg-purple-100', text: 'text-purple-800' },
  domestic:      { label: 'Domestik', bg: 'bg-amber-100', text: 'text-amber-800' },
};

export default async function QuotationsListPage() {
  const supabase = createClient();
  const { data: quotations } = await supabase
    .from('trip_quotations')
    .select('*')
    .or('is_template.is.null,is_template.eq.false')
    .order('updated_at', { ascending: false });

  const list = quotations || [];
  const publishedCount = list.filter((q) => q.is_published).length;
  const totalViews = list.reduce((s, q) => s + (q.view_count || 0), 0);

  // Count templates
  const { count: templateCount } = await supabase
    .from('trip_quotations')
    .select('id', { count: 'exact', head: true })
    .eq('is_template', true);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">💰 Penawaran Trip</h1>
          <p className="mt-1 text-slate-600">
            Bikin penawaran cantik dengan AI auto-generate · Share lewat link
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/quotations/templates" className="px-4 py-2.5 bg-purple-100 hover:bg-purple-200 text-purple-700 text-sm font-semibold rounded-lg flex items-center gap-2">
            📚 Templates {templateCount > 0 && <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{templateCount}</span>}
          </Link>
          <Link href="/quotations/new" className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card flex items-center gap-2">
            <span>+</span> Buat Penawaran Baru
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <StatCard label="Total Penawaran" value={list.length} color="text-brand-700" bg="bg-brand-50" />
        <StatCard label="Published" value={publishedCount} color="text-green-700" bg="bg-green-50" />
        <StatCard label="Draft" value={list.length - publishedCount} color="text-amber-700" bg="bg-amber-50" />
        <StatCard label="Total Views" value={totalViews} color="text-purple-700" bg="bg-purple-50" />
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-5xl mb-4">📝</p>
          <p className="text-lg font-bold text-slate-700">Belum ada penawaran</p>
          <p className="mt-1 text-sm text-slate-500">Klik "Buat Penawaran Baru" atau gunakan template.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Link href="/quotations/new" className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">+ Buat Baru</Link>
            <Link href="/quotations/templates" className="px-5 py-2.5 bg-purple-100 hover:bg-purple-200 text-purple-700 text-sm font-semibold rounded-lg">📚 Templates</Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((q) => {
            const cat = CATEGORY_BADGE[q.category] || CATEGORY_BADGE.international;
            return (
              <div key={q.id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden hover:shadow-card-hover transition-shadow">
                {q.hero_image_url ? (
                  <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${q.hero_image_url})` }}>
                    <div className="h-full bg-gradient-to-t from-black/50 to-transparent flex items-end p-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cat.bg} ${cat.text}`}>{cat.label}</span>
                    </div>
                  </div>
                ) : (
                  <div className={`h-32 bg-gradient-to-br ${getGradient(q.category)} flex items-center justify-center`}>
                    <span className="text-5xl opacity-50">{getEmoji(q.category)}</span>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="font-bold text-brand-700 line-clamp-2">{q.title}</h3>
                    {q.is_published
                      ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 whitespace-nowrap">🟢 LIVE</span>
                      : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">⚪ DRAFT</span>}
                  </div>
                  {q.tagline && <p className="text-xs text-slate-600 line-clamp-2 mb-2">{q.tagline}</p>}
                  <div className="text-[11px] text-slate-500 space-y-0.5 mb-3">
                    {q.destinations && <p>📍 {q.destinations}</p>}
                    {q.duration_days && <p>🗓 {q.duration_days} hari{q.departure_date ? ` · Berangkat ${fmtDate(q.departure_date)}` : ''}</p>}
                    {q.view_count > 0 && <p>👁 {q.view_count} views</p>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link href={`/quotations/${q.id}/edit`} className="flex-1 text-center px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded">✏️ Edit</Link>
                    <Link href={`/quotations/${q.id}/preview`} className="flex-1 text-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded">👁 Preview</Link>
                    {q.is_published && q.public_token && (
                      <Link href={`/q/${q.public_token}`} target="_blank" className="px-2 py-1.5 bg-green-100 hover:bg-green-200 text-green-700 text-xs font-semibold rounded" title="Buka public link">🔗</Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-card p-4 ${bg}`}>
      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function getGradient(category) {
  switch (category) {
    case 'europe':        return 'from-blue-200 to-blue-400';
    case 'asia':          return 'from-pink-200 to-pink-400';
    case 'umroh':         return 'from-green-200 to-green-400';
    case 'domestic':      return 'from-amber-200 to-amber-400';
    default:              return 'from-purple-200 to-purple-400';
  }
}

function getEmoji(category) {
  switch (category) {
    case 'europe':   return '🗼';
    case 'asia':     return '🗾';
    case 'umroh':    return '🕋';
    case 'domestic': return '🏝';
    default:         return '✈';
  }
}
