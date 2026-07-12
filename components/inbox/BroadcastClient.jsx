'use client';

// Broadcast WABA + Template Manager (Khasanah).
import { useState, useTransition } from 'react';
import { previewBroadcastAudience, sendBroadcast } from '@/lib/actions/wa-blast';

export default function BroadcastClient({ initial }) {
  const [tab, setTab] = useState('kirim');
  const numbers = initial?.numbers || [];
  const trips = initial?.trips || [];
  const templates = initial?.templates || [];
  const tplError = initial?.tplError;

  const [numberId, setNumberId] = useState(numbers[0]?.id || '');
  const [tripId, setTripId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [extra, setExtra] = useState('');
  const [audience, setAudience] = useState(null);
  const [result, setResult] = useState(null);
  const [pending, start] = useTransition();

  function checkAudience(tid) {
    setTripId(tid); setAudience(null); setResult(null);
    if (!tid) return;
    start(async () => { const r = await previewBroadcastAudience(tid); if (r?.ok) setAudience(r); });
  }
  function kirim() {
    if (!numberId || !tripId || !templateName) { alert('Lengkapi nomor, trip, dan template'); return; }
    if (!confirm(`Kirim broadcast template "${templateName}" ke ${audience?.count || '?'} peserta?`)) return;
    const extraParams = extra.split('|').map((x) => x.trim()).filter(Boolean);
    setResult(null);
    start(async () => {
      const r = await sendBroadcast({ numberId: Number(numberId), tripId, templateName, extraParams });
      if (r?.error) { alert(r.error); return; }
      setResult(r);
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold text-brand-700">📣 Broadcast WhatsApp (WABA)</h1>
      <div className="flex gap-2">
        <button onClick={() => setTab('kirim')} className={`px-3 py-1.5 text-sm font-bold rounded ${tab === 'kirim' ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>Kirim Broadcast</button>
        <button onClick={() => setTab('template')} className={`px-3 py-1.5 text-sm font-bold rounded ${tab === 'template' ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>Template ({templates.length})</button>
      </div>

      {tab === 'kirim' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-card">
          {numbers.length === 0 && <p className="text-sm text-amber-700">Belum ada nomor WABA yang bisa kamu pakai. Isi Meta Phone Number ID di HR dulu.</p>}
          <label className="block"><span className="text-xs font-bold text-slate-600">Kirim dari nomor</span>
            <select value={numberId} onChange={(e) => setNumberId(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
              {numbers.map((n) => <option key={n.id} value={n.id}>{n.pic_name || n.display_phone || n.phone_number_id}</option>)}
            </select>
          </label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Ke peserta trip</span>
            <select value={tripId} onChange={(e) => checkAudience(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
              <option value="">— Pilih trip —</option>
              {trips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip} — {t.name}</option>)}
            </select>
          </label>
          {audience && <p className="text-xs text-slate-600">👥 {audience.count} peserta punya nomor{audience.recipients?.length ? ` (mis. ${audience.recipients.join(', ')})` : ''}</p>}
          <label className="block"><span className="text-xs font-bold text-slate-600">Template</span>
            {tplError ? <p className="text-xs text-red-600 mt-1">{tplError}</p> : (
              <select value={templateName} onChange={(e) => setTemplateName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">
                <option value="">— Pilih template —</option>
                {templates.map((t) => <option key={t.id || t.name} value={t.name}>{t.name} ({t.language})</option>)}
              </select>
            )}
          </label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Variabel tambahan (opsional)</span>
            <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="var2 | var3 (var1 = nama otomatis)" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            <span className="text-[11px] text-slate-500">{'{{1}}'} otomatis nama peserta. Isi sisanya kalau template punya lebih dari 1 variabel.</span>
          </label>
          <button onClick={kirim} disabled={pending || !templateName || !tripId} className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg disabled:opacity-50">
            {pending ? 'Mengirim…' : `📤 Kirim ke ${audience?.count || 0} peserta`}
          </button>
          {result && (
            <div className="text-sm bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              ✅ Terkirim {result.sent}/{result.total}{result.failed ? ` · ${result.failed} gagal` : ''}
              {result.errors?.length > 0 && <ul className="mt-1 text-[11px] text-red-600 list-disc pl-4">{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
      )}

      {tab === 'template' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          {tplError ? <p className="p-5 text-sm text-red-600">{tplError}</p> : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase"><tr><th className="px-4 py-2">Nama</th><th className="px-4 py-2">Kategori</th><th className="px-4 py-2">Bahasa</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <tr key={t.id || t.name}><td className="px-4 py-2 font-semibold">{t.name}</td><td className="px-4 py-2">{t.category}</td><td className="px-4 py-2">{t.language}</td><td className="px-4 py-2"><span className="text-[11px] px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold">{t.status}</span></td></tr>
                ))}
                {templates.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Tidak ada template approved.</td></tr>}
              </tbody>
            </table>
          )}
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">Template dibuat &amp; di-approve di Meta WhatsApp Manager. Di sini hanya menampilkan yang sudah Approved.</p>
        </div>
      )}
    </div>
  );
}
