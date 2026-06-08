'use client';

// R215z: Passport Drive Sync Panel
// Path: components/passport/PassportDriveSyncPanel.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  setPassportDriveFolder,
  syncTripPassportsToDrive,
  unlinkPassportDriveFolder,
} from '@/lib/actions/passport-drive-sync';

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

export default function PassportDriveSyncPanel({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [folderInput, setFolderInput] = useState('');
  const [syncResult, setSyncResult] = useState(null);

  const hasSetup = !!trip?.passport_drive_trip_folder_id;
  const folderUrl = trip?.passport_drive_trip_folder_url;
  const lastSync = trip?.passport_drive_last_sync_at;

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 6000);
  }

  function handleSetup() {
    if (!folderInput.trim()) { showMsg('Paste URL/ID folder Drive dulu', 'error'); return; }
    startTransition(async () => {
      const r = await setPassportDriveFolder(trip.id, folderInput.trim());
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(`✓ Passport Drive folder ter-link!`);
      setFolderInput('');
      router.refresh();
    });
  }

  function handleSync() {
    setSyncResult(null);
    startTransition(async () => {
      const r = await syncTripPassportsToDrive(trip.id);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      setSyncResult(r);
      if (r.message) showMsg(r.message);
      else if (r.errors > 0) {
        showMsg(`⚠ Sync partial: ${r.synced} sukses, ${r.errors} gagal. Cek detail di bawah.`, 'error');
      } else {
        showMsg(`✓ Sync sukses: ${r.synced} passport di-upload, ${r.skipped} skipped`);
      }
      router.refresh();
    });
  }

  function handleUnlink() {
    if (!confirm('Unlink Passport Drive folder?\nFile di Drive TIDAK dihapus.')) return;
    startTransition(async () => {
      const r = await unlinkPassportDriveFolder(trip.id);
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg('✓ Unlinked'); router.refresh(); }
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-orange-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-200">
        <h2 className="font-bold text-orange-800 flex items-center gap-2">
          <span>📕</span> Passport Scan → Google Drive Sync
        </h2>
        <p className="text-[11px] text-slate-600 mt-0.5">
          Auto-upload passport scan peserta ke Google Drive, folder per peserta
        </p>
      </div>

      {msg && (
        <div className={`px-5 py-3 text-sm border-b flex items-start justify-between gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-800 border-red-200 font-medium' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          <span className="flex-1">{msg.text}</span>
          {msg.type === 'error' && <button type="button" onClick={() => setMsg(null)} className="text-xs px-2 py-0.5 bg-white border border-red-300 rounded">✕</button>}
        </div>
      )}

      <div className="p-5">
        {!hasSetup ? (
          <div className="space-y-3">
            <div className="bg-orange-50 border border-orange-200 rounded p-3 text-xs text-orange-800 space-y-2">
              <p className="font-bold">📋 Setup (sekali doang per trip):</p>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Pakai Shared Drive yg sama dgn visa & payment (e.g. "tes 2")</li>
                <li>Service account TE harus jadi Manager/Content Manager di Shared Drive ROOT</li>
                <li>Copy URL Shared Drive → paste di bawah</li>
              </ol>
              <p className="text-[10px] mt-2 italic">
                ℹ TEONE auto-create subfolder "PASSPORTS" terpisah dari VISA & PAYMENTS
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">URL/ID Shared Drive Folder:</label>
              <input autoComplete="off"
                type="text"
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/0AXXXXXXX"
                className="w-full px-3 py-2 border-2 border-slate-300 rounded text-sm font-mono"
              />
            </div>

            <button
              type="button"
              onClick={handleSetup}
              disabled={pending || !folderInput.trim()}
              className="w-full px-4 py-2.5 rounded-lg bg-orange-600 text-white font-bold hover:bg-orange-700 disabled:opacity-50"
            >
              {pending ? '⏳ Setting up...' : '🔗 Link & Auto-Create Passport Subfolder'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase">Passport Drive Folder</p>
                <a href={folderUrl} target="_blank" rel="noreferrer" className="text-orange-700 hover:underline font-semibold inline-flex items-center gap-1">
                  ↗ Buka di Google Drive
                </a>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase">Last Sync</p>
                <p className="text-slate-800 font-semibold">{fmtDateTime(lastSync)}</p>
                {lastSync && <p className="text-[10px] text-slate-500">{timeAgo(lastSync)}</p>}
              </div>
            </div>

            <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSync}
                disabled={pending}
                className="px-4 py-2 rounded bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 disabled:opacity-50"
              >
                {pending ? '⏳ Syncing...' : '🔄 Sync All Passports to Drive'}
              </button>
              <a
                href={folderUrl}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 rounded bg-orange-100 text-orange-700 text-sm font-bold hover:bg-orange-200"
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

            {syncResult && (
              <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded text-xs">
                <p className="font-bold text-slate-700 mb-2">📊 Sync Result:</p>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div className="p-2 bg-emerald-100 rounded text-center">
                    <p className="text-[10px] font-bold text-emerald-700">✓ Synced</p>
                    <p className="font-bold text-emerald-800">{syncResult.synced}</p>
                  </div>
                  <div className="p-2 bg-slate-100 rounded text-center">
                    <p className="text-[10px] font-bold text-slate-600">⊝ Skipped</p>
                    <p className="font-bold text-slate-700">{syncResult.skipped}</p>
                  </div>
                  <div className={`p-2 rounded text-center ${syncResult.errors > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
                    <p className={`text-[10px] font-bold ${syncResult.errors > 0 ? 'text-red-700' : 'text-slate-600'}`}>✕ Errors</p>
                    <p className={`font-bold ${syncResult.errors > 0 ? 'text-red-800' : 'text-slate-700'}`}>{syncResult.errors}</p>
                  </div>
                </div>

                {syncResult.success_details?.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold text-emerald-700">✓ {syncResult.success_details.length} passport ter-upload</summary>
                    <ul className="mt-1 ml-4 list-disc text-[11px] text-slate-600">
                      {syncResult.success_details.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </details>
                )}

                {syncResult.error_details?.length > 0 && (
                  <details className="mt-2" open>
                    <summary className="cursor-pointer font-bold text-red-700">⚠ {syncResult.error_details.length} error detail</summary>
                    <ul className="mt-1 ml-4 list-disc text-[11px] text-red-700 bg-red-50 p-2 rounded">
                      {syncResult.error_details.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <p className="text-[10px] text-slate-500 italic">
              ℹ Passport scan harus udah ter-upload via Passport AI / form input. Drive sync cuma copy existing file ke Drive.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
