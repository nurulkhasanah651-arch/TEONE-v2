'use client';

// Editor Estimate Profit Group — income (harga & pax auto dari master trip) + expense
// (template item + hotel per kota), margin & Print/Save PDF.
// Path: components/operasional/ProfitEstimateEditor.jsx

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveProfitEstimate } from '@/lib/actions/profit-estimate';

const rupiah = (n) => 'Rp ' + (Math.round(Number(n) || 0)).toLocaleString('id-ID');
const HEADCOUNT_KEYS = ['quad', 'triple', 'double', 'single', 'child_no_bed', 'infant', 'land_tour'];
const DEFAULT_TEMPLATES = [
  { category: 'International Flight' }, { category: 'Domestic Flight' }, { category: 'Landtour' },
  { category: 'Handling' }, { category: 'Visa' }, { category: 'Asuransi' },
  { category: 'Tipping Driver' }, { category: 'Tour Leader' }, { category: 'Fee Mitra' }, { category: 'Cancellation Fee' },
];
const DEFAULT_HOTEL_ROOMS = [
  { room: 'quad', label: 'Hotel Quad' }, { room: 'triple', label: 'Hotel Triple' },
  { room: 'double', label: 'Hotel Double' }, { room: 'single', label: 'Hotel Single' },
];

export default function ProfitEstimateEditor({ trip, meta: metaInit, income: incomeInit, expense: expenseInit, templates, hotelRooms, savedAt }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savedMsg, setSavedMsg] = useState('');
  const [meta, setMeta] = useState(metaInit || { rate_kurs: 0, periode: '', noted: '' });
  const [income, setIncome] = useState(incomeInit || []);
  const [expense, setExpense] = useState(expenseInit || []);
  const TPL = templates && templates.length ? templates : DEFAULT_TEMPLATES;
  const HROOMS = hotelRooms && hotelRooms.length ? hotelRooms : DEFAULT_HOTEL_ROOMS;

  const num = (v) => (v === '' || v == null ? 0 : Number(String(v).replace(/[^0-9.-]/g, '')) || 0);
  const inp = 'w-full px-1.5 py-1 border border-slate-300 rounded text-xs print:border-0';
  // Tampilkan angka uang dengan titik ribuan biar tidak salah baca (200.000 vs 2.000.000).
  const money = (v) => { const n = num(v); return n ? n.toLocaleString('id-ID') : ''; };
  const digits = (v) => String(v).replace(/[^0-9]/g, '');

  // ── Income ──
  const setIncCell = (i, f, v) => setIncome((rows) => rows.map((r, idx) => (idx === i ? { ...r, [f]: v } : r)));
  const setIncPax = (i, v) => setIncome((rows) => rows.map((r, idx) => (idx === i ? { ...r, pax: v, pax_override: true } : r)));
  const syncPax = () => setIncome((rows) => rows.map((r) => (r.standard ? { ...r, pax: r.pax_master || 0, pax_override: false } : r)));
  const addCustomIncome = () => setIncome((rows) => [...rows, { key: `custom_${Date.now()}`, label: '', standard: false, basic_fare: 0, pax: 0, pax_master: 0, pax_override: true, status_payment: false, noted: '' }]);
  const delIncome = (i) => setIncome((rows) => rows.filter((_, idx) => idx !== i));

  // ── Expense ──
  const addItem = (category = '', qty_source = null) => setExpense((rows) => [...rows, { type: 'item', category, component: '', unit_cost: 0, kurs: 0, currency: '', qty: 0, qty_source, qty_locked: false, noted: '' }]);
  const addHotel = () => setExpense((rows) => [...rows, { type: 'hotel', city: '', noted: '', kurs: 0, currency: '', rooms: HROOMS.map((h) => ({ ...h, unit_cost: 0, qty: 0, qty_source: h.qty_source || null, qty_locked: false, nights: 1 })) }]);
  const delExp = (i) => setExpense((rows) => rows.filter((_, idx) => idx !== i));
  const setExpCell = (i, f, v) => setExpense((rows) => rows.map((r, idx) => (idx === i ? { ...r, [f]: v } : r)));
  const setExpQty = (i, v) => setExpense((rows) => rows.map((r, idx) => (idx === i ? { ...r, qty: v, qty_locked: true } : r)));
  const setHotelRoom = (i, ri, f, v) => setExpense((rows) => rows.map((r, idx) => (idx === i ? { ...r, rooms: r.rooms.map((h, hi) => (hi === ri ? { ...h, [f]: v } : h)) } : r)));
  const setHotelRoomQty = (i, ri, v) => setExpense((rows) => rows.map((r, idx) => (idx === i ? { ...r, rooms: r.rooms.map((h, hi) => (hi === ri ? { ...h, qty: v, qty_locked: true } : h)) } : r)));
  const addHotelRoom = (i) => setExpense((rows) => rows.map((r, idx) => (idx === i ? { ...r, rooms: [...r.rooms, { room: 'custom', label: 'Hotel', unit_cost: 0, qty: 0, qty_source: null, qty_locked: false, nights: 1 }] } : r)));
  const delHotelRoom = (i, ri) => setExpense((rows) => rows.map((r, idx) => (idx === i ? { ...r, rooms: r.rooms.filter((_, hi) => hi !== ri) } : r)));

  // QTY expense OTOMATIS dari income di atas (headcount/visa/asuransi/tipping/room type),
  // kecuali sudah di-override manual (qty_locked).
  const qtySources = useMemo(() => {
    const paxOf = (k) => num(income.find((r) => r.key === k)?.pax);
    const head = income.filter((r) => HEADCOUNT_KEYS.includes(r.key)).reduce((s, r) => s + num(r.pax), 0);
    return {
      headcount: head, visa: paxOf('visa'), asuransi: paxOf('asuransi'), tipping: paxOf('tips'),
      quad: paxOf('quad'), triple: paxOf('triple'), double: paxOf('double'), single: paxOf('single'),
      child_no_bed: paxOf('child_no_bed'), infant: paxOf('infant'), land_tour: paxOf('land_tour'),
    };
  }, [income]);
  const effQty = (r) => (r.qty_source && !r.qty_locked ? (Number(qtySources[r.qty_source]) || 0) : num(r.qty));
  const isAutoQty = (r) => !!(r.qty_source && !r.qty_locked);

  // Hotel: ops isi HARGA KAMAR (per malam). Biaya = (harga kamar / kapasitas) × pax × malam.
  // Kapasitas dari tipe kamar: quad=4, triple=3, double=2, single=1.
  const occ = (h) => { const s = String(h.room || h.label || '').toLowerCase(); if (s.includes('quad')) return 4; if (s.includes('triple')) return 3; if (s.includes('double') || s.includes('twin')) return 2; if (s.includes('single')) return 1; return 1; };
  const nightsOf = (h) => (num(h.nights) > 0 ? num(h.nights) : 1);
  const kursOf = (v) => { const n = num(v); return n > 0 ? n : 1; }; // kosong/0 = 1 (harga sudah Rupiah)
  const roomSubtotal = (h, kurs = 1) => (num(h.unit_cost) * kurs / occ(h)) * effQty(h) * nightsOf(h);
  const hotelTotal = (r) => { const k = kursOf(r.kurs); return (r.rooms || []).reduce((s, h) => s + roomSubtotal(h, k), 0); };
  const itemSubtotal = (r) => num(r.unit_cost) * kursOf(r.kurs) * effQty(r);

  const totals = useMemo(() => {
    const totalIncome = income.reduce((s, r) => s + num(r.basic_fare) * num(r.pax), 0);
    const totalExpense = expense.reduce((s, r) => s + (r.type === 'hotel' ? hotelTotal(r) : itemSubtotal(r)), 0);
    const headcount = income.filter((r) => HEADCOUNT_KEYS.includes(r.key)).reduce((s, r) => s + num(r.pax), 0);
    const margin = totalIncome - totalExpense;
    const perPax = headcount > 0 ? margin / headcount : 0;
    return { totalIncome, totalExpense, headcount, margin, perPax };
  }, [income, expense, qtySources]);

  function doSave() {
    setSavedMsg('');
    start(async () => {
      const res = await saveProfitEstimate(trip.id, { ...meta, income, expense });
      if (res?.error) { setSavedMsg('⚠ ' + res.error); return; }
      setSavedMsg('✓ Tersimpan'); router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4 no-print">
        <button onClick={doSave} disabled={pending} className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold disabled:opacity-50">{pending ? 'Menyimpan…' : '💾 Simpan'}</button>
        <button onClick={() => window.print()} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold">🖨 Print / Save PDF</button>
        {savedMsg && <span className="text-sm font-medium text-slate-600">{savedMsg}</span>}
        {savedAt && <span className="text-xs text-slate-400 ml-auto">terakhir disimpan {new Date(savedAt).toLocaleString('id-ID')}</span>}
      </div>

      <div id="profit-print" className="bg-white border border-slate-200 rounded-lg p-4 text-slate-800">
        {/* Header */}
        <div className="border-2 border-slate-700 mb-3">
          <div className="bg-brand-700 text-white text-center py-2 font-bold text-sm">QUOTATION — ESTIMATE PROFIT GROUP<br />{trip.name}</div>
          <div className="grid grid-cols-2 md:grid-cols-4 text-xs">
            <div className="border border-slate-300 px-2 py-1"><span className="text-slate-500">Trip Code</span><div className="font-bold">{trip.kode}</div></div>
            <div className="border border-slate-300 px-2 py-1"><span className="text-slate-500">Package</span><div className="font-bold">{trip.country || trip.name}</div></div>
            <div className="border border-slate-300 px-2 py-1"><span className="text-slate-500">Periode</span><input className={`${inp} font-bold`} value={meta.periode} onChange={(e) => setMeta({ ...meta, periode: e.target.value })} placeholder="tgl - tgl" /></div>
            <div className="border border-slate-300 px-2 py-1"><span className="text-slate-500">Rate Kurs</span><input className={`${inp} font-bold`} inputMode="numeric" value={meta.rate_kurs} onChange={(e) => setMeta({ ...meta, rate_kurs: e.target.value })} placeholder="0" /></div>
          </div>
        </div>

        {/* INCOME */}
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-bold text-brand-700">📥 INCOME (Harga & pax otomatis dari Master Trip)</p>
          <button onClick={syncPax} className="text-[11px] px-2 py-1 rounded bg-brand-50 text-brand-700 font-semibold hover:bg-brand-100 no-print">↻ Ambil pax dari Master Trip</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-slate-100 text-[10px] uppercase text-slate-600"><tr>
              <th className="border border-slate-300 px-1 py-1 w-8">No</th>
              <th className="border border-slate-300 px-1 py-1 text-left">Component</th>
              <th className="border border-slate-300 px-1 py-1 text-right">Basic Fare</th>
              <th className="border border-slate-300 px-1 py-1 w-20">Pax</th>
              <th className="border border-slate-300 px-1 py-1 text-right">Income</th>
              <th className="border border-slate-300 px-1 py-1 w-12">Bayar</th>
              <th className="border border-slate-300 px-1 py-1 text-left">Noted</th>
              <th className="border border-slate-300 px-1 py-1 w-8 no-print"></th>
            </tr></thead>
            <tbody>
              {income.map((r, i) => (
                <tr key={r.key} className="hover:bg-slate-50">
                  <td className="border border-slate-300 px-1 py-1 text-center text-slate-400">{i + 1}</td>
                  <td className="border border-slate-300 px-1 py-1">{r.standard ? <span className="font-medium">{r.label}</span> : <input className={inp} value={r.label} onChange={(e) => setIncCell(i, 'label', e.target.value)} placeholder="item" />}</td>
                  <td className="border border-slate-300 px-1 py-1 text-right">{r.standard ? <span>{rupiah(r.basic_fare)}</span> : <input className={`${inp} text-right`} inputMode="numeric" value={money(r.basic_fare)} onChange={(e) => setIncCell(i, 'basic_fare', digits(e.target.value))} />}</td>
                  <td className="border border-slate-300 px-1 py-1">
                    <input className={`${inp} text-center`} inputMode="numeric" value={r.pax} onChange={(e) => setIncPax(i, e.target.value)} />
                    {r.standard && r.pax_override && num(r.pax) !== num(r.pax_master) && <span className="block text-[9px] text-amber-600 text-center no-print">master: {r.pax_master}</span>}
                  </td>
                  <td className="border border-slate-300 px-1 py-1 text-right font-semibold whitespace-nowrap">{rupiah(num(r.basic_fare) * num(r.pax))}</td>
                  <td className="border border-slate-300 px-1 py-1 text-center"><input type="checkbox" checked={r.status_payment} onChange={(e) => setIncCell(i, 'status_payment', e.target.checked)} /></td>
                  <td className="border border-slate-300 px-1 py-1"><input className={inp} value={r.noted} onChange={(e) => setIncCell(i, 'noted', e.target.value)} /></td>
                  <td className="border border-slate-300 px-1 py-1 text-center no-print">{!r.standard && <button onClick={() => delIncome(i)} className="text-red-500 text-xs">✕</button>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-emerald-50 font-bold">
              <td className="border border-slate-300 px-1 py-1" colSpan={4}>TOTAL INCOME</td>
              <td className="border border-slate-300 px-1 py-1 text-right text-emerald-700">{rupiah(totals.totalIncome)}</td>
              <td className="border border-slate-300 px-1 py-1" colSpan={3}></td>
            </tr></tfoot>
          </table>
        </div>
        <button onClick={addCustomIncome} className="mt-1 text-[11px] text-brand-600 font-semibold no-print">+ tambah item income</button>

        {/* EXPENSE */}
        <p className="text-xs font-bold text-brand-700 mt-4 mb-1">📤 EXPENSE / HPP (biaya vendor)</p>
        <div className="flex flex-wrap gap-1 mb-2 no-print">
          {TPL.map((t) => (
            <button key={t.category} onClick={() => addItem(t.category, t.qty_source)} className="text-[11px] px-2 py-1 rounded bg-slate-100 hover:bg-brand-100 text-slate-700 font-medium">+ {t.category}</button>
          ))}
          <button onClick={addHotel} className="text-[11px] px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold">🏨 + Hotel (kota)</button>
          <button onClick={() => addItem('')} className="text-[11px] px-2 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium">+ Item custom</button>
        </div>

        <div className="space-y-2">
          {expense.length === 0 && <p className="text-xs text-slate-400 italic">Belum ada item. Klik tombol template di atas (mis. International Flight, Hotel).</p>}
          {expense.map((r, i) => r.type === 'hotel' ? (
            <div key={i} className="border border-amber-300 rounded-lg overflow-hidden">
              <div className="bg-amber-50 px-2 py-1.5 flex items-center gap-2">
                <span className="text-sm">🏨</span>
                <span className="text-[11px] font-bold text-amber-800">Hotel —</span>
                <input className="flex-1 px-1.5 py-1 border border-amber-300 rounded text-xs print:border-0" value={r.city} onChange={(e) => setExpCell(i, 'city', e.target.value)} placeholder="nama kota (mis. Chengdu)" />
                <span className="text-[10px] text-amber-700">Kurs</span>
                <input className="w-20 px-1.5 py-1 border border-amber-300 rounded text-xs text-right print:border-0" inputMode="numeric" value={money(r.kurs)} onChange={(e) => setExpCell(i, 'kurs', digits(e.target.value))} placeholder="kosong=1" title="Kurs harga kamar ke Rupiah. Kosongkan/0 jika harga sudah Rupiah." />
                <span className="text-[11px] font-bold text-amber-800 whitespace-nowrap">{rupiah(hotelTotal(r))}</span>
                <button onClick={() => delExp(i)} className="text-red-500 text-xs no-print">✕</button>
              </div>
              <table className="w-full text-xs border-collapse">
                <thead className="bg-amber-50/50 text-[10px] uppercase text-amber-700"><tr>
                  <th className="border border-amber-200 px-1 py-1 text-left">Tipe Kamar</th>
                  <th className="border border-amber-200 px-1 py-1 text-right">Harga Kamar<span className="normal-case font-normal">/malam</span></th>
                  <th className="border border-amber-200 px-1 py-1 w-14">Pax</th>
                  <th className="border border-amber-200 px-1 py-1 w-14">Malam</th>
                  <th className="border border-amber-200 px-1 py-1 text-right">Subtotal</th>
                  <th className="border border-amber-200 px-1 py-1 w-8 no-print"></th>
                </tr></thead>
                <tbody>
                  {r.rooms.map((h, ri) => (
                    <tr key={ri}>
                      <td className="border border-amber-200 px-1 py-1"><input className={inp} value={h.label} onChange={(e) => setHotelRoom(i, ri, 'label', e.target.value)} /><span className="block text-[9px] text-slate-400 no-print">÷ {occ(h)} /pax</span></td>
                      <td className="border border-amber-200 px-1 py-1"><input className={`${inp} text-right`} inputMode="numeric" value={money(h.unit_cost)} onChange={(e) => setHotelRoom(i, ri, 'unit_cost', digits(e.target.value))} placeholder="harga kamar" /></td>
                      <td className="border border-amber-200 px-1 py-1"><input className={`${inp} text-center ${isAutoQty(h) ? 'bg-emerald-50' : ''}`} title={isAutoQty(h) ? 'otomatis dari income (pax) — ketik untuk override' : ''} inputMode="numeric" value={effQty(h)} onChange={(e) => setHotelRoomQty(i, ri, e.target.value)} /></td>
                      <td className="border border-amber-200 px-1 py-1"><input className={`${inp} text-center`} inputMode="numeric" value={h.nights} onChange={(e) => setHotelRoom(i, ri, 'nights', e.target.value)} /></td>
                      <td className="border border-amber-200 px-1 py-1 text-right font-semibold whitespace-nowrap">{rupiah(roomSubtotal(h, kursOf(r.kurs)))}</td>
                      <td className="border border-amber-200 px-1 py-1 text-center no-print"><button onClick={() => delHotelRoom(i, ri)} className="text-red-400 text-xs">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-2 py-1 no-print"><button onClick={() => addHotelRoom(i)} className="text-[11px] text-amber-700 font-semibold">+ tambah tipe kamar</button></div>
            </div>
          ) : (
            <div key={i} className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs border-collapse"><tbody>
                <tr>
                  <td className="px-1 py-1 w-40"><input className={inp} value={r.category} onChange={(e) => setExpCell(i, 'category', e.target.value)} placeholder="Category (mis. Flight)" /></td>
                  <td className="px-1 py-1"><input className={inp} value={r.component} onChange={(e) => setExpCell(i, 'component', e.target.value)} placeholder="Component (mis. Adult)" /></td>
                  <td className="px-1 py-1 w-24"><input className={`${inp} text-right`} inputMode="numeric" value={money(r.unit_cost)} onChange={(e) => setExpCell(i, 'unit_cost', digits(e.target.value))} placeholder="harga" /></td>
                  <td className="px-1 py-1 w-20"><input className={`${inp} text-right`} inputMode="numeric" value={money(r.kurs)} onChange={(e) => setExpCell(i, 'kurs', digits(e.target.value))} placeholder="kurs (kosong=1)" title="Kurs ke Rupiah. Kosongkan/0 jika harga sudah Rupiah." /></td>
                  <td className="px-1 py-1 w-16"><input className={`${inp} text-center ${isAutoQty(r) ? 'bg-emerald-50' : ''}`} title={isAutoQty(r) ? 'otomatis dari income (pax) — ketik untuk override' : ''} inputMode="numeric" value={effQty(r)} onChange={(e) => setExpQty(i, e.target.value)} placeholder="qty" /></td>
                  <td className="px-1 py-1 w-28 text-right font-semibold whitespace-nowrap">{rupiah(itemSubtotal(r))}</td>
                  <td className="px-1 py-1"><input className={inp} value={r.noted} onChange={(e) => setExpCell(i, 'noted', e.target.value)} placeholder="noted" /></td>
                  <td className="px-1 py-1 w-8 text-center no-print"><button onClick={() => delExp(i)} className="text-red-500 text-xs">✕</button></td>
                </tr>
              </tbody></table>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          <span className="text-xs font-bold text-rose-700">TOTAL EXPENSE</span>
          <span className="text-sm font-bold text-rose-800">{rupiah(totals.totalExpense)}</span>
        </div>

        {/* RINGKASAN */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2"><p className="text-[10px] uppercase text-emerald-700 font-bold">Total Income</p><p className="text-sm font-bold text-emerald-800">{rupiah(totals.totalIncome)}</p></div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2"><p className="text-[10px] uppercase text-rose-700 font-bold">Total Expense</p><p className="text-sm font-bold text-rose-800">{rupiah(totals.totalExpense)}</p></div>
          <div className={`rounded-lg border p-2 ${totals.margin >= 0 ? 'border-blue-200 bg-blue-50' : 'border-red-300 bg-red-50'}`}><p className="text-[10px] uppercase font-bold text-slate-600">Total Margin</p><p className={`text-sm font-bold ${totals.margin >= 0 ? 'text-blue-800' : 'text-red-700'}`}>{rupiah(totals.margin)}</p></div>
          <div className={`rounded-lg border p-2 ${totals.perPax >= 0 ? 'border-indigo-200 bg-indigo-50' : 'border-red-300 bg-red-50'}`}><p className="text-[10px] uppercase font-bold text-slate-600">Margin / Pax ({totals.headcount} pax)</p><p className={`text-sm font-bold ${totals.perPax >= 0 ? 'text-indigo-800' : 'text-red-700'}`}>{rupiah(totals.perPax)}</p></div>
        </div>

        <div className="mt-3"><p className="text-[10px] uppercase text-slate-500 font-bold mb-1">Noted</p><textarea className="w-full px-2 py-1 border border-slate-300 rounded text-xs print:border-0" rows={2} value={meta.noted} onChange={(e) => setMeta({ ...meta, noted: e.target.value })} placeholder="Catatan tambahan (mis. IF TAMBAH 2,5JT PER PAX, hotel, dll)" /></div>
      </div>

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
