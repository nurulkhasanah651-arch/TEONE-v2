'use client';
import { useEffect, useState } from 'react';
import { getPicBlastInit, getPicBlastRecipients, sendPicBlast } from '@/lib/actions/blast';

function waToHtml(s) {
  const esc = String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/```([^`]+)```/g, '<code>$1</code>').replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>');
}
function defaultMsg() {
  return `Halo Kak {{nama}} 🙏

Perkenalkan, mulai hari ini saya *{{pic}}* yang menjadi *PIC* Kakak. Saya yang akan membantu & meng-handle *pembayaran, invoice, serta dokumen visa* untuk trip Kakak.

Kalau ada pertanyaan atau butuh bantuan soal itu, silakan hubungi saya langsung di nomor ini ya Kak 🙏

Terima kasih 🙏`;
}

export default function PicIntroBlast() {
  const [init, setInit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [picEmail, setPicEmail] = useState('');
  const [recips, setRecips] = useState(null);
  const [loadingR, setLoadingR] = useState(false);
  const [msg, setMsg] = useState(defaultMsg());
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await getPicBlastInit();
        if (r?.ok) {
          setInit(r);
          if (r.mode === 'self') { setPicEmail(r.picEmail); loadRecips(r.picEmail); }
        } else setErr(r?.error || 'Gagal memuat.');
      } catch (e) { setErr(e?.message || 'Gagal memuat.'); }
      setLoading(false);
    })();
  }, []);

  async function loadRecips(email) {
    setRecips(null); setResult(null); setConfirm(false);
    if (!email) return;
    setLoadingR(true);
    try {
      const r = await getPicBlastRecipients(email);
      if (r?.ok) setRecips(r); else setErr(r?.error || 'Gagal memuat penerima.');
    } catch (e) { setErr(e?.message || 'Gagal memuat penerima.'); }
    setLoadingR(false);
  }

  function onPickPic(email) { setPicEmail(email); setErr(null); loadRecips(email); }

  async function doSend() {
    setSending(true); setErr(null);
    try {
      const r = await sendPicBlast(picEmail, msg);
      if (r?.ok) { setResult(r); setConfirm(false); }
      else setErr(r?.error || 'Gagal mengirim.');
    } catch (e) { setErr(e?.message || 'Gagal mengirim.'); }
    setSending(false);
  }

  const picName = recips?.picName || init?.picName || 'PIC';
  const sampleName = recips?.families?.[0]?.headName?.trim()?.split(/\s+/)?.[0] || 'Budi';
  const preview = msg.replace(/\{\{\s*nama\s*\}\}/gi, sampleName).replace(/\{\{\s*pic\s*\}\}/gi, picName);
  const canSend = picEmail && msg.trim() && recips?.families?.length > 0 && !sending;

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 animate-pulse mb-6">Memuat…</div>;

  return (
    <div className="rounded-2xl border border-violet-200 bg-white overflow-hidden mb-6">
      <div className="bg-gradient-to-r from-violet-600 to-indigo-600 text-white px-5 py-3">
        <p className="font-semibold leading-tight">👋 Blast Perkenalan PIC</p>
        <p className="text-[11px] text-violet-100">Kirim ke SEMUA peserta di trip yang di-assign ke PIC — dari nomor PIC. Untuk kenalan bahwa mulai hari ini dia yang handle pembayaran, invoice & dokumen visa.</p>
      </div>
      <div className="p-4 space-y-4">
        {/* Pilih PIC (owner/manager) */}
        {init?.mode === 'choose' && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pilih PIC</label>
            <select value={picEmail} onChange={(e) => onPickPic(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400">
              <option value="">— pilih PIC —</option>
              {(init.pics || []).map((p) => <option key={p.email} value={p.email}>{p.name} ({p.email})</option>)}
            </select>
          </div>
        )}
        {init?.mode === 'self' && <p className="text-sm text-slate-600">PIC: <b>{init.picName}</b> ({init.picEmail})</p>}

        {loadingR && <p className="text-sm text-slate-500 animate-pulse">Memuat penerima…</p>}
        {recips && !loadingR && (
          <div className="rounded-xl bg-violet-50 p-3 text-sm text-slate-700">
            Akan dikirim ke <b className="text-violet-700">{recips.families.length}</b> kontak (<b>{recips.totalPax}</b> peserta) di <b>{recips.tripCount}</b> trip
            {recips.noPhone > 0 ? ` · ${recips.noPhone} peserta tanpa nomor (dilewati)` : ''}.
            {recips.tripCount === 0 && <span className="text-amber-700 block mt-1">⚠ Belum ada trip yang di-assign ke PIC ini.</span>}
          </div>
        )}

        {/* Pesan */}
        {recips && recips.families.length > 0 && (
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pesan Perkenalan</label>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={8}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400" />
            <p className="text-[11px] text-slate-400 mt-1"><code className="bg-slate-100 px-1 rounded">{'{{nama}}'}</code> = nama peserta · <code className="bg-slate-100 px-1 rounded">{'{{pic}}'}</code> = nama PIC ({picName}) · Format WA: <code className="bg-slate-100 px-1 rounded">*tebal*</code>. Pengirim: <b>nomor PIC</b>.</p>
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 mb-1">Preview</p>
              <p className="text-sm text-slate-700" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: waToHtml(preview) }} />
            </div>
          </div>
        )}

        {err && <p className="text-sm text-rose-600">{err}</p>}
        {result && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
            ✅ Terkirim ke <b>{result.sent}</b> kontak{result.failed > 0 ? `, ${result.failed} gagal (antrean /wa-pending)` : ''}.
            {!result.usedPicNumber && <span className="block text-[11px] text-amber-700 mt-1">⚠ PIC belum isi Token Fonnte → terkirim dari nomor CS (fallback).</span>}
          </div>
        )}

        {recips && recips.families.length > 0 && (!confirm ? (
          <button onClick={() => setConfirm(true)} disabled={!canSend}
            className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white py-3 text-sm font-semibold">
            👋 Blast Perkenalan ke {recips.families.length} kontak
          </button>
        ) : (
          <div className="rounded-xl border border-violet-300 bg-violet-50 p-4">
            <p className="text-sm text-slate-800 font-semibold mb-3">Kirim perkenalan {picName} ke {recips.families.length} kontak ({recips.totalPax} peserta) di {recips.tripCount} trip?</p>
            <div className="flex gap-2">
              <button onClick={doSend} disabled={sending} className="flex-1 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2.5 text-sm font-semibold">{sending ? 'Mengirim…' : '✅ Ya, kirim'}</button>
              <button onClick={() => setConfirm(false)} disabled={sending} className="rounded-xl border border-slate-300 text-slate-600 px-4 py-2.5 text-sm font-medium">Batal</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
