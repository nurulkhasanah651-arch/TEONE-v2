'use client';

// Round 189b: BackupSheetPanel — tambah tombol "Test Connection" buat diagnose
// Path: components/trip/BackupSheetPanel.jsx

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createBackupSheet,
  syncTripToSheet,
  unlinkSheet,
  getSheetStatus,
  testSheetConnection,
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
  const [msg, setMsg] = useState(null);
  const [diag, setDiag] = useState(null);

  useEffect(() => {
    if (!initialStatus) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStatus() {
    const s = await getSheetStatus(tripId);
    setStatus(s);
  }

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 6000);
  }

  function handleTestConnection() {
    setDiag(null);
    startTransition(async () => {
      const r = await testSheetConnection();
      setDiag(r);
      if (r.ok && r.auth_ok) showMsg('✓ Connection test sukses');
      else showMsg('Test gagal: ' + (r.error || r.auth_error || 'unknown'), 'error');
    });
  }

  function handleCreate() {
    if (!confirm('Buat Google Sheet backup untuk trip ini?')) return;
    startTransition(async () => {
      const r = await createBackupSheet(tripId);
      if (r.error) showMsg(r.error, 'error');
      else {
        showMsg('✓ Sheet berhasil dibuat & data ter-sync!' + (r.warning ? ' (' + r.warning + ')' : ''));
        await refreshStatus();
        router.refresh();
      }
    });
  }

  function handleSync() {
    startTransition(async () => {
      const r = await syncTripToSheet(tripId);
      if (r.error) showMsg(r.error, 'error');
      else {
        showMsg(`✓ Sync sukses: ${r.counts?.peserta || 0} peserta, ${r.counts?.payment || 0} payment, ${r.counts?.hpp || 0} HPP`);
        await refreshStatus();
        router.refresh();
      }
    });
  }

  function handleUnlink() {
    if (!confirm('Unlink Sheet?\nSheet di Drive TIDAK dihapus, cuma TEONE gak tracking lagi.')) return;
    startTransition(async () => {
      const r = await unlinkSheet(tripId);
      if (r.error) showMsg(r.error, 'error');
      else {
        showMsg('✓ Sheet di-unlink');
        await refreshStatus();
        router.refresh();
      }
    });
  }

  if (!status) {
    return (
      <div className="bg-white rounded-xl border-2 border-green-200 p-4">
        <p className="text-sm text-slate-500">Loading sheet status...</p>
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
            Backup data trip ke Google Sheet — kalau TEONE crash, kerjaan tetep ada di sini
          </p>
        </div>
        <button
          onClick={handleTestConnection}
          disabled={pending}
          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 font-semibold hover:bg-blue-200 disabled:opacity-50"
        >
          🔍 Test Connection
        </button>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-sm border-b whitespace-pre-line ${
          msg.type === 'error'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {msg.text}
        </div>
      )}

      {diag && (
        <div className="px-5 py-3 border-b bg-slate-50 text-xs space-y-1 font-mono">
          <p className="font-bold text-slate-700">🔍 Diagnostic Result:</p>
          <p>has_env: <b>{String(diag.has_env || false)}</b></p>
          <p>project_id: <b>{diag.project_id || '(none)'}</b></p>
          <p>client_email: <b>{diag.client_email || '(none)'}</b></p>
          <p>private_key OK: <b>{diag.private_key_has_newlines ? '✓ YES' : '✗ NO (escaped \\n issue)'}</b></p>
          <p>auth_ok: <b className={diag.auth_ok ? 'text-green-700' : 'text-red-700'}>{String(diag.auth_ok)}</b></p>
          {diag.authenticated_as && <p>authenticated_as: <b>{diag.authenticated_as}</b></p>}
          {diag.auth_error && <p className="text-red-700">auth_error: {diag.auth_error}</p>}
          {diag.raw_error && <p className="text-red-700">raw_error: {diag.raw_error}</p>}
        </div>
      )}

      <div className="p-5">
        {!hasSheet ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Trip ini belum punya backup Sheet. Klik tombol di bawah buat bikin Sheet baru.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-1">
              <p className="font-bold">Service Account info:</p>
              <p>Email: <code className="bg-blue-100 px-1 rounded text-[10px] break-all">{status.sa_email || '(belum di-set)'}</code></p>
              {status.project_id && <p>Project: <code className="bg-blue-100 px-1 rounded">{status.project_id}</code></p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleCreate}
                disabled={pending}
                className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {pending ? '⏳ Membuat...' : '📊 Buat Backup Sheet'}
              </button>
            </div>
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
                ⚠ <b>Last error:</b> {lastError}
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
