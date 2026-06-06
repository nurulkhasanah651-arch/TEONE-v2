'use client';

// R215r: Visa Documents Download Panel
// Features:
//   - Download single doc (individual file)
//   - Download semua docs 1 peserta sebagai ZIP
//   - Download semua docs SELURUH trip sebagai ZIP (folder per peserta)
// Path: components/visa/VisaDocsDownloadPanel.jsx

import { useState, useTransition } from 'react';
import { getVisaDocsForDownload } from '@/lib/actions/visa-docs-download';

function fmtFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function sanitizeFolderName(name) {
  return String(name || 'unknown').replace(/[^a-zA-Z0-9-_\s]/g, '').trim().slice(0, 60);
}

export default function VisaDocsDownloadPanel({ trip, passengers = [] }) {
  const [pending, startTransition] = useTransition();
  const [docsByPax, setDocsByPax] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [msg, setMsg] = useState(null);
  const [progress, setProgress] = useState(0);

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 5000);
  }

  async function loadDocs() {
    setLoading(true);
    try {
      const r = await getVisaDocsForDownload(trip.id);
      if (r?.error) { showMsg('Gagal load: ' + r.error, 'error'); return; }
      setDocsByPax(r);
      showMsg(`✓ Loaded ${r.total_docs} docs dari ${r.total_passengers} peserta`);
    } catch (e) {
      showMsg('Error: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  // R215r: Download single file
  function downloadFile(url, fileName) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // R215r: Download ZIP per peserta
  async function downloadPaxZip(paxData) {
    setDownloadingZip(true);
    setProgress(0);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder(sanitizeFolderName(paxData.passenger_name));

      const total = paxData.docs.length;
      for (let i = 0; i < total; i++) {
        const doc = paxData.docs[i];
        try {
          const res = await fetch(doc.signed_url);
          if (!res.ok) throw new Error('Fetch failed');
          const blob = await res.blob();
          const fileName = `${sanitizeFolderName(doc.doc_name)}-${doc.original_name || ''}`.slice(0, 100);
          folder.file(fileName, blob);
          setProgress(Math.round(((i + 1) / total) * 100));
        } catch (e) {
          console.warn('Skip:', doc.doc_name, e?.message);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
        // optional progress for zip generation
      });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visa-docs-${sanitizeFolderName(paxData.passenger_name)}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMsg(`✓ ZIP downloaded: ${paxData.passenger_name} (${total} docs)`);
    } catch (e) {
      showMsg('ZIP error: ' + (e?.message || String(e)) + ' · Pastikan jszip terinstall (npm install jszip)', 'error');
    } finally {
      setDownloadingZip(false);
      setProgress(0);
    }
  }

  // R215r: Download ALL trip docs sebagai ZIP, folder per peserta
  async function downloadAllZip() {
    if (!docsByPax || docsByPax.passengers.length === 0) {
      showMsg('Belum ada docs untuk di-download', 'error');
      return;
    }
    setDownloadingZip(true);
    setProgress(0);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const allDocs = docsByPax.passengers.flatMap((p) => p.docs.map((d) => ({ ...d, pax_name: p.passenger_name })));
      const total = allDocs.length;
      let done = 0;

      for (const paxData of docsByPax.passengers) {
        const folder = zip.folder(sanitizeFolderName(paxData.passenger_name));
        for (const doc of paxData.docs) {
          try {
            const res = await fetch(doc.signed_url);
            if (!res.ok) throw new Error('Fetch failed');
            const blob = await res.blob();
            const fileName = `${sanitizeFolderName(doc.doc_name)}-${doc.original_name || ''}`.slice(0, 100);
            folder.file(fileName, blob);
          } catch (e) {
            console.warn('Skip:', doc.doc_name, e?.message);
          }
          done++;
          setProgress(Math.round((done / total) * 100));
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visa-docs-ALL-${trip.kode_trip || trip.id}-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showMsg(`✓ ZIP ALL downloaded: ${total} docs dari ${docsByPax.passengers.length} peserta`);
    } catch (e) {
      showMsg('ZIP error: ' + (e?.message || String(e)) + ' · Pastikan jszip terinstall', 'error');
    } finally {
      setDownloadingZip(false);
      setProgress(0);
    }
  }

  return (
    <div className="bg-white rounded-xl border-2 border-emerald-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-emerald-800 flex items-center gap-2">
              <span>📥</span> Download Dokumen Visa (Per Peserta · ZIP)
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Download dokumen yg di-upload peserta via portal. Bisa per file, per peserta (ZIP), atau semua peserta (ZIP folder per peserta)
            </p>
          </div>
          {!docsByPax && (
            <button
              type="button"
              onClick={loadDocs}
              disabled={loading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded disabled:opacity-50"
            >
              {loading ? '⏳ Loading...' : '🔄 Load Documents'}
            </button>
          )}
          {docsByPax && (
            <button
              type="button"
              onClick={loadDocs}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded"
            >
              {loading ? '⏳' : '🔄 Refresh'}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-sm border-b ${msg.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          {msg.text}
        </div>
      )}

      {downloadingZip && (
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-200">
          <p className="text-xs font-bold text-blue-800">⏳ Generating ZIP... {progress}%</p>
          <div className="mt-1 w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {!docsByPax ? (
        <div className="p-8 text-center text-sm text-slate-500">
          <p>Klik "🔄 Load Documents" untuk lihat dokumen yang sudah di-upload.</p>
          <p className="text-[11px] mt-1">Dokumen di-load dari Supabase storage dgn signed URL (valid 1 jam).</p>
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Summary + Download All */}
          <div className="p-3 bg-emerald-50 rounded border border-emerald-200 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm font-bold text-emerald-800">📊 Summary</p>
              <p className="text-xs text-slate-700">
                <b>{docsByPax.total_passengers}</b> peserta · <b>{docsByPax.total_docs}</b> dokumen
              </p>
            </div>
            <button
              type="button"
              onClick={downloadAllZip}
              disabled={downloadingZip || docsByPax.total_docs === 0}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded"
            >
              {downloadingZip ? '⏳ Generating...' : '📦 Download ALL (ZIP per Peserta)'}
            </button>
          </div>

          {/* Per peserta list */}
          {docsByPax.passengers.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              <p>Belum ada peserta yg upload dokumen.</p>
              <p className="text-[11px] mt-1">Kirim link upload via WA dulu di Visa Workflow Panel.</p>
            </div>
          ) : (
            docsByPax.passengers.map((paxData) => (
              <div key={paxData.passenger_id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">📁 {paxData.passenger_name}</p>
                    <p className="text-[11px] text-slate-500">{paxData.docs.length} dokumen</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadPaxZip(paxData)}
                    disabled={downloadingZip}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded"
                  >
                    {downloadingZip ? '⏳' : '📦 Download ZIP'}
                  </button>
                </div>
                <div className="p-3 space-y-1">
                  {paxData.docs.map((doc) => (
                    <div key={doc.file_path} className="flex items-center justify-between gap-2 p-2 bg-white border border-slate-100 rounded hover:bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">📄 {doc.doc_name}</p>
                        <p className="text-[10px] text-slate-500 truncate">
                          {doc.original_name} · {fmtFileSize(doc.file_size)} · {doc.mime_type}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <a
                          href={doc.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold rounded"
                          title="View di tab baru"
                        >
                          👁 View
                        </a>
                        <button
                          type="button"
                          onClick={() => downloadFile(doc.signed_url, `${paxData.passenger_name}_${doc.doc_name}_${doc.original_name || ''}`)}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded"
                          title="Download single file"
                        >
                          📥 DL
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
            ⏰ Signed URLs valid 1 jam. Refresh kalau expired.
            <br />
            📦 ZIP structure: <code>visa-docs-{'{trip_kode}'}-{'{tgl}'}.zip → {'{nama_peserta}'}/{'{doc_name}-{file}'}</code>
          </div>
        </div>
      )}
    </div>
  );
}
