// R215f: Display panel untuk Proyeksi Income Peserta
// Server component — pure display dari computeIncomeProjection
// Path: components/finance/ProyeksiIncomeSection.jsx

import { fmtRupiah } from '@/lib/utils/format';
import { ROOM_KEYS, MAIN_ADDONS, expectedPerPassenger, paxRoomKey, visaPriceFor } from '@/lib/utils/price-breakdown';

export default function ProyeksiIncomeSection({
  activePassengers = [],
  breakdown = {},
  paymentsByPax = {},
  customers = [],
  total = 0,
  byRoom = {},
  undefinedCount = 0,
  brand = '',
  visaRequirement = '',
}) {
  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));
  const _grpVisa = String(visaRequirement || '') === 'group';
  const _isKh = String(brand || '').toLowerCase() === 'khasanah';

  // Per-pax breakdown
  const perPaxRows = activePassengers.map((p) => {
    const cust = custMap[p.customer_id];
    const pPays = paymentsByPax[p.id] || [];
    // Group wajib visa (TEONE) -> semua peserta diperlakukan include_visa.
    const pEff = (_grpVisa && !_isKh) ? { ...p, include_visa: true } : p;
    const expected = expectedPerPassenger(pEff, breakdown, pPays, brand);
    const paid = pPays.reduce((s, x) => s + Number(x.amount || 0), 0);
    const outstanding = Math.max(expected - paid, 0);
    // Breakdown Visa & Asuransi per peserta (bagian dari Expected).
    const _key = paxRoomKey(pEff);
    const _isInfant = _key === 'infant';
    let visa = 0, asuransi = 0;
    if (_isKh) {
      // Khasanah: visa & asuransi WAJIB (kecuali infant; visa bebas kalau sudah 'visa ready').
      if (!_isInfant) {
        visa = pEff.visa_ready ? 0 : (visaPriceFor(breakdown, pEff.visa_type) || 0);
        asuransi = Number(breakdown.asuransi) || 0;
      }
    } else {
      // TEONE: opt-in per peserta (group wajib visa -> semua include_visa).
      const incVisa = !!pEff.include_visa && !pEff.visa_ready;
      visa = incVisa ? (visaPriceFor(breakdown, pEff.visa_type) || 0) : 0;
      asuransi = pEff.include_asuransi ? (Number(breakdown.asuransi) || 0) : 0;
    }
    return {
      passenger_id: p.id,
      name: cust?.name || `#${p.id}`,
      room_type: p.room_type || '—',
      discount: Number(p.discount_amount) || 0,
      expected,
      visa,
      asuransi,
      paid,
      outstanding,
    };
  });

  // Total Visa & Asuransi (bagian dari Expected proyeksi) — ditampilkan terpisah.
  const totalVisa = perPaxRows.reduce((s, r) => s + (r.visa || 0), 0);
  const totalAsuransi = perPaxRows.reduce((s, r) => s + (r.asuransi || 0), 0);
  const countVisa = perPaxRows.filter((r) => (r.visa || 0) > 0).length;
  const countAsuransi = perPaxRows.filter((r) => (r.asuransi || 0) > 0).length;

  // Active addons (yg ada nilainya di breakdown)
  const activeAddons = MAIN_ADDONS.filter((a) => Number(breakdown[a.key]) > 0);

  return (
    <div className="bg-white rounded-xl border-2 border-emerald-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-emerald-800 flex items-center gap-2">
              <span>🎯</span> Proyeksi Income Peserta
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Auto-calc dari master trip (room price + main addons + optional addons - diskon)
            </p>
          </div>
          <p className="text-2xl font-bold text-emerald-700">{fmtRupiah(total)}</p>
        </div>
      </div>

      {/* Breakdown info */}
      {activeAddons.length > 0 && (
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">📋 Komponen Harga (per pax)</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            {ROOM_KEYS.filter((r) => Number(breakdown[r.key]) > 0).slice(0, 5).map((r) => (
              <div key={r.key} className="p-2 bg-purple-50 rounded border border-purple-200">
                <p className="text-[10px] font-bold text-purple-700 uppercase">{r.icon} {r.label}</p>
                <p className="text-sm font-bold text-purple-700">{fmtRupiah(breakdown[r.key])}</p>
              </div>
            ))}
            {activeAddons.map((a) => (
              <div key={a.key} className="p-2 bg-blue-50 rounded border border-blue-200">
                <p className="text-[10px] font-bold text-blue-700 uppercase">{a.icon} {a.label}</p>
                <p className="text-sm font-bold text-blue-700">{fmtRupiah(breakdown[a.key])}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Breakdown Visa & Asuransi (bagian dari Expected proyeksi) */}
      {(totalVisa > 0 || totalAsuransi > 0) && (
        <div className="px-5 py-3 bg-indigo-50/60 border-b border-slate-200">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">🛂 Visa &amp; Asuransi (sudah termasuk di Expected)</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2 bg-white rounded border border-indigo-200">
              <p className="text-[10px] font-bold text-indigo-700 uppercase">🛂 Total Visa</p>
              <p className="text-sm font-bold text-indigo-700">{fmtRupiah(totalVisa)}</p>
              <p className="text-[10px] text-slate-500">{countVisa} peserta include visa</p>
            </div>
            <div className="p-2 bg-white rounded border border-indigo-200">
              <p className="text-[10px] font-bold text-indigo-700 uppercase">🛡 Total Asuransi</p>
              <p className="text-sm font-bold text-indigo-700">{fmtRupiah(totalAsuransi)}</p>
              <p className="text-[10px] text-slate-500">{countAsuransi} peserta include asuransi</p>
            </div>
          </div>
        </div>
      )}

      {/* Per room summary */}
      {Object.keys(byRoom).length > 0 && (
        <div className="px-5 py-3 border-b border-slate-200">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">🏠 Per Room Type</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(byRoom).map(([key, info]) => {
              const roomMeta = ROOM_KEYS.find((r) => r.key === key);
              return (
                <div key={key} className="p-2 bg-emerald-50 rounded border border-emerald-200">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase">
                    {roomMeta?.icon} {roomMeta?.label || key}
                  </p>
                  <p className="text-[10px] text-slate-600">{info.count} pax × {fmtRupiah(info.price)}</p>
                  <p className="text-sm font-bold text-emerald-700">{fmtRupiah(info.subtotal)}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per pax detail */}
      <div className="px-5 py-3">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">👤 Per Peserta</p>

        {perPaxRows.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Belum ada peserta aktif.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr className="text-left text-[11px] font-bold text-slate-700 uppercase">
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2 text-right">Expected</th>
                  <th className="px-3 py-2 text-right">Visa</th>
                  <th className="px-3 py-2 text-right">Asuransi</th>
                  <th className="px-3 py-2 text-right">Diskon</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {perPaxRows.map((row) => (
                  <tr key={row.passenger_id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{row.name}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase bg-slate-100 text-slate-700">
                        {row.room_type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">{fmtRupiah(row.expected)}</td>
                    <td className="px-3 py-1.5 text-right text-indigo-700">
                      {row.visa > 0 ? fmtRupiah(row.visa) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-indigo-700">
                      {row.asuransi > 0 ? fmtRupiah(row.asuransi) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-amber-700">
                      {row.discount > 0 ? `-${fmtRupiah(row.discount)}` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-green-700">{fmtRupiah(row.paid)}</td>
                    <td className={`px-3 py-1.5 text-right font-bold ${row.outstanding > 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {row.outstanding > 0 ? fmtRupiah(row.outstanding) : '✓ Lunas'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr className="font-bold">
                  <td className="px-3 py-2" colSpan="2">TOTAL ({perPaxRows.length} pax)</td>
                  <td className="px-3 py-2 text-right text-emerald-800">
                    {fmtRupiah(perPaxRows.reduce((s, r) => s + r.expected, 0))}
                  </td>
                  <td className="px-3 py-2 text-right text-indigo-800">{fmtRupiah(totalVisa)}</td>
                  <td className="px-3 py-2 text-right text-indigo-800">{fmtRupiah(totalAsuransi)}</td>
                  <td className="px-3 py-2 text-right text-amber-800">
                    {fmtRupiah(perPaxRows.reduce((s, r) => s + r.discount, 0))}
                  </td>
                  <td className="px-3 py-2 text-right text-green-800">
                    {fmtRupiah(perPaxRows.reduce((s, r) => s + r.paid, 0))}
                  </td>
                  <td className="px-3 py-2 text-right text-red-700">
                    {fmtRupiah(perPaxRows.reduce((s, r) => s + r.outstanding, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {undefinedCount > 0 && (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            ⚠ {undefinedCount} peserta belum punya room_type valid. Income mereka pakai fallback <span className="font-mono">price_paid</span> column.
            <span className="ml-1">Set room_type di Roomlist Auto-Generator atau Master Trip.</span>
          </div>
        )}
      </div>
    </div>
  );
}
