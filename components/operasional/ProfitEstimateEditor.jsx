'use client';

// Editor Estimate Profit Group — income (harga jual auto dari master trip) + expense (manual),
// total margin & margin per pax, bisa Print/Save PDF. Path: components/operasional/ProfitEstimateEditor.jsx

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfitEstimate } from '@/lib/actions/profit-estimate';

const rupiah = (n) => 'Rp ' + (Math.round(Number(n) || 0)).toLocaleString('id-ID');
const HEADCOUNT_KEYS = ['quad', 'triple', 'double', 'single', 'child_no_bed', 'infant', 'land_tour'];

export default function ProfitEstimateEditor({ trip, meta: metaInit, income: incomeInit, expense: expenseInit, savedAt }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savedMsg, setSavedMsg] = useState('');
  const [meta, setMeta] = useState(metaInit || { rate_kurs: 0, periode: '', noted: '' });
  const [income, setIncome] = useState(incomeInit || []);
  const [expense, setExpense] = useState(expenseInit || []);

  const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(/[^0-9.-]/g, '')) || 0);
  const inp = 'w-full px-1.5 py-1 border border-slate-300 rounded text-xs print:border-0';

  // ── Income helpers ──
  const setIncCell = (i, f, v) => setIncome((rows) => rows.map((r, idx) => (idx === i ? { ...r, [f]: v } : r)));
  const addCustomIncome = () => setIncome((rows) => [...rows, { key: `custom_${Date.now()}`, label: '', standard: false, basic_fare: 0, pax: 0, status_payment: false, noted: '' }]);
  const delIncome = (i) => setIncome((rows) => rows.filter((_, idx) => idx !== i));

  // ── Expense helpers ──
  const setExpCell = (i, f, v) => setExpense((rows) => rows.map((r, idx) => (idx === i ? { ...r, [f]: v } : r)));
  const addExpense = () => setExpense((rows) => [...rows, { category: '', component: '', unit_cost: 0, qty: 0, amount: 0, noted: '' }]);
  const delExpense = (i) => setExpense((rows) => rows.filter((_, idx) => idx !== i));

  const totals = useMemo(() => {
    const totalIncome = income.reduce((s, r) => s + num(r.basic_fare) * num(r.pax), 0);
    const totalExpense = expense.reduce((s, r) => s + num(r.unit_cost) * num(r.qty), 0);
    const headcount = income.filter((r) => HEADCOUNT_KEYS.includes(r.key)).reduce((s, r) => s + num(r.pax), 0);
    const margin = totalIncome - totalExpense;
    const perPax = headcount > 0 ? margin / headcount : 0;
    return { totalIncome, totalExpense, headcount, margin, perPax };
  }, [income, expense]);

  function doSave() {
    setSavedMsg('');
    start(async () => {
      const res = await saveProfitEstimate(trip.id, { ...meta, income, expense });
      if (res?.error) { setSavedMsg('⚠ ' + res.error); return; }
      setSavedMsg('✓ Tersimpan');
      router.refresh();
    });
  }

  return (
    <div>
      {/* Toolbar (tidak ikut print) */}
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        <button onClick={doSave} disabled={pending}
          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-50">
          {pending ? 'Menyimpan…' : '💾 Simpan'}
        </button>
        <button onClick={() => window.print()}
          className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold">🖨 Print / Save PDF</button>
        {savedMsg && <span className="text-sm font-medium text-slate-600">{savedMsg}</span>}
        {savedAt && <span className="text-xs text-slate-400 ml-auto">terakhir disimpan {new Date(savedAt).toLocaleString('id-ID')}</span>}
      </div>

      {/* ══ AREA PRINT ══ */}
      <div id="profit-print" className="bg-white border border-slate-200 rounded-lg p-4 text-slate-800">
        {/* Header */}
        <div className="border-2 border-slate-700 mb-3">
          <div className="bg-brand-700 text-white text-center py-2 font-bold text-sm">
            QUOTATION — ESTIMATE PROFIT GROUP<br />{trip.name}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 text-xs">
            <div className="border border-slate-300 px-2 py-1"><span className="text-slate-500">Trip Code</span><div className="font-bold">{trip.kode}</div></div>
            <div className="border border-slate-300 px-2 py-1"><span className="text-slate-500">Package</span><div className="font-bold">{trip.country || trip.name}</div></div>
            <div className="border border-slate-300 px-2 py-1">
              <span className="text-slate-500">Periode</span>
              <input className={`${inp} font-bold`} value={meta.periode} onChange={(e) => setMeta({ ...meta, periode: e.target.value })} placeholder="tgl - tgl" />
            </div>
            <div className="border border-slate-300 px-2 py-1">
              <span className="text-slate-500">Rate Kurs</span>
              <input className={`${inp} font-bold`} inputMode="numeric" value={meta.rate_kurs} onChange={(e) => setMeta({ ...meta, rate_kurs: e.target.value })} placeholder="0" />
            </div>
          </div>
        </div>

        {/* INCOME */}
        <p className="text-xs font-bold text-brand-700 mb-1">📥 INCOME (Harga Jual — otomatis dari Master Trip)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-100 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="border border-slate-300 px-1 py-1 w-8">No</th>
                <th className="border border-slate-300 px-1 py-1 text-left">Component</th>
                <th className="border border-slate-300 px-1 py-1 text-right">Basic Fare</th>
                <th className="border border-slate-300 px-1 py-1 w-16">Pax</th>
                <th className="border border-slate-300 px-1 py-1 text-right">Income</th>
                <th className="border border-slate-300 px-1 py-1 w-12">Bayar</th>
                <th className="border border-slate-300 px-1 py-1 text-left">Noted</th>
                <th className="border border-slate-300 px-1 py-1 w-8 no-print"></th>
              </tr>
            </thead>
            <tbody>
              {income.map((r, i) => (
                <tr key={r.key} className="hover:bg-slate-50">
                  <td className="border border-slate-300 px-1 py-1 text-center text-slate-400">{i + 1}</td>
                  <td className="border border-slate-300 px-1 py-1">
                    {r.standard ? <span className="font-medium">{r.label}</span>
                      : <input className={inp} value={r.label} onChange={(e) => setIncCell(i, 'label', e.target.value)} placeholder="item" />}
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-right">
                    {r.standard ? <span>{rupiah(r.basic_fare)}</span>
                      : <input className={`${inp} text-right`} inputMode="numeric" value={r.basic_fare} onChange={(e) => setIncCell(i, 'basic_fare', e.target.value)} />}
                  </td>
                  <td className="border border-slate-300 px-1 py-1">
                    <input className={`${inp} text-center`} inputMode="numeric" value={r.pax} onChange={(e) => setIncCell(i, 'pax', e.target.value)} />
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-right font-semibold whitespace-nowrap">{rupiah(num(r.basic_fare) * num(r.pax))}</td>
                  <td className="border border-slate-300 px-1 py-1 text-center">
                    <input type="checkbox" checked={r.status_payment} onChange={(e) => setIncCell(i, 'status_payment', e.target.checked)} />
                  </td>
                  <td className="border border-slate-300 px-1 py-1">
                    <input className={inp} value={r.noted} onChange={(e) => setIncCell(i, 'noted', e.target.value)} />
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-center no-print">
                    {!r.standard && <button onClick={() => delIncome(i)} className="text-red-500 text-xs">✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-emerald-50 font-bold">
                <td className="border border-slate-300 px-1 py-1" colSpan={4}>TOTAL INCOME</td>
                <td className="border border-slate-300 px-1 py-1 text-right text-emerald-700">{rupiah(totals.totalIncome)}</td>
                <td className="border border-slate-300 px-1 py-1" colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={addCustomIncome} className="mt-1 text-[11px] text-brand-600 font-semibold no-print">+ tambah item income</button>

        {/* EXPENSE */}
        <p className="text-xs font-bold text-brand-700 mt-4 mb-1">📤 EXPENSE (Biaya Vendor — isi manual)</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-100 text-[10px] uppercase text-slate-600">
              <tr>
                <th className="border border-slate-300 px-1 py-1 w-8">No</th>
                <th className="border border-slate-300 px-1 py-1 text-left">Category</th>
                <th className="border border-slate-300 px-1 py-1 text-left">Component</th>
                <th className="border border-slate-300 px-1 py-1 text-right">Basic Fare</th>
                <th className="border border-slate-300 px-1 py-1 w-16">Qty</th>
                <th className="border border-slate-300 px-1 py-1 text-right">Expense</th>
                <th className="border border-slate-300 px-1 py-1 text-left">Noted</th>
                <th className="border border-slate-300 px-1 py-1 w-8 no-print"></th>
              </tr>
            </thead>
            <tbody>
              {expense.length === 0 && (
                <tr><td colSpan={8} className="border border-slate-300 px-2 py-3 text-center text-slate-400 italic">Belum ada item. Klik "+ tambah item expense".</td></tr>
              )}
              {expense.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="border border-slate-300 px-1 py-1 text-center text-slate-400">{i + 1}</td>
                  <td className="border border-slate-300 px-1 py-1"><input className={inp} value={r.category} onChange={(e) => setExpCell(i, 'category', e.target.value)} placeholder="mis. Flight" /></td>
                  <td className="border border-slate-300 px-1 py-1"><input className={inp} value={r.component} onChange={(e) => setExpCell(i, 'component', e.target.value)} placeholder="mis. Adult" /></td>
                  <td className="border border-slate-300 px-1 py-1"><input className={`${inp} text-right`} inputMode="numeric" value={r.unit_cost} onChange={(e) => setExpCell(i, 'unit_cost', e.target.value)} /></td>
                  <td className="border border-slate-300 px-1 py-1"><input className={`${inp} text-center`} inputMode="numeric" value={r.qty} onChange={(e) => setExpCell(i, 'qty', e.target.value)} /></td>
                  <td className="border border-slate-300 px-1 py-1 text-right font-semibold whitespace-nowrap">{rupiah(num(r.unit_cost) * num(r.qty))}</td>
                  <td className="border border-slate-300 px-1 py-1"><input className={inp} value={r.noted} onChange={(e) => setExpCell(i, 'noted', e.target.value)} /></td>
                  <td className="border border-slate-300 px-1 py-1 text-center no-print"><button onClick={() => delExpense(i)} className="text-red-500 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-rose-50 font-bold">
                <td className="border border-slate-300 px-1 py-1" colSpan={5}>TOTAL EXPENSE</td>
                <td className="border border-slate-300 px-1 py-1 text-right text-rose-700">{rupiah(totals.totalExpense)}</td>
                <td className="border border-slate-300 px-1 py-1" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <button onClick={addExpense} className="mt-1 text-[11px] text-brand-600 font-semibold no-print">+ tambah item expense</button>

        {/* RINGKASAN MARGIN */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2"><p className="text-[10px] uppercase text-emerald-700 font-bold">Total Income</p><p className="text-sm font-bold text-emerald-800">{rupiah(totals.totalIncome)}</p></div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2"><p className="text-[10px] uppercase text-rose-700 font-bold">Total Expense</p><p className="text-sm font-bold text-rose-800">{rupiah(totals.totalExpense)}</p></div>
          <div className={`rounded-lg border p-2 ${totals.margin >= 0 ? 'border-blue-200 bg-blue-50' : 'border-red-300 bg-red-50'}`}>
            <p className="text-[10px] uppercase font-bold text-slate-600">Total Margin</p>
            <p className={`text-sm font-bold ${totals.margin >= 0 ? 'text-blue-800' : 'text-red-700'}`}>{rupiah(totals.margin)}</p>
          </div>
          <div className={`rounded-lg border p-2 ${totals.perPax >= 0 ? 'border-indigo-200 bg-indigo-50' : 'border-red-300 bg-red-50'}`}>
            <p className="text-[10px] uppercase font-bold text-slate-600">Margin / Pax ({totals.headcount} pax)</p>
            <p className={`text-sm font-bold ${totals.perPax >= 0 ? 'text-indigo-800' : 'text-red-700'}`}>{rupiah(totals.perPax)}</p>
          </div>
        </div>

        {/* Catatan */}
        <div className="mt-3">
          <p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Noted</p>
          <textarea className="w-full px-2 py-1 border border-slate-300 rounded text-xs print:border-0" rows={2} value={meta.noted} onChange={(e) => setMeta({ ...meta, noted: e.target.value })} placeholder="Catatan tambahan (mis. IF TAMBAH 2,5JT PER PAX, hotel, dll)" />
        </div>
      </div>

      {/* Print CSS */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden !important; }
          #profit-print, #profit-print * { visibility: visible !important; }
          #profit-print { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
