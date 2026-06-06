'use client';

// R217: BackupSheetPanel FIX — handle error di refreshStatus (loading stuck issue)
// FIX: try-catch + fallback status + show error message
// SEMUA fitur existing UTUH (link existing, create, sync, unlink, test connection)
// Path: components/trip/BackupSheetPanel.jsx

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createBackupSheet,
  syncTripToSheet,
  unlinkSheet,
  getSheetStatus,
  testSheetConnection,
  linkExistingSheet,
} from '@/lib/actions/sheet-sync';

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

export default function BackupSheetPanel({ tripId, initialStatus = null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [loadError, setLoadError] = useState(null); // R217: track load error
  const [msg, setMsg] = useState(null);
  const [diag, setDiag] = useState(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [mode, setMode] = useState('link');

  useEffect(() => {
    if (!initialStatus) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // R217 FIX: try-catch — kalau error, set fallback status + show error
  async function refreshStatus() {
    setLoadError(null);
    try {
      const s = await getSheetStatus(tripId);
      if (!s) {
        setStatus({ has_sheet: false, sa_email: 'unknown' });
        setLoadError('Server action gak return data — kemungkinan env Google Sheets belum di-set');
        return;
      }
      setStatus(s);
    } catch (e) {
      const errMsg = e?.message || String(e);
      console.error('[BackupSheetPanel] getSheetStatus error:', errMsg);
      setStatus({ has_sheet: false, sa_email: 'error' });
      setLoadError(errMsg);
    }
  }

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 8000);
  }

  function handleTestConnection() {
    setDiag(null);
    startTransition(async () => {
      try {
        const r = await testSheetConnection();
        setDiag(r);
        if (r.ok && r.auth_ok) showMsg('✓ Connection test sukses');
        else showMsg('Test gagal: ' + (r.error || r.auth_error || 'unknown'), 'error');
      } catch (e) {
        showMsg('Test connection error: ' + (e?.message || e), 'error');
      }
    });
  }

  function handleLinkExisting() {
    if (!linkUrl.trim()) { showMsg('Paste URL Sheet dulu', 'error'); return; }
    startTransition(async () => {
      try {
        const r = await linkExistingSheet(tripId, linkUrl.trim());
        if (r.error) showMsg(r.error, 'error');
        else {
          showMsg('✓ Sheet ter-link & data ter-sync!');
          setLinkUrl('');
          await refreshStatus();
          router.refresh();
        }
      } catch (e) {
        showMsg('Link error: ' + (e?.message || e), 'error');
      }
    });
  }

  function handleCreate() {
    if (!confirm('Coba bikin sheet baru? (kalau ada org policy permission denied, pakai LINK EXISTING aja).')) return;
    startTransition(async () => {
      try {
        const r = await createBackupSheet(tripId);
        if (r.error) showMsg(r.error + '\n\n💡 Workaround: bikin sheet manual di Drive kamu, share ke service account, paste URL-nya di kolom "Link Existing".', 'error');
        else {
          showMsg('✓ Sheet dibuat & data ter-sync!');
          await refreshStatus();
          router.refresh();
        }
      } catch (e) {
        showMsg('Create error: ' + (e?.message || e), 'error');
      }
    });
  }

  function handleSync() {
    startTransition(async () => {
      try {
        const r = await syncTripToSheet(tripId);
        if (r.error) showMsg(r.error, 'error');
        else {
          showMsg(`✓ Sync sukses: ${r.counts?.peserta || 0} peserta, ${r.counts?.payment || 0} payment, ${r.counts?.hpp || 0} HPP`);
          await refreshStatus();
          router.refresh();
        }
      } catch (e) {
        showMsg('Sync error: ' + (e?.message || e), 'error');
      }
    });
  }

  function handleUnlink() {
    if (!confirm('Unlink Sheet? Sheet di Drive TIDAK dihapus.')) return;
    startTransition(async () => {
      try {
        const r = await unlinkSheet(tripId);
        if (r.error) showMsg(r.error, 'error');
        else {
          showMsg('✓ Sheet di-unlink');
          await refreshStatus();
          router.refresh();
        }
      } catch (e) {
        showMsg('Unlink error: ' + (e?.message || e), 'error');
      }
    });
  }

  // R217 FIX: loading state — show error kalau ada, plus retry button
  if (!status) {
    return (
      <div className="bg-white rounded-xl border-2 border-green-200 p-4">
        {loadError ? (
          <div className="space-y-2">
            <p className="text-sm font-bold text-red-700">⚠ Gagal load sheet status</p>
            <p className="text-xs text-slate-700 font-mono bg-red-50 p-2 rounded border border-red-200">{loadError}</p>
            <button
              onClick={refreshStatus}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white font-semibold rounded hover:bg-blue-700"
            >
              🔄 Retry
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-slate-500">⏳ Loading sheet status...</p>
            <button
              onClick={refreshStatus}
              className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  const hasSheet = status.has_sheet;
  const lastSync = status.last_sync_at;
  const lastError = status.last_error;

  return (
    <div className="bg-white rounded-xl border-2 border-green-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-green-50 border-green-200 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-green-800 flex items-center gap-2">
            <span>📊</span> Google Sheet Backup
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Backup data trip ke Google Sheet
          </p>
        </div>
        <button onClick={handleTestConnection} disabled={pending}
          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 disabled:opacity-50">
          🔍 Test Connection
        </button>
      </div>

      {/* R217: show load error warning kalau ada (non-fatal) */}
      {loadError && (
        <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800">
          ⚠ Status loaded with error: {loadError}
        </div>
      )}

      {msg && (
        <div className={`px-5 py-2 text-sm border-b whitespace-pre-line ${
          msg.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {msg.text}
        </div>
      )}

      {diag && (
        <div className="px-5 py-3 border-b bg-slate-50 text-xs space-y-1 font-mono">
          <p className="font-bold text-slate-700">🔍 Diagnostic Result:</p>
          <p>project_id: <b>{diag.project_id}</b></p>
          <p>client_email: <b className="break-all">{diag.client_email}</b></p>
          <p>private_key OK: <b>{diag.private_key_has_newlines ? '✓ YES' : '✗ NO'}</b></p>
          <p>auth_ok: <b className={diag.auth_ok ? 'text-green-700' : 'text-red-700'}>{String(diag.auth_ok)}</b></p>
          {diag.authenticated_as && <p>authenticated_as: <b className="break-all">{diag.authenticated_as}</b></p>}
          {diag.auth_error && <p className="text-red-700">auth_error: {diag.auth_error}</p>}
        </div>
      )}

      <div className="p-5">
        {!hasSheet ? (
          <div className="space-y-4">
            <div className="flex gap-2 border-b border-slate-200 pb-2">
              <button onClick={() => setMode('link')}
                className={`px-3 py-1.5 text-xs font-bold rounded ${mode === 'link' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                🔗 LINK SHEET (Recommended)
              </button>
              <button onClick={() => setMode('create')}
                className={`px-3 py-1.5 text-xs font-bold rounded ${mode === 'create' ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                ➕ BUAT BARU (kalau bisa)
              </button>
            </div>

            {mode === 'link' ? (
              <div className="space-y-3">
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-2">
                  <p className="font-bold">📋 Cara pakai (RECOMMENDED — bypass permission issue):</p>
                  <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li>Buka <a href="https://sheets.google.com" target="_blank" rel="noreferrer" className="underline font-bold">sheets.google.com</a></li>
                    <li>Klik <b>+ Blank</b> buat bikin sheet kosong baru</li>
                    <li>Rename jadi: <code className="bg-blue-100 px-1">TEONE Backup — [trip name]</code></li>
                    <li>Klik tombol <b>Share</b> (kanan atas)</li>
                    <li>Tambah email service account ini sebagai <b>Editor</b>:
                      <div className="mt-1 p-1.5 bg-white rounded font-mono break-all border border-blue-300">
                        {status.sa_email || '(belum di-set)'}
                      </div>
                    </li>
                    <li>Klik <b>Send</b></li>
                    <li>Copy URL dari address bar browser, paste ke kolom di bawah</li>
                  </ol>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    URL Google Sheet:
                  </label>
                  <input
                    type="text"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit..."
                    className="w-full px-3 py-2 border-2 border-slate-300 rounded text-sm font-mono focus:border-green-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleLinkExisting}
                  disabled={pending || !linkUrl.trim()}
                  className="w-full px-4 py-2.5 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50">
                  {pending ? '⏳ Verifying & syncing...' : '🔗 Link & Sync Sekarang'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                  ⚠ Mode ini coba bikin sheet baru di Drive service account. Kalau ada org policy "Permission denied", pakai mode LINK SHEET aja.
                </div>
                <p className="text-xs text-slate-600">Service Account: <code className="bg-slate-100 px-1">{status.sa_email}</code></p>
                <button onClick={handleCreate} disabled={pending}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50">
                  {pending ? '⏳ Membuat...' : '📊 Coba Buat Sheet Baru'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase">Sheet</p>
                <a href={status.sheet_url} target="_blank" rel="noreferrer"
                  className="text-green-700 hover:underline font-semibold inline-flex items-center gap-1">
                  ↗ Buka di Google Sheets
                </a>
                <p className="text-[10px] text-slate-400 mt-1 font-mono break-all">ID: {status.sheet_id}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase">Last Sync</p>
                <p className="text-slate-800 font-semibold">{fmtDateTime(lastSync)}</p>
                {lastSync && <p className="text-[10px] text-slate-500">{timeAgo(lastSync)}</p>}
              </div>
            </div>

            {lastError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                ⚠ Last error: {lastError}
              </div>
            )}

            <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
              <button onClick={handleSync} disabled={pending}
                className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {pending ? '⏳' : '🔄 Sync Sekarang'}
              </button>
              <a href={status.sheet_url} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 rounded bg-blue-100 text-blue-700 text-sm font-semibold hover:bg-blue-200">
                ↗ Buka Sheet
              </a>
              <button onClick={handleUnlink} disabled={pending}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 disabled:opacity-50">
                🔗 Unlink
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
