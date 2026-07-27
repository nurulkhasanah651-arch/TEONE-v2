'use client';

// Payment Visa — tabel pembayaran apply visa per peserta (Accounting).
// Nama & Status = otomatis (read-only). Field pembayaran bisa diedit & disimpan.
// Path: components/accounting/PaymentVisaTable.jsx

import { useMemo, useState, useTransition } from 'react';
import { saveVisaApplyPayment } from '@/lib/actions/visa-payment';
import { STATUS_COLOR_CLASS } from '@/lib/utils/visa-constants';

const rupiah = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

export default function PaymentVisaTable({ rows = [] }) {
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [limit, setLimit] = useState(150);
  const [edits, setEdits] = useState({});   // passengerId -> partial fields
  const [savedMsg, setSavedMsg] = useState({});
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState(null);

  const months = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (r.monthKey) m.set(r.monthKey, r.monthLabel);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, label]) => ({ key, label }));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (month && r.monthKey !== month) return false;
      if (term && !(`${r.kode} ${r.tripName} ${r.nama}`.toLowerCase().includes(term))) return false;
      return true;
    });
  }, [rows, q, month]);

  const shown = filtered.slice(0, limit);
  const val = (r, f) => (edits[r.passengerId]?.[f] !== undefined ? edits[r.passengerId][f] : r[f]);
  const setVal = (pid, f, v) => setEdits((e) => ({ ...e, [pid]: { ...e[pid], [f]: v } }));
  const rowTotal = (r) => (Number(val(r, 'fee_embassy_amount')) || 0) + (Number(val(r, 'fee_tls_amount')) || 0);

  const grandTotal = filtered.reduce((s, r) => s + rowTotal(r), 0);

  function save(r) {
    setSavingId(r.passengerId);
    const payload = {
      embassy: val(r, 'embassy'), fee_embassy_amount: val(r, 'fee_embassy_amount'), fee_embassy_pic: val(r, 'fee_embassy_pic'),
      fee_tls_amount: val(r, 'fee_tls_amount'), fee_tls_pic: val(r, 'fee_tls_pic'),
      tgl_transfer: val(r, 'tgl_transfer'), pic_transfer: val(r, 'pic_transfer'),
    };
    start(async () => {
      const res = await saveVisaApplyPayment(r.passengerId, payload);
      setSavingId(null);
      setSavedMsg((m) => ({ ...m, [r.passengerId]: res?.error ? `⚠ ${res.error}` : '✓ Tersimpan' }));
      setTimeout(() => setSavedMsg((m) => ({ ...m, [r.passengerId]: '' })), 2500);
    });
  }

  const inp = 'w-full px-1.5 py-1 border border-slate-300 rounded text-xs';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari trip / nama…" className="px-3 py-1.5 border border-slate-300 rounded text-sm min-w-[200px]" />
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded text-sm">
            <option value="">Semua bulan</option>
            {months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {(q || month) && <button onClick={() => { setQ(''); setMonth(''); }} className="text-xs px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200">Reset</button>}
        </div>
        <div className="text-sm text-slate-600">
          {filtered.length} peserta · Total fee visa: <b className="text-brand-700">{rupiah(grandTotal)}</b>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-left text-[11px] font-bold text-slate-600 uppercase">
            <tr>
              <th className="px-2 py-2">Trip</th>
              <th className="px-2 py-2">Nama</th>
              <th className="px-2 py-2">Status Visa</th>
              <th className="px-2 py-2">Embassy</th>
              <th className="px-2 py-2">Fee Embassy</th>
              <th className="px-2 py-2">PIC</th>
              <th className="px-2 py-2">Fee TLS/VFS</th>
              <th className="px-2 py-2">PIC</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2">Tgl Transfer</th>
              <th className="px-2 py-2">PIC Transfer</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => (
              <tr key={r.passengerId} className="hover:bg-slate-50 align-top">
                <td className="px-2 py-1.5 whitespace-nowrap"><span className="font-mono font-bold text-brand-700">{r.kode}</span></td>
                <td className="px-2 py-1.5 font-semibold text-slate-800 min-w-[140px]">{r.nama}</td>
                <td className="px-2 py-1.5"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${STATUS_COLOR_CLASS[r.statusColor] || 'bg-slate-100 text-slate-700'}`}>{r.statusLabel}</span></td>
                <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} value={val(r, 'embassy') || ''} onChange={(e) => setVal(r.passengerId, 'embassy', e.target.value)} placeholder="Negara/kedutaan" /></td>
                <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} inputMode="numeric" value={val(r, 'fee_embassy_amount') || ''} onChange={(e) => setVal(r.passengerId, 'fee_embassy_amount', e.target.value)} placeholder="0" /></td>
                <td className="px-2 py-1.5 min-w-[80px]"><input className={inp} value={val(r, 'fee_embassy_pic') || ''} onChange={(e) => setVal(r.passengerId, 'fee_embassy_pic', e.target.value)} /></td>
                <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} inputMode="numeric" value={val(r, 'fee_tls_amount') || ''} onChange={(e) => setVal(r.passengerId, 'fee_tls_amount', e.target.value)} placeholder="0" /></td>
                <td className="px-2 py-1.5 min-w-[80px]"><input className={inp} value={val(r, 'fee_tls_pic') || ''} onChange={(e) => setVal(r.passengerId, 'fee_tls_pic', e.target.value)} /></td>
                <td className="px-2 py-1.5 text-right font-bold text-slate-800 whitespace-nowrap">{rupiah(rowTotal(r))}</td>
                <td className="px-2 py-1.5 min-w-[120px]"><input type="date" className={inp} value={val(r, 'tgl_transfer') || ''} onChange={(e) => setVal(r.passengerId, 'tgl_transfer', e.target.value)} /></td>
                <td className="px-2 py-1.5 min-w-[80px]"><input className={inp} value={val(r, 'pic_transfer') || ''} onChange={(e) => setVal(r.passengerId, 'pic_transfer', e.target.value)} /></td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <button onClick={() => save(r)} disabled={pending && savingId === r.passengerId} className="text-[11px] px-2 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white font-semibold disabled:opacity-50">
                    {pending && savingId === r.passengerId ? '…' : 'Simpan'}
                  </button>
                  {savedMsg[r.passengerId] && <span className={`ml-1 text-[10px] ${savedMsg[r.passengerId].startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{savedMsg[r.passengerId]}</span>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-500">Tidak ada peserta cocok filter.</td></tr>}
          </tbody>
        </table>
      </div>

      {shown.length < filtered.length && (
        <div className="text-center">
          <button onClick={() => setLimit((n) => n + 200)} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700">
            Muat lebih banyak ({filtered.length - shown.length} lagi)
          </button>
        </div>
      )}
    </div>
  );
}
