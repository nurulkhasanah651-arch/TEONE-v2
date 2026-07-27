'use client';

// Daftar Harga Visa (Price List / template) — bisa diedit & ditambah.
// Path: components/accounting/VisaPriceList.jsx

import { useState, useTransition } from 'react';
import { saveVisaPriceRow, deleteVisaPriceRow } from '@/lib/actions/visa-payment';
import { useRouter } from 'next/navigation';

const rupiah = (n) => 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');

export default function VisaPriceList({ rows = [] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState({});
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [nw, setNw] = useState({ visa_name: '', hpp: '', hj: '', keterangan: '' });

  const val = (r, f) => (edits[r.id]?.[f] !== undefined ? edits[r.id][f] : r[f]);
  const setVal = (id, f, v) => setEdits((e) => ({ ...e, [id]: { ...e[id], [f]: v } }));
  const inp = 'w-full px-1.5 py-1 border border-slate-300 rounded text-xs';

  function saveRow(r) {
    setBusyId(r.id);
    start(async () => {
      await saveVisaPriceRow(r.id, { visa_name: val(r, 'visa_name'), hpp: val(r, 'hpp'), hj: val(r, 'hj'), keterangan: val(r, 'keterangan') });
      setBusyId(null); router.refresh();
    });
  }
  function addRow() {
    if (!nw.visa_name.trim()) return;
    setBusyId('new');
    start(async () => {
      await saveVisaPriceRow(null, nw);
      setBusyId(null); setNw({ visa_name: '', hpp: '', hj: '', keterangan: '' }); router.refresh();
    });
  }
  function del(id) {
    if (!confirm('Hapus baris harga ini?')) return;
    setBusyId(id);
    start(async () => { await deleteVisaPriceRow(id); setBusyId(null); router.refresh(); });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 text-left">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">{open ? '▾' : '▸'}</span>
          <span className="font-bold text-brand-700">💲 Daftar Harga Visa (Price List)</span>
          <span className="text-xs text-slate-500">· {rows.length} jenis</span>
        </div>
        <span className="text-xs text-slate-500">{open ? 'sembunyikan' : 'lihat / edit'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-600 uppercase">
              <tr>
                <th className="px-2 py-2">Jenis Visa</th>
                <th className="px-2 py-2">HPP (modal)</th>
                <th className="px-2 py-2">HJ (harga jual)</th>
                <th className="px-2 py-2 text-right">Profit</th>
                <th className="px-2 py-2">Keterangan</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const profit = (Number(val(r, 'hj')) || 0) - (Number(val(r, 'hpp')) || 0);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-2 py-1.5 min-w-[160px]"><input className={inp} value={val(r, 'visa_name') || ''} onChange={(e) => setVal(r.id, 'visa_name', e.target.value)} /></td>
                    <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} inputMode="numeric" value={val(r, 'hpp') ?? ''} onChange={(e) => setVal(r.id, 'hpp', e.target.value)} /></td>
                    <td className="px-2 py-1.5 min-w-[110px]"><input className={inp} inputMode="numeric" value={val(r, 'hj') ?? ''} onChange={(e) => setVal(r.id, 'hj', e.target.value)} /></td>
                    <td className="px-2 py-1.5 text-right font-semibold text-green-700 whitespace-nowrap">{rupiah(profit)}</td>
                    <td className="px-2 py-1.5 min-w-[140px]"><input className={inp} value={val(r, 'keterangan') || ''} onChange={(e) => setVal(r.id, 'keterangan', e.target.value)} /></td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <button onClick={() => saveRow(r)} disabled={pending && busyId === r.id} className="text-[11px] px-2 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white font-semibold disabled:opacity-50">Simpan</button>
                      <button onClick={() => del(r.id)} disabled={pending && busyId === r.id} className="ml-1 text-[11px] px-2 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700">Hapus</button>
                    </td>
                  </tr>
                );
              })}
              {/* baris tambah */}
              <tr className="bg-emerald-50/40">
                <td className="px-2 py-1.5"><input className={inp} placeholder="+ jenis visa baru" value={nw.visa_name} onChange={(e) => setNw({ ...nw, visa_name: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input className={inp} inputMode="numeric" placeholder="HPP" value={nw.hpp} onChange={(e) => setNw({ ...nw, hpp: e.target.value })} /></td>
                <td className="px-2 py-1.5"><input className={inp} inputMode="numeric" placeholder="HJ" value={nw.hj} onChange={(e) => setNw({ ...nw, hj: e.target.value })} /></td>
                <td className="px-2 py-1.5 text-right text-slate-400">{rupiah((Number(nw.hj) || 0) - (Number(nw.hpp) || 0))}</td>
                <td className="px-2 py-1.5"><input className={inp} placeholder="Keterangan" value={nw.keterangan} onChange={(e) => setNw({ ...nw, keterangan: e.target.value })} /></td>
                <td className="px-2 py-1.5"><button onClick={addRow} disabled={pending && busyId === 'new'} className="text-[11px] px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50">+ Tambah</button></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
