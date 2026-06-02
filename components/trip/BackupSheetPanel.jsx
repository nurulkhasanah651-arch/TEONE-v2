'use client';

// Round 189 Fase 1: Backup Sheet panel di trip detail
// Path: components/trip/BackupSheetPanel.jsx

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  createBackupSheet,
  syncTripToSheet,
  unlinkSheet,
  getSheetStatus,
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

  useEffect(() => {
    if (!initialStatus) {
      refreshStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStatus() {
    const s = await getSheetStatus(tripId);
    setStatus(s);
  }

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 5000);
  }

  function handleCreate() {
    if (!confirm('Buat Google Sheet backup untuk trip ini?\n\nSheet akan punya 5 tab: Peserta, Passport, Payment, HPP, Summary.\nData TEONE akan di-copy ke Sheet, dan ke-update tiap kali kamu klik "Sync Now".')) return;
    startTransition(async () => {
      const r = await createBackupSheet(tripId);
      if (r.error) {
        showMsg(r.error, 'error');
      } else {
        showMsg('✓ Sheet berhasil dibuat & data ter-sync!' + (r.warning ? ' (' + r.warning + ')' : ''));
        await refreshStatus();
        router.refresh();
      }
    });
  }

  function handleSync() {
    startTransition(async () => {
      const r = await syncTripToSheet(tripId);
      if (r.error) {
        showMsg(r.error, 'error');
      } else {
        showMsg(`✓ Sync sukses: ${r.counts?.peserta || 0} peserta, ${r.counts?.payment || 0} payment, ${r.counts?.hpp || 0} HPP item`);
        await refreshStatus();
        router.refresh();
      }
    });
  }

  function handleUnlink() {
    if (!confirm('Unlink Sheet?\n\nSheet di Google Drive TIDAK akan dihapus, tapi TEONE gak akan tracking lagi.\nKamu bisa Buat Backup Sheet baru setelah unlink.')) return;
    startTransition(async () => {
      const r = await unlinkSheet(tripId);
      if (r.error) showMsg(r.error, 'error');
      else {
        showMsg('✓ Sheet di-unlink dari trip ini');
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
      <div className="px-5 py-3 border-b bg-green-50 border-green-200">
        <h2 className="font-bold text-green-800 flex items-center gap-2">
          <span>📊</span> Google Sheet Backup
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Backup data trip ke Google Sheet — kalau TEONE crash, kerjaan tetep ada di sini
        </p>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-sm border-b ${
          msg.type === 'error'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="p-5">
        {!hasSheet ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Trip ini belum punya backup Sheet. Klik tombol di bawah buat bikin Sheet baru di Google Drive.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-1">
              <p className="font-bold">Yang akan dibuat:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>1 Google Sheet di drive service account TEONE</li>
                <li>Tab: 📋 Peserta, 📕 Passport, 💰 Payment, 💸 HPP, 📊 Summary</li>
                <li>Sheet bisa diakses lewat link (anyone with link can view)</li>
                <li>Auto-share ke service account: <code className="bg-blue-100 px-1 rounded">{status.sa_email || '(belum di-set)'}</code></li>
              </ul>
            </div>
            <button
              onClick={handleCreate}
              disabled={pending}
              className="px-4 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {pending ? '⏳ Membuat Sheet...' : '📊 Buat Backup Sheet'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase">Sheet</p>
                <a
                  href={status.sheet_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-green-700 hover:underline font-semibold inline-flex items-center gap-1"
                >
                  ↗ Buka di Google Sheets
                </a>
                <p className="text-[10px] text-slate-400 mt-1 font-mono break-all">
                  ID: {status.sheet_id}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase">Last Sync</p>
                <p className="text-slate-800 font-semibold">{fmtDateTime(lastSync)}</p>
                {lastSync && (
                  <p className="text-[10px] text-slate-500">{timeAgo(lastSync)}</p>
                )}
              </div>
            </div>

            {lastError && (
              <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                ⚠ <b>Last sync error:</b> {lastError}
              </div>
            )}

            <div className="flex gap-2 flex-wrap pt-2 border-t border-slate-100">
              <button
                onClick={handleSync}
                disabled={pending}
                className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {pending ? '⏳ Sync...' : '🔄 Sync Sekarang'}
              </button>
              <a
                href={status.sheet_url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded bg-blue-100 text-blue-700 text-sm font-semibold hover:bg-blue-200"
              >
                ↗ Buka Sheet
              </a>
              <button
                onClick={handleUnlink}
                disabled={pending}
                className="px-3 py-1.5 rounded bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 disabled:opacity-50"
              >
                🔗 Unlink
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-[11px] text-amber-800">
              ⚠ <b>Fase 1 — 1-arah sync:</b> Edit di Sheet akan di-overwrite tiap sync. Edit data hanya di TEONE.
              Fase 2 (2-arah sync) akan ditambahin setelah Fase 1 stabil.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
