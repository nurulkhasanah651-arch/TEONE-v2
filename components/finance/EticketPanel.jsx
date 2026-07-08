'use client';

// Panel E-Ticket per PNR: upload (maks 4), lihat, download, hapus.
import { useState } from 'react';
import { uploadEticket, deleteEticket, getEticketUrl } from '@/lib/actions/eticket';

const MAX_DOCS = 4;

function fmtSize(n) {
  const kb = (Number(n) || 0) / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export default function EticketPanel({ pnrId, initialDocs = [] }) {
  const [docs, setDocs] = useState(Array.isArray(initialDocs) ? initialDocs : []);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleUpload(file) {
    if (!file) return;
    setMsg(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const r = await uploadEticket(pnrId, fd);
      if (r?.ok) { setDocs(r.docs || []); setMsg('✓ E-ticket terupload'); }
      else setMsg(r?.error || 'Upload gagal');
    } catch { setMsg('Upload gagal'); }
    finally { setBusy(false); }
  }

  async function openDoc(path, download) {
    setMsg(''); setBusy(true);
    try {
      const r = await getEticketUrl(pnrId, path, download);
      if (r?.ok && r.url) window.open(r.url, '_blank', 'noopener');
      else setMsg(r?.error || 'Gagal membuka file');
    } catch { setMsg('Gagal membuka file'); }
    finally { setBusy(false); }
  }

  async function handleDelete(path, name) {
    if (!confirm(`Hapus e-ticket "${name}"?`)) return;
    setMsg(''); setBusy(true);
    try {
      const r = await deleteEticket(pnrId, path);
      if (r?.ok) { setDocs(r.docs || []); setMsg('E-ticket dihapus'); }
      else setMsg(r?.error || 'Gagal hapus');
    } catch { setMsg('Gagal hapus'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-slate-900"
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>🎟 E-Ticket</span>
        {docs.length > 0
          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-bold">{docs.length} dokumen</span>
          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">belum ada</span>}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {docs.length === 0 && <p className="text-xs text-slate-500">Belum ada e-ticket diupload untuk PNR ini.</p>}

          {docs.map((d) => (
            <div key={d.path} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 truncate">📄 {d.name}</p>
                <p className="text-[10px] text-slate-500">{fmtSize(d.size)}{d.uploaded_by ? ` · ${d.uploaded_by}` : ''}{d.uploaded_at ? ` · ${String(d.uploaded_at).slice(0, 10)}` : ''}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" disabled={busy} onClick={() => openDoc(d.path, false)} className="text-[11px] font-bold px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">Lihat</button>
                <button type="button" disabled={busy} onClick={() => openDoc(d.path, true)} className="text-[11px] font-bold px-2 py-1 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50">Download</button>
                <button type="button" disabled={busy} onClick={() => handleDelete(d.path, d.name)} className="text-[11px] font-bold px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">Hapus</button>
              </div>
            </div>
          ))}

          {docs.length < MAX_DOCS && (
            <label className="block">
              <span className="text-[11px] font-semibold text-slate-600">Upload e-ticket (PDF/foto, maks {MAX_DOCS} dokumen)</span>
              <input
                type="file"
                accept=".pdf,image/*"
                disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleUpload(f); }}
                className="mt-1 w-full text-xs border border-slate-300 rounded p-2 bg-white disabled:opacity-50"
              />
            </label>
          )}

          {busy && <p className="text-[11px] text-blue-700">⏳ Memproses...</p>}
          {msg && <p className="text-[11px] text-slate-600">{msg}</p>}
        </div>
      )}
    </div>
  );
}
