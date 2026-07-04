'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const STATE_BADGE = {
  read:      { label: '✓✓ Dibaca',   cls: 'bg-blue-100 text-blue-700' },
  delivered: { label: '✓✓ Sampai',   cls: 'bg-emerald-100 text-emerald-700' },
  sent:      { label: '✓ Terkirim',  cls: 'bg-slate-100 text-slate-600' },
  pending:   { label: '⏳ Pending',   cls: 'bg-amber-100 text-amber-700' },
  failed:    { label: '✕ Gagal',      cls: 'bg-red-100 text-red-700' },
};

function fmtTime(t) {
  try { return new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return t; }
}

export default function WaHistoryView({ rows = [] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [fState, setFState] = useState('all');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fState !== 'all' && (r.state || 'pending') !== fState) return false;
      if (!s) return true;
      return (r.target_phone || '').toLowerCase().includes(s)
        || (r.contact_name || '').toLowerCase().includes(s)
        || (r.message || '').toLowerCase().includes(s)
        || (r.context || '').toLowerCase().includes(s)
        || (r.sender || '').toLowerCase().includes(s);
    });
  }, [rows, q, fState]);

  const counts = useMemo(() => {
    const c = { read: 0, delivered: 0, sent: 0, pending: 0, failed: 0 };
    for (const r of rows) c[r.state || 'pending'] = (c[r.state || 'pending'] || 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">💬 History WA</h1>
          <p className="text-sm text-slate-500">Semua pesan WhatsApp keluar & status pengiriman. Cek apakah chat sampai ke peserta.</p>
        </div>
        <button onClick={() => router.refresh()} className="px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-semibold">↻ Refresh</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nomor / nama / isi pesan…"
          className="flex-1 min-w-[220px] px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        <select value={fState} onChange={(e) => setFState(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
          <option value="all">Semua status ({rows.length})</option>
          <option value="read">Dibaca ({counts.read})</option>
          <option value="delivered">Sampai ({counts.delivered})</option>
          <option value="sent">Terkirim ({counts.sent})</option>
          <option value="pending">Pending ({counts.pending})</option>
          <option value="failed">Gagal ({counts.failed})</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Waktu</th>
              <th className="px-3 py-2 text-left">Tujuan</th>
              <th className="px-3 py-2 text-left">Konteks</th>
              <th className="px-3 py-2 text-left">Dikirim dari</th>
              <th className="px-3 py-2 text-left">Isi pesan</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((r) => {
              const b = STATE_BADGE[r.state || 'pending'] || STATE_BADGE.pending;
              return (
                <tr key={r.id} className="hover:bg-slate-50 align-top">
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{fmtTime(r.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-semibold text-slate-800 text-xs">{r.contact_name || '—'}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{r.target_phone || '-'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{r.context || '-'}{r.kind ? ` · ${r.kind}` : ''}</td>
                  <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap font-medium">{r.sender || '—'}</td>
                  <td className="px-3 py-2 text-xs text-slate-700 max-w-[360px]"><div className="line-clamp-3 whitespace-pre-wrap">{r.message || ''}</div></td>
                  <td className="px-3 py-2 text-center whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${b.cls}`}>{b.label}</span>
                    {r.status === 'failed' && r.reason && <div className="text-[10px] text-red-500 mt-0.5 max-w-[140px] truncate" title={r.reason}>{r.reason}</div>}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">Belum ada pesan cocok.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">Status: ⏳ Pending (belum konfirmasi WA) · ✓ Terkirim ke server · ✓✓ Sampai HP · ✓✓ Dibaca · ✕ Gagal (nomor bermasalah). Update otomatis dari Fonnte.</p>
    </div>
  );
}
