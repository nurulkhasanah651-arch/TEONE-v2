'use client';

// Tab Perhitungan (estimasi biaya -> profit) + tombol Kirim ke WA (Fonnte)
import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { sendQuotationWa, saveQuotationCosts } from '@/lib/actions/quotations';

const DEFAULT_ROWS = [
  { label: 'Hotel', amount: '', per: 'per_pax' },
  { label: 'Pesawat', amount: '', per: 'per_pax' },
  { label: 'Visa', amount: '', per: 'per_pax' },
  { label: 'Transport', amount: '', per: 'total' },
  { label: 'Makan', amount: '', per: 'per_pax' },
  { label: 'Tiket Wisata', amount: '', per: 'per_pax' },
  { label: 'Tour Leader', amount: '', per: 'total' },
];

function rupiah(n) {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
}
function toInt(v) {
  return parseInt(String(v || '').replace(/\D/g, '')) || 0;
}

export default function QuotationCalcAndWa({ quotation, canSeeProfit }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);

  const [waPhone, setWaPhone] = useState(quotation.contact_wa || '');
  function sendWa() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await sendQuotationWa(quotation.id, waPhone);
        if (r?.error) { setMsg({ type: 'error', text: r.error }); return; }
        setMsg({ type: 'ok', text: `Penawaran terkirim via WhatsApp ke ${r.sentTo}` });
        router.refresh();
      } catch (e) {
        setMsg({ type: 'error', text: 'Gagal kirim WA: ' + (e?.message || 'error') });
      }
    });
  }

  const pax = Number(quotation.pax_count) || 1;
  const [rows, setRows] = useState(
    Array.isArray(quotation.cost_breakdown) && quotation.cost_breakdown.length
      ? quotation.cost_breakdown.map((r) => ({ label: r.label || '', amount: r.amount || '', per: r.per || 'per_pax' }))
      : DEFAULT_ROWS
  );
  const [sellPrice, setSellPrice] = useState(quotation.selling_price_for_calc || '');

  const calc = useMemo(() => {
    let costPerPax = 0;
    for (const r of rows) {
      const amt = toInt(r.amount);
      costPerPax += r.per === 'total' ? (pax > 0 ? amt / pax : 0) : amt;
    }
    const totalCost = costPerPax * pax;
    const sell = toInt(sellPrice);
    const revenue = sell * pax;
    const profitPerPax = sell - costPerPax;
    const profitTotal = revenue - totalCost;
    const margin = sell > 0 ? (profitPerPax / sell) * 100 : 0;
    return { costPerPax, totalCost, revenue, profitPerPax, profitTotal, margin, sell };
  }, [rows, sellPrice, pax]);

  function updateRow(i, field, val) {
    setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function addRow() { setRows((rs) => [...rs, { label: '', amount: '', per: 'per_pax' }]); }
  function removeRow(i) { setRows((rs) => rs.filter((_, idx) => idx !== i)); }

  function saveCosts() {
    setMsg(null);
    startTransition(async () => {
      try {
        const r = await saveQuotationCosts(quotation.id, {
          cost_breakdown: rows.filter((x) => x.label || x.amount),
          cost_mode: 'per_pax',
          selling_price_for_calc: sellPrice,
        });
        if (r?.error) { setMsg({ type: 'error', text: r.error }); return; }
        setMsg({ type: 'ok', text: 'Perhitungan tersimpan' });
        router.refresh();
      } catch (e) {
        setMsg({ type: 'error', text: 'Gagal menyimpan: ' + (e?.message || 'error') });
      }
    });
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`px-4 py-2 rounded text-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-xl border-2 border-green-200 overflow-hidden">
        <div className="px-5 py-3 bg-green-50 border-b border-green-200">
          <h2 className="font-bold text-green-800">Kirim Penawaran ke WhatsApp Customer</h2>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">
            Mengirim link penawaran publik ke nomor customer via Fonnte. Pastikan penawaran sudah di-publish supaya link bisa dibuka.
          </p>
          <div className="flex gap-2 flex-wrap items-end">
            <label className="block flex-1 min-w-[200px]">
              <span className="text-xs font-bold text-slate-600">No. WhatsApp customer</span>
              <input autoComplete="off" value={waPhone} onChange={(e) => setWaPhone(e.target.value)}
                placeholder="08xxxxxxxxxx"
                className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded text-sm focus:border-green-500 outline-none" />
            </label>
            <button onClick={sendWa} disabled={pending || !waPhone.trim()}
              className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-bold rounded">
              {pending ? 'Mengirim...' : 'Kirim ke WA'}
            </button>
          </div>
          {!quotation.is_published && (
            <p className="text-[11px] text-amber-600">Penawaran belum di-publish - customer tidak akan bisa membuka link. Publish dulu di atas.</p>
          )}
          {quotation.wa_sent_at && (
            <p className="text-[11px] text-slate-400">Terakhir dikirim: {new Date(quotation.wa_sent_at).toLocaleString('id-ID')} ke {quotation.wa_sent_to}</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border-2 border-indigo-200 overflow-hidden">
        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-200 flex items-center justify-between">
          <h2 className="font-bold text-indigo-800">Perhitungan Penawaran (Estimasi)</h2>
          <span className="text-[11px] text-indigo-600">{pax} pax</span>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Input estimasi biaya per komponen. Pilih "per pax" (dikali jumlah peserta) atau "total" (dibagi rata). Angka ini internal, tidak tampil di penawaran customer.
          </p>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_120px_110px_32px] gap-2 text-[11px] font-bold text-slate-500 uppercase px-1">
              <span>Komponen</span><span>Biaya (Rp)</span><span>Hitung</span><span></span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_110px_32px] gap-2 items-center">
                <input autoComplete="off" value={r.label} onChange={(e) => updateRow(i, 'label', e.target.value)}
                  placeholder="Nama biaya" className="px-2 py-1.5 border border-slate-200 rounded text-sm" />
                <input autoComplete="off" inputMode="numeric" value={r.amount}
                  onChange={(e) => updateRow(i, 'amount', e.target.value.replace(/\D/g, ''))}
                  placeholder="0" className="px-2 py-1.5 border border-slate-200 rounded text-sm text-right" />
                <select value={r.per} onChange={(e) => updateRow(i, 'per', e.target.value)}
                  className="px-2 py-1.5 border border-slate-200 rounded text-sm bg-white">
                  <option value="per_pax">per pax</option>
                  <option value="total">total</option>
                </select>
                <button onClick={() => removeRow(i)} className="text-slate-400 hover:text-red-600 text-sm" title="Hapus">x</button>
              </div>
            ))}
            <button onClick={addRow} className="text-xs text-indigo-600 font-bold hover:underline">+ Tambah baris biaya</button>
          </div>

          <label className="block max-w-xs">
            <span className="text-xs font-bold text-slate-600">Harga jual per pax (Rp)</span>
            <input autoComplete="off" inputMode="numeric" value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value.replace(/\D/g, ''))}
              placeholder="cth: 35000000"
              className="w-full mt-1 px-3 py-2 border-2 border-slate-200 rounded text-sm text-right focus:border-indigo-500 outline-none" />
          </label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
            <Stat label="Biaya / pax" value={rupiah(calc.costPerPax)} />
            <Stat label="Total biaya" value={rupiah(calc.totalCost)} />
            {canSeeProfit ? (
              <>
                <Stat label="Profit / pax" value={rupiah(calc.profitPerPax)} highlight={calc.profitPerPax >= 0 ? 'good' : 'bad'} />
                <Stat label={`Profit total (${pax} pax)`} value={rupiah(calc.profitTotal)} highlight={calc.profitTotal >= 0 ? 'good' : 'bad'} sub={calc.sell > 0 ? `margin ${calc.margin.toFixed(1)}%` : ''} />
              </>
            ) : (
              <div className="col-span-2 flex items-center text-xs text-slate-400 italic px-2">
                Estimasi profit hanya terlihat untuk owner/accounting/manager/ops.
              </div>
            )}
          </div>

          <button onClick={saveCosts} disabled={pending}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded">
            {pending ? 'Menyimpan...' : 'Simpan Perhitungan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, highlight }) {
  const color = highlight === 'good' ? 'text-emerald-700' : highlight === 'bad' ? 'text-red-600' : 'text-slate-800';
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 font-bold uppercase">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}
