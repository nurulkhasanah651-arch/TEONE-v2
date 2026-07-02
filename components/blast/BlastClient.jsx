'use client';
import { useRef, useState } from 'react';
import { getBlastRecipients, sendBlast } from '@/lib/actions/blast';

function fmtDate(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return iso; } }

// Render markup WhatsApp -> HTML untuk preview: *bold* _italic_ ~coret~ ```mono```
function waToHtml(s) {
  const esc = String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc
    .replace(/```([^`]+)```/g, '<code>$1</code>')
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/_([^_\n]+)_/g, '<i>$1</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');
}

export default function BlastClient({ trips = [] }) {
  const [tripId, setTripId] = useState('');
  const [recips, setRecips] = useState(null);
  const [loadingR, setLoadingR] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const taRef = useRef(null);

  async function onPickTrip(id) {
    setTripId(id); setRecips(null); setResult(null); setErr(null); setConfirm(false);
    if (!id) return;
    setLoadingR(true);
    try {
      const r = await getBlastRecipients(id);
      if (r?.ok) setRecips(r); else setErr(r?.error || 'Gagal memuat penerima.');
    } catch (e) { setErr(e?.message || 'Gagal memuat penerima.'); }
    setLoadingR(false);
  }

  // Bungkus teks terpilih dengan simbol (mis. * untuk bold)
  function surround(sym) {
    const ta = taRef.current;
    const val = msg;
    const s = ta ? ta.selectionStart : val.length;
    const e = ta ? ta.selectionEnd : val.length;
    const sel = val.slice(s, e) || 'teks';
    const next = val.slice(0, s) + sym + sel + sym + val.slice(e);
    setMsg(next);
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(s + sym.length, s + sym.length + sel.length);
    });
  }

  async function doSend() {
    setSending(true); setErr(null);
    try {
      const r = await sendBlast(tripId, msg);
      if (r?.ok) { setResult(r); setConfirm(false); }
      else setErr(r?.error || 'Gagal mengirim.');
    } catch (e) { setErr(e?.message || 'Gagal mengirim.'); }
    setSending(false);
  }

  const selectedTrip = trips.find((t) => String(t.id) === String(tripId));
  const sampleName = recips?.recipients?.[0]?.name?.trim()?.split(/\s+/)?.[0] || 'Budi';
  const preview = msg.replace(/\{\{\s*nama\s*\}\}/gi, sampleName);
  const canSend = tripId && msg.trim() && recips?.recipients?.length > 0 && !sending;

  return (
    <div className="space-y-5">
      {/* Pilih trip */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">1. Pilih Trip</label>
        <select value={tripId} onChange={(e) => onPickTrip(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400">
          <option value="">— pilih trip —</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.kode} · {fmtDate(t.departure)} · {t.pax} pax</option>
          ))}
        </select>
        {trips.length === 0 && <p className="text-xs text-slate-400 mt-2">Belum ada trip dengan peserta aktif.</p>}

        {loadingR && <p className="text-sm text-slate-500 mt-3 animate-pulse">Memuat penerima…</p>}
        {recips && !loadingR && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
            <p className="text-slate-700"><span className="font-semibold text-indigo-700">{recips.recipients.length}</span> penerima (nomor unik & valid){selectedTrip ? ` di ${selectedTrip.kode}` : ''}.</p>
            {recips.noPhone > 0 && <p className="text-[11px] text-amber-600 mt-1">⚠ {recips.noPhone} peserta dilewati (tanpa nomor / duplikat).</p>}
          </div>
        )}
      </div>

      {/* Tulis pesan */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">2. Tulis Pesan</label>

        {/* Toolbar format */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => surround('*')} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-bold text-slate-700" title="Tebal: *teks*">B</button>
          <button type="button" onClick={() => surround('_')} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm italic text-slate-700" title="Miring: _teks_">I</button>
          <button type="button" onClick={() => surround('~')} className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm line-through text-slate-700" title="Coret: ~teks~">S</button>
          <button type="button" onClick={() => { const ta = taRef.current; const s = ta ? ta.selectionStart : msg.length; const next = msg.slice(0, s) + '{{nama}}' + msg.slice(s); setMsg(next); requestAnimationFrame(() => { ta?.focus(); }); }}
            className="px-2.5 py-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-medium text-indigo-700" title="Sisipkan nama peserta">+ Nama</button>
        </div>

        <textarea ref={taRef} value={msg} onChange={(e) => setMsg(e.target.value)} rows={7}
          placeholder={"Contoh:\nHalo Kak {{nama}} 🙏\n*Info penting* untuk keberangkatan..."}
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400" />
        <p className="text-[11px] text-slate-400 mt-1">Format WhatsApp: <code className="bg-slate-100 px-1 rounded">*tebal*</code> <code className="bg-slate-100 px-1 rounded">_miring_</code> <code className="bg-slate-100 px-1 rounded">~coret~</code>. <code className="bg-slate-100 px-1 rounded">{'{{nama}}'}</code> = nama depan tiap peserta. Pengirim: <b>CS</b>.</p>

        {msg.trim() && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">Preview (contoh nama: {sampleName})</p>
            <p className="text-sm text-slate-700" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: waToHtml(preview) }} />
          </div>
        )}
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      {result && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
          ✅ Blast selesai — <b>{result.sent}</b> terkirim
          {result.failed > 0 ? `, ${result.failed} gagal (masuk antrean Kirim Ulang di /wa-pending)` : ''}
          {result.noPhone > 0 ? `, ${result.noPhone} tanpa nomor` : ''}.
        </div>
      )}

      {/* Aksi kirim */}
      {!confirm ? (
        <button onClick={() => setConfirm(true)} disabled={!canSend}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white py-3 text-sm font-semibold">
          📣 Blast ke {recips?.recipients?.length || 0} peserta
        </button>
      ) : (
        <div className="rounded-2xl border border-indigo-300 bg-indigo-50 p-4">
          <p className="text-sm text-slate-800 font-semibold mb-3">Kirim blast ke {recips?.recipients?.length} peserta {selectedTrip?.kode} sekarang?</p>
          <div className="flex gap-2">
            <button onClick={doSend} disabled={sending}
              className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 text-sm font-semibold">
              {sending ? 'Mengirim…' : '✅ Ya, kirim sekarang'}
            </button>
            <button onClick={() => setConfirm(false)} disabled={sending}
              className="rounded-xl border border-slate-300 text-slate-600 px-4 py-2.5 text-sm font-medium">Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}
