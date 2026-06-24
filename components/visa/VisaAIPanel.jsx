'use client';

// ADDITIVE — panel Asisten AI Analisa Dokumen Visa di tab Visa per trip.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { analyzeVisaDocs, analyzeVisaDocsBulk } from '@/lib/actions/visa-ai';
import { sendVisaWA } from '@/lib/actions/visa-workflow';

const VERDICT = {
  sesuai: { label: 'Sesuai', cls: 'bg-emerald-50 text-emerald-700', dot: '✅' },
  perlu_cek: { label: 'Perlu dicek', cls: 'bg-amber-50 text-amber-700', dot: '⚠' },
  tidak_sesuai: { label: 'Tidak sesuai', cls: 'bg-red-50 text-red-700', dot: '❌' },
};
function fmt(s) { if (!s) return ''; try { return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }

export default function VisaAIPanel({ tripId, passengers = [] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [acting, setActing] = useState(null);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(null);

  function notify(t) { setMsg(t); setTimeout(() => setMsg(''), 6000); }

  function analisa(pid) {
    setActing('a-' + pid);
    startTransition(async () => {
      const r = await analyzeVisaDocs(pid);
      setActing(null);
      notify(r?.error ? `⚠ ${r.error}` : '🤖 Analisa selesai');
      if (r?.ok) router.refresh();
    });
  }
  function analisaSemua() {
    setActing('bulk');
    startTransition(async () => {
      const r = await analyzeVisaDocsBulk(tripId);
      setActing(null);
      notify(r?.error ? `⚠ ${r.error}` : r.message);
      if (r?.ok) router.refresh();
    });
  }
  function kirimKurang(p) {
    const a = p.analysis || {};
    const lines = [];
    for (const k of (a.kekurangan || [])) lines.push(`• ${k} (belum ada)`);
    for (const d of (a.per_dokumen || [])) if (d.verdict === 'tidak_sesuai') lines.push(`• ${d.dokumen}: ${d.alasan}`);
    if (!lines.length) { notify('Tidak ada kekurangan terdeteksi'); return; }
    setActing('wa-' + p.id);
    startTransition(async () => {
      const r = await sendVisaWA({ tripId, passengerIds: [p.id], templateKey: 'doc_kurang', customVars: { list_dokumen_kurang: lines.join('\n') }, familyAware: false });
      setActing(null);
      notify(r?.error ? `⚠ ${r.error}` : '✅ WA kekurangan terkirim');
    });
  }

  function Summary({ a }) {
    if (!a) return <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">Belum dianalisa</span>;
    const s = a.skor || {};
    return (
      <span className="flex items-center gap-1.5 flex-wrap text-[11px]">
        {s.sesuai > 0 && <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">✅ {s.sesuai}</span>}
        {s.perlu_cek > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">⚠ {s.perlu_cek}</span>}
        {s.tidak_sesuai > 0 && <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700">❌ {s.tidak_sesuai}</span>}
        {s.kurang > 0 && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">⛔ {s.kurang} kurang</span>}
      </span>
    );
  }

  const withDocs = passengers.filter((p) => p.hasUploads);
  const noDocs = passengers.filter((p) => !p.hasUploads);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-bold text-brand-700">🤖 Asisten AI — Analisa Dokumen Visa</p>
          <p className="text-[11px] text-slate-500">Menilai dokumen yang diupload terhadap syarat visa & konteks trip (kelengkapan, cashflow rekening, surat usaha/sponsor, kecocokan tanggal & tujuan).</p>
        </div>
        <button onClick={analisaSemua} disabled={busy} className="text-xs font-semibold px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50">{acting === 'bulk' ? 'Menganalisa…' : '🤖 Analisa Semua'}</button>
      </div>
      {msg && <div className="px-5 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-100">{msg}</div>}

      <div className="divide-y divide-slate-100">
        {withDocs.length === 0 && <div className="px-5 py-4 text-sm text-slate-500">Belum ada peserta yang mengupload dokumen.</div>}
        {withDocs.map((p) => {
          const a = p.analysis;
          const isOpen = open === p.id;
          return (
            <div key={p.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-700">{p.name}</span>
                  <Summary a={a} />
                  {a?.analyzed_at && <span className="text-[10px] text-slate-400">{fmt(a.analyzed_at)}</span>}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {a && <button onClick={() => setOpen(isOpen ? null : p.id)} className="text-[11px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-100">{isOpen ? 'Tutup' : 'Detail'}</button>}
                  <button onClick={() => analisa(p.id)} disabled={busy} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 border border-brand-200 hover:bg-brand-100 disabled:opacity-50">{acting === 'a-' + p.id ? 'Menganalisa…' : (a ? '🔄 Analisa ulang' : '🤖 Analisa')}</button>
                  {a && ((a.kekurangan || []).length > 0 || (a.per_dokumen || []).some((d) => d.verdict === 'tidak_sesuai')) && (
                    <button onClick={() => kirimKurang(p)} disabled={busy} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50">{acting === 'wa-' + p.id ? 'Kirim…' : '📤 WA Kekurangan'}</button>
                  )}
                </div>
              </div>
              {a?.ringkasan && <p className="text-xs text-slate-600 mt-1">{a.ringkasan}</p>}
              {isOpen && a && (
                <div className="mt-2 space-y-2 bg-slate-50 rounded-lg p-3">
                  {(a.per_dokumen || []).map((d, i) => {
                    const v = VERDICT[d.verdict] || VERDICT.perlu_cek;
                    return (
                      <div key={i} className="text-xs">
                        <span className={`font-semibold px-1.5 py-0.5 rounded ${v.cls}`}>{v.dot} {d.dokumen}</span>
                        <span className="text-slate-600"> — {d.alasan}</span>
                      </div>
                    );
                  })}
                  {(a.kekurangan || []).length > 0 && (
                    <div className="text-xs"><span className="font-semibold text-slate-700">⛔ Belum ada:</span> <span className="text-slate-600">{a.kekurangan.join(', ')}</span></div>
                  )}
                  {(a.saran || []).length > 0 && (
                    <div className="text-xs"><span className="font-semibold text-slate-700">💡 Saran:</span>
                      <ul className="list-disc ml-5 text-slate-600">{a.saran.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400">Hasil AI sebagai bantuan screening — tetap verifikasi manual sebelum diproses.</p>
                </div>
              )}
            </div>
          );
        })}
        {noDocs.length > 0 && (
          <div className="px-5 py-2 text-[11px] text-slate-400">{noDocs.length} peserta belum upload dokumen (tidak bisa dianalisa).</div>
        )}
      </div>
    </div>
  );
}
