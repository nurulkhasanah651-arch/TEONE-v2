'use client';

// R196: Accounting Sheet Backup Panel — link URL + sync ke Sheet
// Path: components/accounting/AccountingSheetPanel.jsx

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  linkAccountingSheet,
  syncAccountingToSheet,
  unlinkAccountingSheet,
  getAccountingSheetStatus,
} from '@/lib/actions/accounting-sheet';

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

export default function AccountingSheetPanel({ initialStatus = null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [msg, setMsg] = useState(null);
  const [linkUrl, setLinkUrl] = useState('');

  useEffect(() => {
    if (!initialStatus) refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshStatus() {
    const s = await getAccountingSheetStatus();
    setStatus(s);
  }

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 6000);
  }

  function handleLink() {
    if (!linkUrl.trim()) { showMsg('Paste URL Sheet dulu', 'error'); return; }
    startTransition(async () => {
      const r = await linkAccountingSheet(linkUrl.trim());
      if (r.error) showMsg(r.error, 'error');
      else {
        showMsg('✓ Sheet ter-link & data ter-sync!');
        setLinkUrl('');
        await refreshStatus();
        router.refresh();
      }
    });
  }

  function handleSync() {
    startTransition(async () => {
      const r = await syncAccountingToSheet();
      if (r.error) showMsg(r.error, 'error');
      else {
        showMsg(`✓ Sync sukses: ${r.counts?.cash_in_rows || 0} cash in, ${r.counts?.cash_out_rows || 0} cash out, ${r.counts?.months || 0} bulan`);
        await refreshStatus();
        router.refresh();
      }
    });
  }

  function handleUnlink() {
    if (!confirm('Unlink Sheet?\nSheet di Drive TIDAK dihapus, cuma TEONE gak tracking lagi.')) return;
    startTransition(async () => {
      const r = await unlinkAccountingSheet();
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
      <div className="px-5 py-3 border-b bg-green-50 border-green-200">
        <h2 className="font-bold text-green-800 flex items-center gap-2">
          <span>📊</span> Accounting → Google Sheet
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Cash In Monthly · Cash Out Monthly · Monthly Report — auto-sync ke Sheet
        </p>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-sm border-b whitespace-pre-line ${
          msg.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {msg.text}
        </div>
      )}

      <div className="p-5">
        {!hasSheet ? (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-800 space-y-2">
              <p className="font-bold">📋 Setup (sekali doang):</p>
              <ol className="list-decimal list-inside space-y-1 ml-1">
                <li>Buka <a href="https://sheets.google.com" target="_blank" rel="noreferrer" className="underline font-bold">sheets.google.com</a></li>
                <li>Klik <b>+ Blank</b> bikin sheet kosong</li>
                <li>Rename jadi: <code className="bg-blue-100 px-1">TEONE Accounting Report</code></li>
                <li>Klik <b>Share</b> (kanan atas)</li>
                <li>Tambah email service account ini sebagai <b>Editor</b>:
                  <div className="mt-1 p-1.5 bg-white rounded font-mono break-all border border-blue-300">
                    {status.sa_email || '(belum di-set)'}
                  </div>
                </li>
                <li>Klik <b>Send</b></li>
                <li>Copy URL → paste ke kolom di bawah</li>
              </ol>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">URL Google Sheet:</label>
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit..."
                className="w-full px-3 py-2 border-2 border-slate-300 rounded text-sm font-mono focus:border-green-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleLink}
              disabled={pending || !linkUrl.trim()}
              className="w-full px-4 py-2.5 rounded-lg bg-green-600 text-white font-bold hover:bg-green-700 disabled:opacity-50"
            >
              {pending ? '⏳ Verifying & syncing...' : '🔗 Link & Sync Sekarang'}
            </button>
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

            <div className="bg-slate-50 rounded p-2 text-xs text-slate-600">
              <p className="font-bold mb-1">Tab di Sheet:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>💰 <b>Cash In Monthly</b> — payment peserta + manual income, per bulan</li>
                <li>💸 <b>Cash Out Monthly</b> — HPP lunas + manual expense, per bulan</li>
                <li>📊 <b>Monthly Report</b> — net cash flow per bulan + grand total</li>
              </ul>
            </div>

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
