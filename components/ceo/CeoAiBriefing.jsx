'use client';
import { useEffect, useState } from 'react';
import { getCeoAdvisorAnalysis } from '@/lib/actions/ceo-ai';

function RichText({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <div className="space-y-1 text-sm leading-relaxed">
      {lines.map((ln, i) => {
        if (!ln.trim()) return <div key={i} className="h-1.5" />;
        const parts = ln.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
            : <span key={j}>{p}</span>);
        return <p key={i} className="text-slate-700">{parts}</p>;
      })}
    </div>
  );
}

export default function CeoAiBriefing() {
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [genAt, setGenAt] = useState(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const r = await getCeoAdvisorAnalysis();
      if (r?.ok) { setBrief(r.text); setGenAt(r.generatedAt); }
      else setErr(r?.error || 'Gagal memuat analisa.');
    } catch (e) { setErr(e?.message || 'Gagal memuat analisa.'); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <div>
            <p className="font-semibold leading-tight">CEO AI · Business Analyst & Advisor</p>
            <p className="text-[11px] text-indigo-100">Analisa otomatis kondisi, arahan & peluang ekspansi — berbasis data perusahaan</p>
          </div>
        </div>
        <button onClick={load} disabled={loading}
          className="text-xs bg-white/15 hover:bg-white/25 disabled:opacity-50 rounded-lg px-3 py-1.5 font-medium">
          {loading ? 'Menganalisa…' : '↻ Analisa ulang'}
        </button>
      </div>
      <div className="px-5 py-4">
        {loading && <p className="text-sm text-slate-500 animate-pulse">CEO AI sedang menganalisa situasi perusahaan & menyusun arahan…</p>}
        {err && <p className="text-sm text-rose-600">{err}</p>}
        {brief && !loading && (
          <>
            <RichText text={brief} />
            {genAt && <p className="text-[10px] text-slate-400 mt-3">Dianalisa {new Date(genAt).toLocaleString('id-ID')}</p>}
          </>
        )}
      </div>
    </div>
  );
}
