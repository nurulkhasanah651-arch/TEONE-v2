'use client';
// Visa tambahan (multi) — 1 peserta bisa lebih dari 1 visa (mis. Schengen + UK).
// Additive: kelola trip_passengers.visa_result_docs. Tidak mengganggu hasil primary.
import { useState } from 'react';
import { uploadVisaResultFile, signedVisaResultUrl } from '@/lib/actions/visa-storage';
import { addVisaResultDoc, deleteVisaResultDoc } from '@/lib/actions/visa-workflow';

export default function VisaExtraResults({ passenger }) {
  const [docs, setDocs] = useState(Array.isArray(passenger?.visa_result_docs) ? passenger.visa_result_docs : []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [label, setLabel] = useState('');
  const [result, setResult] = useState('approved');
  const [filePath, setFilePath] = useState('');
  const [fileReady, setFileReady] = useState(false);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [entryType, setEntryType] = useState('single');
  const [rejReason, setRejReason] = useState('');
  const [rejSolution, setRejSolution] = useState('');

  function resetForm() {
    setLabel(''); setResult('approved'); setFilePath(''); setFileReady(false);
    setValidFrom(''); setValidUntil(''); setEntryType('single'); setRejReason(''); setRejSolution('');
  }

  async function onFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('visa_file', file);
      const r = await uploadVisaResultFile(passenger.id, fd);
      if (r?.error) setMsg({ e: r.error });
      else { setFilePath(r.file_path); setFileReady(true); }
    } catch (err) { setMsg({ e: err?.message || 'Gagal upload' }); }
    setBusy(false);
  }

  async function onAdd() {
    if (!fileReady || !filePath) { setMsg({ e: 'Upload file visa dulu ya' }); return; }
    setBusy(true); setMsg(null);
    const entry = {
      label, result, file_path: filePath,
      valid_from: validFrom || null, valid_until: validUntil || null, entry_type: entryType,
      rejection_reason: rejReason || null, rejection_solution: rejSolution || null,
    };
    const r = await addVisaResultDoc(passenger.id, entry);
    if (r?.error) { setMsg({ e: r.error }); setBusy(false); return; }
    setDocs((a) => [...a, r.doc]);
    resetForm(); setOpen(false);
    setMsg({ ok: 'Visa ditambahkan.' }); setBusy(false);
  }

  async function onView(d) {
    try { const u = await signedVisaResultUrl(d.file_path); if (u) window.open(u, '_blank', 'noopener'); } catch {}
  }

  async function onDelete(d) {
    if (!confirm(`Hapus visa "${d.label}"?`)) return;
    setBusy(true);
    const r = await deleteVisaResultDoc(passenger.id, d.id);
    if (!r?.error) setDocs((a) => a.filter((x) => x.id !== d.id));
    setBusy(false);
  }

  return (
    <div className="mt-2 p-3 bg-indigo-50 rounded border border-indigo-200">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <p className="text-xs font-bold text-indigo-800 uppercase">🗂 Visa Tambahan (bisa lebih dari 1, mis. Schengen + UK)</p>
        <button type="button" onClick={() => setOpen((v) => !v)} className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded">{open ? '✕ Tutup' : '➕ Tambah Visa'}</button>
      </div>

      {docs.length > 0 && (
        <div className="space-y-1 mb-2">
          {docs.map((d) => (
            <div key={d.id} className="p-2 bg-white rounded border border-indigo-200 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-700">
                {d.result === 'approved' ? '✅' : '❌'} {d.label}
                {d.result === 'approved' && (d.valid_from || d.valid_until) ? ` — ${d.valid_from || '?'} s/d ${d.valid_until || '?'}` : ''}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => onView(d)} className="px-2 py-0.5 rounded bg-indigo-100 border border-indigo-300 text-indigo-700 text-[11px] font-semibold">👁 Lihat</button>
                <button type="button" onClick={() => onDelete(d)} disabled={busy} className="px-2 py-0.5 rounded bg-red-100 border border-red-300 text-red-700 text-[11px] font-semibold disabled:opacity-50">🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-2">
          <input autoComplete="off" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label visa (mis. Schengen / UK / USA)" className="w-full px-2 py-1 border border-slate-300 rounded text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 cursor-pointer"><input autoComplete="off" type="radio" checked={result === 'approved'} onChange={() => setResult('approved')} /><span className="text-xs font-semibold text-emerald-800">✅ Approved</span></label>
            <label className="flex items-center gap-1 cursor-pointer"><input autoComplete="off" type="radio" checked={result === 'rejected'} onChange={() => setResult('rejected')} /><span className="text-xs font-semibold text-red-800">❌ Rejected</span></label>
          </div>
          <div className="p-2 bg-white rounded border border-indigo-200">
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">📤 Upload File (max 10MB)</label>
            <input autoComplete="off" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={onFile} disabled={busy} className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-indigo-200 file:text-indigo-800 file:font-bold" />
            {busy && <p className="text-[10px] text-amber-700 mt-1">⏳ ...</p>}
            {fileReady && <p className="text-[10px] text-emerald-700 mt-1">✓ File siap</p>}
          </div>
          {result === 'approved' && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <input autoComplete="off" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
              <input autoComplete="off" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
              <select value={entryType} onChange={(e) => setEntryType(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"><option value="single">Single Entry</option><option value="multiple">Multiple Entry</option></select>
            </div>
          )}
          {result === 'rejected' && (
            <>
              <textarea autoComplete="off" value={rejReason} onChange={(e) => setRejReason(e.target.value)} placeholder="Alasan penolakan" rows="2" className="w-full px-2 py-1 border border-slate-300 rounded text-sm" />
              <textarea autoComplete="off" value={rejSolution} onChange={(e) => setRejSolution(e.target.value)} placeholder="Solusi (opsional)" rows="2" className="w-full px-2 py-1 border border-slate-300 rounded text-sm" />
            </>
          )}
          <button type="button" onClick={onAdd} disabled={busy} className="w-full px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded">{busy ? '⏳' : '💾 Tambah Visa Ini'}</button>
        </div>
      )}

      {msg?.e && <p className="text-[11px] text-red-700 mt-1">{msg.e}</p>}
      {msg?.ok && <p className="text-[11px] text-emerald-700 mt-1">{msg.ok}</p>}
    </div>
  );
}
