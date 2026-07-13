'use client';
import { useMemo, useRef, useState } from 'react';
import { getBlastRecipients, sendBlast, uploadBlastDoc } from '@/lib/actions/blast';

function fmtDate(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return iso; } }
function waToHtml(s) {
  const esc = String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/```([^`]+)```/g, '<code>$1</code>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>');
}

export default function BlastClient({ trips = [] }) {
  const [tripId, setTripId] = useState('');
  const [recips, setRecips] = useState(null);
  const [loadingR, setLoadingR] = useState(false);
  const [selKeys, setSelKeys] = useState(() => new Set());
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [doc, setDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const taRef = useRef(null);

  async function onPickTrip(id) {
    setTripId(id); setRecips(null); setResult(null); setErr(null); setConfirm(false); setQ(''); setSelKeys(new Set());
    if (!id) return;
    setLoadingR(true);
    try {
      const r = await getBlastRecipients(id);
      if (r?.ok) { setRecips(r); setSelKeys(new Set(r.families.filter((f) => f.hasPhone).map((f) => f.key))); }
      else setErr(r?.error || 'Gagal memuat peserta.');
    } catch (e) { setErr(e?.message || 'Gagal memuat peserta.'); }
    setLoadingR(false);
  }

  function toggle(key) { setSelKeys((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; }); }
  function selectAll(on) { if (recips) setSelKeys(on ? new Set(recips.families.filter((f) => f.hasPhone).map((f) => f.key)) : new Set()); }

  function surround(sym) {
    const ta = taRef.current; const val = msg;
    const s = ta ? ta.selectionStart : val.length; const e = ta ? ta.selectionEnd : val.length;
    const sel = val.slice(s, e) || 'teks';
    setMsg(val.slice(0, s) + sym + sel + sym + val.slice(e));
    requestAnimationFrame(() => { if (ta) { ta.focus(); ta.setSelectionRange(s + sym.length, s + sym.length + sel.length); } });
  }

  async function onUploadDoc(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setErr(null);
    try {
      const fd = new FormData(); fd.set('file', file);
      const r = await uploadBlastDoc(fd);
      if (r?.ok) setDoc({ url: r.url, name: r.name });
      else setErr(r?.error || 'Upload gagal.');
    } catch (e2) { setErr(e2?.message || 'Upload gagal.'); }
    setUploading(false);
  }

  async function doSend() {
    setSending(true); setErr(null);
    try {
      const ids = recips.families.filter((f) => selKeys.has(f.key)).flatMap((f) => f.memberIds);
      const r = await sendBlast(tripId, msg, ids, doc?.url || null, doc?.name || null);
      if (r?.ok) { setResult(r); setConfirm(false); }
      else setErr(r?.error || 'Gagal mengirim.');
    } catch (e) { setErr(e?.message || 'Gagal mengirim.'); }
    setSending(false);
  }

  const selectedTrip = trips.find((t) => String(t.id) === String(tripId));
  const families = recips?.families || [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return families;
    return families.filter((f) => f.headName.toLowerCase().includes(s) || f.members.some((m) => m.name.toLowerCase().includes(s)));
  }, [families, q]);
  const selFams = families.filter((f) => selKeys.has(f.key));
  const selPax = selFams.reduce((a, f) => a + f.count, 0);
  const sampleName = selFams[0]?.headName?.trim()?.split(/\s+/)?.[0] || 'Budi';
  const preview = msg.replace(/\{\{\s*nama\s*\}\}/gi, sampleName);
  const canSend = tripId && msg.trim() && selKeys.size > 0 && !sending;

  return (
    <div className="space-y-5">
      {/* 1. Trip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">1. Pilih Trip</label>
        <select value={tripId} onChange={(e) => onPickTrip(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
          <option value="">— pilih trip —</option>
          {trips.map((t) => (<option key={t.id} value={t.id}>{t.kode} · {fmtDate(t.departure)} · {t.pax} pax</option>))}
        </select>
        {trips.length === 0 && <p className="text-xs text-slate-400 mt-2">Belum ada trip dengan peserta aktif.</p>}
        {loadingR && <p className="text-sm text-slate-500 mt-3 animate-pulse">Memuat peserta…</p>}
      </div>

      {/* 2. Checklist per keluarga */}
      {recips && !loadingR && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">2. Pilih Keluarga / Peserta</label>
            <div className="flex items-center gap-2 text-xs">
              <button onClick={() => selectAll(true)} className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">Pilih semua</button>
              <button onClick={() => selectAll(false)} className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50">Kosongkan</button>
            </div>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama peserta…"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          <p className="text-xs text-slate-500 mt-2">
            <span className="font-semibold text-indigo-700">{selKeys.size}</span> kontak terpilih ({selPax} peserta)
            {recips.noPhone > 0 ? ` · ${recips.noPhone} tanpa nomor (tak bisa dipilih)` : ''}
          </p>
          <div className="mt-2 max-h-80 overflow-y-auto space-y-1.5">
            {filtered.map((f) => (
              <label key={f.key} className={`flex items-start gap-3 rounded-xl border px-3 py-2 ${f.hasPhone ? 'border-slate-200 hover:bg-slate-50 cursor-pointer' : 'border-slate-100 opacity-50'} ${selKeys.has(f.key) ? 'bg-indigo-50/50 border-indigo-200' : ''}`}>
                <input type="checkbox" disabled={!f.hasPhone} checked={selKeys.has(f.key)} onChange={() => toggle(f.key)} className="mt-0.5 w-4 h-4 accent-indigo-600" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800 truncate">{f.headName}</span>
                    {f.count > 1 && <span className="text-[10px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">Keluarga · {f.count} org</span>}
                  </div>
                  {f.count > 1 && <p className="text-[11px] text-slate-500 truncate">{f.members.map((m) => m.name).join(', ')}</p>}
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">{f.hasPhone ? f.phone : 'tanpa nomor'}</span>
              </label>
            ))}
            {filtered.length === 0 && <p className="px-3 py-3 text-sm text-slate-400">Tidak ada yang cocok.</p>}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Satu keluarga = satu nomor kontak → pesan dikirim <b>sekali</b> per keluarga (sapaan pakai nama kepala keluarga).</p>
        </div>
      )}

      {/* 3. Pesan */}
      {recips && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">3. Tulis Pesan</label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" onClick={() => surround('*')} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-bold text-slate-700" title="Tebal: *teks*">B</button>
            <button type="button" onClick={() => surround('_')} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm italic text-slate-700" title="Miring: _teks_">I</button>
            <button type="button" onClick={() => surround('~')} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm line-through text-slate-700" title="Coret: ~teks~">S</button>
            <button type="button" onClick={() => { const ta = taRef.current; const s = ta ? ta.selectionStart : msg.length; setMsg(msg.slice(0, s) + '{{nama}}' + msg.slice(s)); requestAnimationFrame(() => ta?.focus()); }}
              className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-medium text-indigo-700" title="Sisipkan nama">+ Nama</button>
          </div>
          <textarea ref={taRef} value={msg} onChange={(e) => setMsg(e.target.value)} rows={7}
            placeholder={"Contoh:\nHalo Kak {{nama}} 🙏\n*Info penting* untuk keberangkatan..."}
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
          <p className="text-[11px] text-slate-400 mt-1">Format WA: <code className="bg-slate-100 px-1 rounded">*tebal*</code> <code className="bg-slate-100 px-1 rounded">_miring_</code> <code className="bg-slate-100 px-1 rounded">~coret~</code>. <code className="bg-slate-100 px-1 rounded">{'{{nama}}'}</code> = nama depan kepala keluarga. Pengirim: <b>CS</b>.</p>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Lampiran dokumen (opsional)</p>
            {doc ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-700 truncate">📎 {doc.name}</span>
                <button type="button" onClick={() => setDoc(null)} className="text-xs text-rose-600 hover:underline shrink-0">Hapus</button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer text-indigo-600 hover:underline">
                <input type="file" accept=".pdf,image/*" onChange={onUploadDoc} className="hidden" />
                {uploading ? 'Mengunggah…' : '+ Upload PDF / gambar (mis. itinerary terbaru)'}
              </label>
            )}
            <p className="text-[10px] text-slate-400 mt-1">File dikirim sebagai lampiran WA ke tiap peserta (bukan sekadar link). Maks 25MB.</p>
          </div>
          {msg.trim() && (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">Preview (contoh nama: {sampleName})</p>
              <p className="text-sm text-slate-700" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: waToHtml(preview) }} />
            </div>
          )}
        </div>
      )}

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {result && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✅ Blast selesai — terkirim ke <b>{result.sent}</b> kontak
          {result.failed > 0 ? `, ${result.failed} gagal (masuk antrean /wa-pending)` : ''}.
        </div>
      )}

      {recips && (!confirm ? (
        <button onClick={() => setConfirm(true)} disabled={!canSend}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-3 text-sm font-semibold">
          📣 Blast ke {selKeys.size} kontak ({selPax} peserta)
        </button>
      ) : (
        <div className="rounded-2xl border border-indigo-300 bg-indigo-50 p-4">
          <p className="text-sm text-slate-800 font-semibold mb-3">Kirim blast ke {selKeys.size} kontak ({selPax} peserta) di {selectedTrip?.kode}?</p>
          <div className="flex gap-2">
            <button onClick={doSend} disabled={sending} className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 text-sm font-semibold">
              {sending ? 'Mengirim…' : '✅ Ya, kirim sekarang'}
            </button>
            <button onClick={() => setConfirm(false)} disabled={sending} className="rounded-xl border border-slate-300 text-slate-600 px-4 py-2.5 text-sm font-medium">Batal</button>
          </div>
        </div>
      ))}
    </div>
  );
}
