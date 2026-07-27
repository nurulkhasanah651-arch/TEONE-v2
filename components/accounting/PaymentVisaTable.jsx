'use client';

// Payment Visa — daftar per GRUP TRIP (507, 508, …). Klik trip → baris peserta muncul.
// Nama & Status = otomatis (read-only). Field pembayaran bisa diedit & disimpan.
// Path: components/accounting/PaymentVisaTable.jsx

import { useMemo, useState, useTransition } from 'react';
import { saveVisaApplyPayment } from '@/lib/actions/visa-payment';
import { STATUS_COLOR_CLASS } from '@/lib/utils/visa-constants';

const rupiah = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

export default function PaymentVisaTable({ rows = [] }) {
  const [q, setQ] = useState('');
  const [month, setMonth] = useState('');
  const [openTrip, setOpenTrip] = useState({});   // tripId -> bool
  const [edits, setEdits] = useState({});          // passengerId -> partial fields
  const [savedMsg, setSavedMsg] = useState({});
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState(null);

  const months = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (r.monthKey) m.set(r.monthKey, r.monthLabel);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, label]) => ({ key, label }));
  }, [rows]);

  const val = (r, f) => (edits[r.passengerId]?.[f] !== undefined ? edits[r.passengerId][f] : r[f]);
  const setVal = (pid, f, v) => setEdits((e) => ({ ...e, [pid]: { ...e[pid], [f]: v } }));
  const rowTotal = (r) => (Number(val(r, 'fee_embassy_amount')) || 0) + (Number(val(r, 'fee_tls_amount')) || 0) + (Number(val(r, 'fee_asuransi_amount')) || 0);

  // Grup per trip, dengan filter search + bulan
  const groups = useMemo(() => {
    const term = q.trim().toLowerCase();
    const byTrip = new Map();
    for (const r of rows) {
      if (month && r.monthKey !== month) continue;
      const g = byTrip.get(r.tripId) || { tripId: r.tripId, kode: r.kode, tripName: r.tripName, departure: r.departure, monthKey: r.monthKey, monthLabel: r.monthLabel, rows: [] };
      g.rows.push(r);
      byTrip.set(r.tripId, g);
    }
    let arr = [...byTrip.values()];
    if (term) {
      arr = arr.map((g) => {
        const tripMatch = `${g.kode} ${g.tripName}`.toLowerCase().includes(term);
        if (tripMatch) return g;
        const rr = g.rows.filter((r) => r.nama.toLowerCase().includes(term));
        return rr.length ? { ...g, rows: rr, _forceOpen: true } : null;
      }).filter(Boolean);
    }
    arr.sort((a, b) => String(a.departure || '').localeCompare(String(b.departure || '')));
    return arr;
  }, [rows, q, month]);

  function save(r) {
    setSavingId(r.passengerId);
    const payload = {
      embassy: val(r, 'embassy'), fee_embassy_amount: val(r, 'fee_embassy_amount'), fee_embassy_pic: val(r, 'fee_embassy_pic'),
      fee_tls_amount: val(r, 'fee_tls_amount'), fee_tls_pic: val(r, 'fee_tls_pic'),
      fee_asuransi_amount: val(r, 'fee_asuransi_amount'), fee_asuransi_pic: val(r, 'fee_asuransi_pic'),
      tgl_transfer: val(r, 'tgl_transfer'), pic_transfer: val(r, 'pic_transfer'),
      refund_amount: val(r, 'refund_amount'), refund_date: val(r, 'refund_date'), refund_note: val(r, 'refund_note'),
      norek: val(r, 'norek'), keterangan: val(r, 'keterangan'),
    };
    start(async () => {
      const res = await saveVisaApplyPayment(r.passengerId, payload);
      setSavingId(null);
      setSavedMsg((m) => ({ ...m, [r.passengerId]: res?.error ? `⚠ ${res.error}` : '✓ Tersimpan' }));
      setTimeout(() => setSavedMsg((m) => ({ ...m, [r.passengerId]: '' })), 2500);
    });
  }

  const inp = 'w-full px-1.5 py-1 border border-slate-300 rounded text-xs';
  const grandTotal = groups.reduce((s, g) => s + g.rows.reduce((x, r) => x + rowTotal(r), 0), 0);

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
        <div className="text-sm text-slate-600">{groups.length} trip · Total fee visa: <b className="text-brand-700">{rupiah(grandTotal)}</b></div>
      </div>

      <div className="space-y-2">
        {groups.length === 0 && <div className="bg-white border border-slate-200 rounded-lg p-8 text-center text-slate-500">Tidak ada trip cocok filter.</div>}
        {groups.map((g) => {
          const isOpen = g._forceOpen || openTrip[g.tripId];
          const gTotal = g.rows.reduce((s, r) => s + rowTotal(r), 0);
          const belumDiurus = g.rows.filter((r) => r.statusKey === 'belum_mulai').length;
          const sudahIsi = g.rows.filter((r) => r.saved).length;
          return (
            <div key={g.tripId} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <button onClick={() => setOpenTrip((o) => ({ ...o, [g.tripId]: !o[g.tripId] }))} className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-slate-400">{isOpen ? '▾' : '▸'}</span>
                  <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{g.kode}</span>
                  <span className="font-semibold text-slate-800">{g.tripName}</span>
                  <span className="text-xs text-slate-500">· {g.rows.length} peserta</span>
                  {belumDiurus > 0 && <span className="text-[11px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold">🔴 {belumDiurus} belum diurus</span>}
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="text-sm font-bold text-brand-700">{rupiah(gTotal)}</div>
                  <div className="text-[11px] text-slate-500">terisi {sudahIsi}/{g.rows.length}</div>
                </div>
              </button>

              {isOpen && (
                <div className="overflow-x-auto border-t border-slate-200">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-600 uppercase">
                      <tr>
                        <th className="px-2 py-2">Nama</th>
                        <th className="px-2 py-2">Status Visa</th>
                        <th className="px-2 py-2">Embassy</th>
                        <th className="px-2 py-2">Fee Embassy</th>
                        <th className="px-2 py-2">PIC</th>
                        <th className="px-2 py-2">Fee TLS/VFS</th>
                        <th className="px-2 py-2">PIC</th>
                        <th className="px-2 py-2">Asuransi</th>
                        <th className="px-2 py-2">PIC</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="px-2 py-2">Tgl Transfer</th>
                        <th className="px-2 py-2">PIC Transfer</th>
                        <th className="px-2 py-2">Refund</th>
                        <th className="px-2 py-2">Tgl Refund</th>
                        <th className="px-2 py-2">No Rek</th>
                        <th className="px-2 py-2">Keterangan</th>
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {g.rows.map((r) => (
                        <tr key={r.passengerId} className="hover:bg-slate-50 align-top">
                          <td className="px-2 py-1.5 font-semibold text-slate-800 min-w-[140px]">{r.nama}</td>
                          <td className="px-2 py-1.5"><span className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${STATUS_COLOR_CLASS[r.statusColor] || 'bg-slate-100 text-slate-700'}`}>{r.statusLabel}</span></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} value={val(r, 'embassy') || ''} onChange={(e) => setVal(r.passengerId, 'embassy', e.target.value)} placeholder="Negara/kedutaan" /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} inputMode="numeric" value={val(r, 'fee_embassy_amount') || ''} onChange={(e) => setVal(r.passengerId, 'fee_embassy_amount', e.target.value)} placeholder="0" /></td>
                          <td className="px-2 py-1.5 min-w-[80px]"><input className={inp} value={val(r, 'fee_embassy_pic') || ''} onChange={(e) => setVal(r.passengerId, 'fee_embassy_pic', e.target.value)} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} inputMode="numeric" value={val(r, 'fee_tls_amount') || ''} onChange={(e) => setVal(r.passengerId, 'fee_tls_amount', e.target.value)} placeholder="0" /></td>
                          <td className="px-2 py-1.5 min-w-[80px]"><input className={inp} value={val(r, 'fee_tls_pic') || ''} onChange={(e) => setVal(r.passengerId, 'fee_tls_pic', e.target.value)} /></td>
                          <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} inputMode="numeric" value={val(r, 'fee_asuransi_amount') || ''} onChange={(e) => setVal(r.passengerId, 'fee_asuransi_amount', e.target.value)} placeholder="0" /></td>
                          <td className="px-2 py-1.5 min-w-[80px]"><input className={inp} value={val(r, 'fee_asuransi_pic') || ''} onChange={(e) => setVal(r.passengerId, 'fee_asuransi_pic', e.target.value)} /></td>
                          <td className="px-2 py-1.5 text-right font-bold text-slate-800 whitespace-nowrap">{rupiah(rowTotal(r))}</td>
                          <td className="px-2 py-1.5 min-w-[120px]"><input type="date" className={inp} value={val(r, 'tgl_transfer') || ''} onChange={(e) => setVal(r.passengerId, 'tgl_transfer', e.target.value)} /></td>
                          <td className="px-2 py-1.5 min-w-[80px]"><input className={inp} value={val(r, 'pic_transfer') || ''} onChange={(e) => setVal(r.passengerId, 'pic_transfer', e.target.value)} /></td>
                          <td className="px-2 py-1.5 min-w-[100px]"><input className={inp} inputMode="numeric" value={val(r, 'refund_amount') || ''} onChange={(e) => setVal(r.passengerId, 'refund_amount', e.target.value)} placeholder="0" /></td>
                          <td className="px-2 py-1.5 min-w-[120px]"><input type="date" className={inp} value={val(r, 'refund_date') || ''} onChange={(e) => setVal(r.passengerId, 'refund_date', e.target.value)} /></td>
                          <td className="px-2 py-1.5 min-w-[120px]"><input className={inp} value={val(r, 'norek') || ''} onChange={(e) => setVal(r.passengerId, 'norek', e.target.value)} placeholder="No rek / bank" /></td>
                          <td className="px-2 py-1.5 min-w-[140px]"><input className={inp} value={val(r, 'keterangan') || ''} onChange={(e) => setVal(r.passengerId, 'keterangan', e.target.value)} placeholder="Catatan / refund note" /></td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <button onClick={() => save(r)} disabled={pending && savingId === r.passengerId} className="text-[11px] px-2 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white font-semibold disabled:opacity-50">
                              {pending && savingId === r.passengerId ? '…' : 'Simpan'}
                            </button>
                            {savedMsg[r.passengerId] && <span className={`ml-1 text-[10px] ${savedMsg[r.passengerId].startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{savedMsg[r.passengerId]}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
