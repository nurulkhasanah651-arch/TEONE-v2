'use client';

// R215t: Visa Drive Sync Panel
// - Setup parent folder (admin paste URL)
// - Sync all docs ke Drive (auto-create folder per peserta)
// - Open Drive folder
// Path: components/visa/VisaDriveSyncPanel.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setVisaDriveFolder, syncTripDocsToDrive, unlinkVisaDriveFolder } from '@/lib/actions/visa-drive-sync';

function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d; }
}

function timeAgo(d) {
  if (!d) return '';
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)} detik lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

export default function VisaDriveSyncPanel({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [folderInput, setFolderInput] = useState('');

  const hasSetup = !!trip?.visa_drive_trip_folder_id;
  const folderUrl = trip?.visa_drive_trip_folder_url;
  const lastSync = trip?.visa_drive_last_sync_at;

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 6000);
  }

  function handleSetup() {
    if (!folderInput.trim()) { showMsg('Paste URL/ID folder Drive dulu', 'error'); return; }
    startTransition(async () => {
      const r = await setVisaDriveFolder(trip.id, folderInput.trim());
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(`✓ Drive folder ter-link! Trip folder: ${r.trip_folder_url}`);
      setFolderInput('');
      router.refresh();
    });
  }

  function handleSync() {
    startTransition(async () => {
      const r = await syncTripDocsToDrive(trip.id);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      if (r.message) showMsg(r.message);
      else showMsg(`✓ Sync sukses: ${r.synced} file di-upload, ${r.skipped} skipped, ${r.errors} error`);
      router.refresh();
    });
  }

  function handleUnlink() {
    if (!confirm('Unlink Drive folder?\nFile di Drive TIDAK dihapus, cuma TEONE gak tracking lagi.')) return;
    startTransition(async () => {
      const r = await unlinkVisaDriveFolder(trip.id);
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg('✓ Drive folder unlinked'); router.refresh(); }
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-blue-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200">
        <h2 className="font-bold text-blue-800 flex items-center gap-2">
          <span>☁️</span> Google Drive Sync (auto folder per peserta)
        </h2>
        <p className="text-[11px] text-slate-600 mt-0.5">
          Auto-upload dokumen visa peserta ke Google Drive. Folder per peserta auto-create.
        </p>
      </div>

      {msg && (
        <div className={`px-5 py-3 text-sm border-b ${msg.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="p-5">
        {!hasSetup ? (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-2">
              <p className="font-bold">📋 Setup (sekali doang per trip):</p>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Buka <a href="https://drive.google.com" target="_blank" rel="noreferrer" className="underline font-bold">drive.google.com</a></li>
                <li>Bikin folder baru, misal <b>"Visa Documents TE"</b></li>
                <li>Klik kanan folder → <b>Share</b> → tambah email service account TE sebagai <b>Editor</b></li>
                <li>Klik kanan folder → <b>Get link</b> → copy URL</li>
                <li>Paste URL di kolom di bawah</li>
              </ol>
              <p className="text-[10px] mt-2 italic">
                ℹ Service account email sama dgn yang dipakai accounting-sheet sync. Cek di Accounting → Google Sheet panel.
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">URL/ID Folder Drive:</label>
              <input
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                className="w-full px-3 py-2 border-2 border-slate-300 rounded text-sm font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Folder ini akan jadi PARENT. Sistem auto-create subfolder "{trip.kode_trip || trip.id} - {trip.name}" di dalamnya.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSetup}
              disabled={pending || !folderInput.trim()}
              className="w-full px-4 py-2.5 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? '⏳ Setting up...' : '🔗 Link & Auto-Create Subfolder'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase">Drive Folder Trip</p>
                <a href={folderUrl} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-semibold inline-flex items-center gap-1">
                  ↗ Buka di Google Drive
                </a>
                <p className="text-[10px] text-slate-400 mt-1 font-mono break-all">
                  ID: {trip.visa_drive_trip_folder_id}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase">Last Sync</p>
                <p className="text-slate-800 font-semibold">{fmtDateTime(lastSync)}</p>
                {lastSync && <p className="text-[10px] text-slate-500">{timeAgo(lastSync)}</p>}
              </div>
            </div>

            <div className="bg-slate-50 rounded p-2 text-xs text-slate-600">
              <p className="font-bold mb-1">📁 Struktur folder di Drive:</p>
              <pre className="text-[11px] bg-white p-2 rounded border border-slate-200">{`Visa Documents TE/
└── ${(trip.kode_trip || trip.id) + ' - ' + (trip.name || 'Trip')}/
    ├── nama_peserta_1/
    │   ├── KTP-ktp.jpg
    │   ├── Passport-passport.pdf
    │   └── ...
    ├── nama_peserta_2/
    │   └── ...
`}</pre>
            </div>

            <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSync}
                disabled={pending}
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? '⏳ Syncing...' : '🔄 Sync All Docs to Drive'}
              </button>
              <a
                href={folderUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded bg-blue-100 text-blue-700 text-sm font-bold hover:bg-blue-200 inline-flex items-center gap-1"
              >
                ↗ Open Drive Folder
              </a>
              <button
                type="button"
                onClick={handleUnlink}
                disabled={pending}
                className="px-3 py-2 rounded bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 disabled:opacity-50"
              >
                🔗 Unlink
              </button>
            </div>

            <p className="text-[10px] text-slate-500 italic">
              ℹ Sync = upload semua dokumen di Supabase storage ke Drive. File yg udah ke-sync (ada drive_file_id) akan di-skip biar gak duplicate.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
