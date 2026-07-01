'use client';
import { useEffect, useRef, useState } from 'react';
import { getCeoAdvisorAnalysis, askCeoAI } from '@/lib/actions/ceo-ai';

// Render ringan: **bold**, baris, dan bullet (-, •, angka).
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

const SUGGESTED = [
  'Bagaimana cara menaikkan conversion rate?',
  'Trip mana yang paling perlu digenjot & kenapa?',
  'Analisa cashflow & piutang saya, ada risiko?',
  'Buat strategi target omzet bulan depan.',
];

export default function CeoAiChat() {
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefErr, setBriefErr] = useState(null);
  const [genAt, setGenAt] = useState(null);

  const [msgs, setMsgs] = useState([]); // {role, content}
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [chatErr, setChatErr] = useState(null);
  const endRef = useRef(null);

  async function loadBrief() {
    setBriefLoading(true); setBriefErr(null);
    try {
      const r = await getCeoAdvisorAnalysis();
      if (r?.ok) { setBrief(r.text); setGenAt(r.generatedAt); }
      else setBriefErr(r?.error || 'Gagal memuat analisa.');
    } catch (e) { setBriefErr(e?.message || 'Gagal memuat analisa.'); }
    setBriefLoading(false);
  }
  useEffect(() => { loadBrief(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, sending]);

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setChatErr(null);
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((p) => [...p, { role: 'user', content: q }]);
    setInput(''); setSending(true);
    try {
      const r = await askCeoAI(q, history);
      if (r?.ok) setMsgs((p) => [...p, { role: 'assistant', content: r.text }]);
      else { setChatErr(r?.error || 'Gagal menjawab.'); setMsgs((p) => [...p, { role: 'assistant', content: '⚠ ' + (r?.error || 'Gagal menjawab.') }]); }
    } catch (e) { setChatErr(e?.message || 'Gagal menjawab.'); }
    setSending(false);
  }

  return (
    <div className="rounded-2xl border border-indigo-200 bg-white overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧠</span>
          <div>
            <p className="font-semibold leading-tight">CEO AI · Business Analyst & Advisor</p>
            <p className="text-[11px] text-indigo-100">Analisa & diskusi strategi berbasis data perusahaan</p>
          </div>
        </div>
        <button onClick={loadBrief} disabled={briefLoading}
          className="text-xs bg-white/15 hover:bg-white/25 disabled:opacity-50 rounded-lg px-3 py-1.5 font-medium">
          {briefLoading ? 'Menganalisa…' : '↻ Analisa ulang'}
        </button>
      </div>

      {/* Briefing advisor */}
      <div className="px-5 py-4 border-b border-slate-100">
        {briefLoading && <p className="text-sm text-slate-500 animate-pulse">CEO AI sedang menganalisa data perusahaan…</p>}
        {briefErr && <p className="text-sm text-rose-600">{briefErr}</p>}
        {brief && !briefLoading && (
          <>
            <RichText text={brief} />
            {genAt && <p className="text-[10px] text-slate-400 mt-3">Dianalisa {new Date(genAt).toLocaleString('id-ID')}</p>}
          </>
        )}
      </div>

      {/* Chat */}
      <div className="px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">💬 Diskusi dengan CEO AI</p>

        {msgs.length === 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTED.map((s) => (
              <button key={s} onClick={() => send(s)} disabled={sending}
                className="text-xs border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50 rounded-full px-3 py-1.5 text-slate-600">
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-3 max-h-[420px] overflow-y-auto">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {m.role === 'user' ? <p className="text-sm whitespace-pre-wrap">{m.content}</p> : <RichText text={m.content} />}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-slate-100 text-slate-500 rounded-2xl px-3.5 py-2.5 text-sm animate-pulse">CEO AI mengetik…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {chatErr && <p className="text-xs text-rose-600 mt-2">{chatErr}</p>}

        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-3 flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} disabled={sending}
            placeholder="Tanya apa saja soal bisnis: strategi, cashflow, ads, target…"
            className="flex-1 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:outline-none focus:border-indigo-400 disabled:bg-slate-50" />
          <button type="submit" disabled={sending || !input.trim()}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-medium">
            Kirim
          </button>
        </form>
      </div>
    </div>
  );
}
