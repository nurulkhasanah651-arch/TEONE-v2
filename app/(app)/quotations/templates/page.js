// Round 163: Templates page — manage template library
// Path: app/(app)/quotations/templates/page.jsx

import Link from 'next/link';
import { listTemplates } from '@/lib/actions/quotations';

export const dynamic = 'force-dynamic';

const CATEGORY_BADGE = {
  europe:        { label: 'Eropa', bg: 'bg-blue-100', text: 'text-blue-800', emoji: '🗼' },
  asia:          { label: 'Asia', bg: 'bg-pink-100', text: 'text-pink-800', emoji: '🗾' },
  umroh:         { label: 'Umroh', bg: 'bg-green-100', text: 'text-green-800', emoji: '🕋' },
  international: { label: 'Internasional', bg: 'bg-purple-100', text: 'text-purple-800', emoji: '✈' },
  domestic:      { label: 'Domestik', bg: 'bg-amber-100', text: 'text-amber-800', emoji: '🏝' },
};

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/quotations" className="text-sm text-brand-600 font-medium hover:underline">← Penawaran</Link>
          <h1 className="mt-2 text-3xl font-bold text-brand-700">📚 Template Library</h1>
          <p className="mt-1 text-slate-600">
            Template siap pakai untuk bikin penawaran cepat. Klik "Use Template" untuk bikin penawaran baru dari template.
          </p>
        </div>
        <Link href="/quotations/new" className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg shadow-card">
          + Penawaran Baru
        </Link>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-bold mb-1">💡 Cara bikin template:</p>
        <p>Buka penawaran existing yang udah jadi → scroll ke bawah → klik "Save as Template" di section action bar. Template akan muncul di sini.</p>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-5xl mb-4">📚</p>
          <p className="text-lg font-bold text-slate-700">Belum ada template</p>
          <p className="mt-1 text-sm text-slate-500">Buka penawaran yang udah jadi → "Save as Template"</p>
          <Link href="/quotations" className="mt-4 inline-block px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">
            Browse Penawaran
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => {
            const cat = CATEGORY_BADGE[t.category] || CATEGORY_BADGE.international;
            return (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
                {t.hero_image_url ? (
                  <div className="h-32 bg-cover bg-center" style={{ backgroundImage: `url(${t.hero_image_url})` }}>
                    <div className="h-full bg-gradient-to-t from-black/50 to-transparent flex items-end p-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cat.bg} ${cat.text}`}>
                        {cat.label}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className={`h-32 flex items-center justify-center`} style={{ backgroundColor: t.brand_color || '#1e3a8a' }}>
                    <span className="text-5xl opacity-70">{cat.emoji}</span>
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">TEMPLATE</span>
                  </div>
                  <h3 className="font-bold text-brand-700 line-clamp-2">{t.template_name || t.title}</h3>
                  {t.template_description && (
                    <p className="text-xs text-slate-600 line-clamp-2 mt-1">{t.template_description}</p>
                  )}
                  <div className="text-[11px] text-slate-500 space-y-0.5 mt-2 mb-3">
                    {t.destinations && <p>📍 {t.destinations}</p>}
                    {t.duration_days && <p>🗓 {t.duration_days} hari</p>}
                  </div>
                  <form action={`/quotations/new?from_template=${t.id}`} method="GET">
                    <input type="hidden" name="from_template" value={t.id} />
                    <button type="submit" className="w-full px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded">
                      ✨ Use Template
                    </button>
                  </form>
                  <Link href={`/quotations/${t.id}/preview`} className="block mt-1.5 text-center px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded">
                    👁 Preview Template
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
