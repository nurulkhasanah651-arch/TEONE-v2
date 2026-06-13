'use client';

// Auto-hitung pajak tahunan dari data riil (cash basis).
// PPN jasa travel (besaran tertentu) = 1,2% x omzet. Wajib PKP bila omzet > Rp4,8 M/th.
// PPh: omzet <= 4,8 M -> Final UMKM 0,5% x omzet; > 4,8 M -> Badan 22% x laba.
// Dasar hukum: PMK 71/2022 jo. PMK 131/2024 (PPN 12% -> efektif 1,2%); PP 55/2022 (UMKM 0,5%); UU 7/2021 (PPh Badan 22%).

import { useState, useEffect, useMemo, Fragment } from 'react';
import { getYearlyFinancials } from '@/lib/actions/tax-annual';

const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const PKP_THRESHOLD = 4_800_000_000;
const OMZET_31E_MAX = 50_000_000_000;

export default function TaxAnnualPanel() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState('');
  // Pengaturan (sesuai jawaban: sudah > 4,8M tapi belum urus PKP)
  const [includePPN, setIncludePPN] = useState(true);   // hitung kewajiban PPN walau belum PKP
  const [pphMode, setPphMode] = useState('auto');         // auto | umkm | badan
  const [includeManualIn, setIncludeManualIn] = useState(true); // kas masuk lain ikut omzet?
  const [use31E, setUse31E] = useState(true); // fasilitas Pasal 31E (diskon 50% omzet <= 50 M)
  const [openYear, setOpenYear] = useState(null);

  useEffect(() => {
    getYearlyFinancials().then((r) => {
      if (r?.error) setErr(r.error);
      else setRows(r.rows || []);
    }).catch((e) => setErr(String(e?.message || e)));
  }, []);

  const calc = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const omzet = r.peserta_in + (includeManualIn ? r.manual_in : 0);
      const beban = r.hpp_out + r.ops_out;
      const laba = omzet - beban;
      const wajibPkp = omzet > PKP_THRESHOLD;
      const ppn = includePPN ? Math.round(omzet * 0.012) : 0;
      let pphScheme, pph;
      const useUmkm = pphMode === 'umkm' || (pphMode === 'auto' && omzet <= PKP_THRESHOLD);
      if (useUmkm) {
        pphScheme = 'UMKM 0,5% × omzet';
        pph = Math.round(omzet * 0.005);
      } else {
        const pkp = Math.max(laba, 0);
        if (use31E && omzet > 0 && omzet <= OMZET_31E_MAX) {
          const facShare = Math.min(PKP_THRESHOLD / omzet, 1) * pkp; // bagian dapat diskon (11%)
          const normShare = pkp - facShare;                          // sisa (22%)
          pph = Math.round(facShare * 0.11 + normShare * 0.22);
          pphScheme = 'Badan (fasilitas Ps.31E: 11%/22%)';
        } else {
          pph = Math.round(pkp * 0.22);
          pphScheme = 'Badan 22% × laba';
        }
      }
      return { ...r, omzet, beban, laba, wajibPkp, ppn, pphScheme: pphScheme, pph, total: ppn + pph };
    });
  }, [rows, includePPN, pphMode, includeManualIn, use31E]);

  const anyWajibPkp = calc.some((c) => c.wajibPkp);

  return (
    <div className="bg-white rounded-xl border-2 border-brand-200 shadow-card p-4 space-y-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-brand-700 flex items-center gap-2"><span>🧾</span> Pajak Tahunan (Otomatis)</h2>
          <p className="text-[11px] text-slate-500">Dihitung otomatis dari omzet & laba riil (cash basis) tiap tahun · era Coretax</p>
        </div>
      </div>

      {/* Pengaturan */}
      <div className="flex flex-wrap items-center gap-3 text-xs bg-slate-50 rounded-lg p-3">
        <label className="flex items-center gap-1.5 font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={includePPN} onChange={(e) => setIncludePPN(e.target.checked)} /> Hitung PPN 1,2%
        </label>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-600">PPh:</span>
          {[['auto', 'Otomatis'], ['umkm', 'UMKM 0,5%'], ['badan', 'Badan 22%']].map(([v, l]) => (
            <button key={v} onClick={() => setPphMode(v)} className={`px-2 py-1 rounded-full border text-[11px] font-bold ${pphMode === v ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-300'}`}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={includeManualIn} onChange={(e) => setIncludeManualIn(e.target.checked)} /> Kas masuk lain ikut omzet
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={use31E} onChange={(e) => setUse31E(e.target.checked)} /> Fasilitas Pasal 31E (diskon omzet ≤ Rp50 M)
        </label>
      </div>

      {anyWajibPkp && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-800">
          ⚠ <b>Omzet melebihi Rp4,8 miliar/tahun</b> → perusahaan <b>WAJIB dikukuhkan sebagai PKP</b> dan memungut PPN.
          Segera urus PKP ke KPP. Selama belum PKP, PPN tetap jadi kewajiban (bisa berisiko sanksi).
        </div>
      )}

      {err && <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-sm text-red-700">⚠ {err}</div>}

      {rows === null ? (
        <p className="text-sm text-slate-400 py-6 text-center">⏳ Memuat data…</p>
      ) : calc.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <p className="text-3xl mb-1">📭</p>
          <p className="font-semibold text-slate-600">Belum ada data pembayaran/transaksi.</p>
          <p className="text-xs">Pajak akan otomatis muncul begitu ada omzet masuk.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-slate-500 border-b border-slate-200">
                <th className="text-left py-2 px-2">Tahun</th>
                <th className="text-right px-2">Omzet</th>
                <th className="text-right px-2">Laba</th>
                <th className="text-right px-2">PPN 1,2%</th>
                <th className="text-right px-2">PPh</th>
                <th className="text-right px-2">Total Pajak</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {calc.map((c) => (
                <Fragment key={c.year}>
                  <tr key={c.year} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-2 font-bold text-slate-800">{c.year}{c.wajibPkp && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">PKP</span>}</td>
                    <td className="text-right px-2 font-mono">{rp(c.omzet)}</td>
                    <td className="text-right px-2 font-mono text-slate-600">{rp(c.laba)}</td>
                    <td className="text-right px-2 font-mono">{rp(c.ppn)}</td>
                    <td className="text-right px-2 font-mono">{rp(c.pph)}</td>
                    <td className="text-right px-2 font-mono font-bold text-brand-700">{rp(c.total)}</td>
                    <td className="text-right px-2">
                      <button onClick={() => setOpenYear(openYear === c.year ? null : c.year)} className="text-[11px] text-brand-600 font-bold">{openYear === c.year ? '▲' : 'Rincian ▼'}</button>
                    </td>
                  </tr>
                  {openYear === c.year && (
                    <tr key={c.year + '-d'} className="bg-slate-50">
                      <td colSpan={7} className="px-3 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                          <Det l="Omzet dari peserta" v={rp(c.peserta_in)} />
                          <Det l="Kas masuk lain" v={rp(c.manual_in) + (includeManualIn ? '' : ' (tdk dihitung)')} />
                          <Det l="Beban HPP (dibayar)" v={rp(c.hpp_out)} />
                          <Det l="Beban operasional" v={rp(c.ops_out)} />
                          <Det l="Laba (omzet − beban)" v={rp(c.laba)} strong />
                          <Det l={`DPP PPN (10% × omzet)`} v={rp(c.omzet * 0.1)} />
                          <Det l={`PPN terutang (1,2% omzet)`} v={rp(c.ppn)} strong />
                          <Det l={`PPh — ${c.pphScheme}`} v={rp(c.pph)} strong />
                          <Det l="TOTAL PAJAK SETAHUN" v={rp(c.total)} strong />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 rounded-lg p-3 space-y-1">
        <p>📌 <b>PPN jasa biro/agen perjalanan wisata</b> = besaran tertentu, DPP 10% × omzet → efektif <b>1,2%</b> (PMK 71/2022 jo. PMK 131/2024). Pajak masukan tidak dapat dikreditkan.</p>
        <p>📌 <b>PPh</b>: omzet ≤ Rp4,8 M → Final UMKM 0,5% × omzet (PP 55/2022); omzet &gt; Rp4,8 M → PPh Badan 22% × laba. <b>Fasilitas Pasal 31E</b>: omzet ≤ Rp50 M dapat diskon 50% (tarif 11%) atas bagian laba sebanding omzet Rp4,8 M pertama.</p>
        <p>📌 Omzet/laba diambil <b>cash basis</b> (uang masuk riil) dari Real Cashflow. Pastikan "kas masuk lain" bukan modal/pinjaman.</p>
        <p className="text-amber-700">⚠ Estimasi otomatis — bukan SPT resmi & bukan nasihat pajak. Setor & lapor via Coretax DJP; konsultasikan ke konsultan pajak/AR.</p>
      </div>
    </div>
  );
}

function Det({ l, v, strong }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
      <span>{l}</span><span className="font-mono whitespace-nowrap">{v}</span>
    </div>
  );
}
