'use client';

// Kalkulator Pajak Coretax untuk jasa travel (PPN Besaran Tertentu).
// Dasar hukum: PMK 71/2022 jo. PMK 131/2024 (tarif PPN 12% berlaku 1 Jan 2025).
// - Jasa biro/agen perjalanan wisata: DPP = 10% x harga jual, PPN = tarif x DPP (efektif 1,2% @12%).
// - Umroh/perjalanan ibadah: tagihan DIRINCI 10% (efektif 1,2%); TIDAK DIRINCI 5% (efektif 0,6%).
// - Pajak Masukan terkait jasa ini TIDAK dapat dikreditkan (Pasal 5 PMK 71/2022).
// Catatan: alat bantu estimasi, bukan nasihat pajak resmi.

import { useState, useMemo } from 'react';

const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');

const JENIS = [
  { key: 'wisata',        label: 'Biro/Agen Perjalanan Wisata (paket wisata, tiket, akomodasi)', dpp: 0.10 },
  { key: 'umroh_rinci',   label: 'Umroh / Perjalanan Ibadah — tagihan DIRINCI',                  dpp: 0.10 },
  { key: 'umroh_norinci', label: 'Umroh / Perjalanan Ibadah — tagihan TIDAK dirinci',            dpp: 0.05 },
];

export default function TaxCalculatorCoretax() {
  const [open, setOpen] = useState(false);
  const [hargaStr, setHargaStr] = useState('');
  const [jenis, setJenis] = useState('wisata');
  const [tarif, setTarif] = useState(0.12);          // 12% (2025+) / 11% (legacy)
  const [pphMode, setPph23] = useState(false);       // potong PPh 23 (2%) untuk klien B2B
  const [umkm, setUmkm] = useState(false);           // PPh Final UMKM 0,5% (PP 55/2022)

  const harga = useMemo(() => Number(String(hargaStr).replace(/[^0-9]/g, '')) || 0, [hargaStr]);
  const cfg = JENIS.find((j) => j.key === jenis) || JENIS[0];

  const dpp = harga * cfg.dpp;
  const ppn = dpp * tarif;
  const efektif = cfg.dpp * tarif;               // tarif efektif terhadap harga jual
  const pph23 = pphMode ? harga * 0.02 : 0;       // 2% x bruto (jasa) — bila klien memotong
  const pphUmkm = umkm ? harga * 0.005 : 0;       // 0,5% x omzet

  return (
    <div className="bg-white rounded-xl border-2 border-brand-200 shadow-card">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-lg">🧮</span>
          <div>
            <p className="font-bold text-brand-700">Kalkulator Pajak (Coretax) — Jasa Travel</p>
            <p className="text-[11px] text-slate-500">PPN Besaran Tertentu · PMK 71/2022 jo. PMK 131/2024 · tarif 12% (2025)</p>
          </div>
        </div>
        <span className="text-slate-400 text-sm">{open ? '▲ Tutup' : '▼ Buka'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
          {/* Input */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Harga Jual / Nilai Tagihan (Rp)</span>
              <input inputMode="numeric" value={hargaStr}
                onChange={(e) => setHargaStr(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="contoh: 100000000"
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono" />
              {harga > 0 && <span className="text-[11px] text-slate-400">{rp(harga)}</span>}
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Jenis Jasa</span>
              <select value={jenis} onChange={(e) => setJenis(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                {JENIS.map((j) => <option key={j.key} value={j.key}>{j.label}</option>)}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Tarif PPN:</span>
              <button type="button" onClick={() => setTarif(0.12)} className={`px-3 py-1 rounded-full text-xs font-bold border ${tarif === 0.12 ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-300'}`}>12% (2025)</button>
              <button type="button" onClick={() => setTarif(0.11)} className={`px-3 py-1 rounded-full text-xs font-bold border ${tarif === 0.11 ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-600 border-slate-300'}`}>11% (lama)</button>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={pphMode} onChange={(e) => setPph23(e.target.checked)} /> Klien potong PPh 23 (2%)
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
              <input type="checkbox" checked={umkm} onChange={(e) => setUmkm(e.target.checked)} /> PPh Final UMKM 0,5%
            </label>
          </div>

          {/* Hasil */}
          <div className="bg-brand-50 rounded-lg p-4 space-y-2">
            <Row label={`DPP (Nilai Lain) = ${(cfg.dpp * 100).toFixed(0)}% × Harga Jual`} value={rp(dpp)} />
            <Row label={`PPN Terutang = ${(tarif * 100).toFixed(0)}% × DPP`} value={rp(ppn)} strong
                 hint={`Tarif efektif ${(efektif * 100).toFixed(2).replace('.', ',')}% × harga jual`} />
            {pphMode && <Row label="PPh 23 dipotong klien (2% × bruto)" value={'– ' + rp(pph23)} />}
            {umkm && <Row label="PPh Final UMKM (0,5% × omzet)" value={rp(pphUmkm)} />}
            <div className="border-t border-brand-200 pt-2">
              <Row label="Total ditagih ke pelanggan (Harga + PPN)" value={rp(harga + ppn)} strong />
            </div>
          </div>

          {/* Catatan */}
          <div className="text-[11px] text-slate-500 leading-relaxed space-y-1 bg-slate-50 rounded-lg p-3">
            <p>📌 <b>Mekanisme:</b> jasa biro/agen perjalanan wisata memakai <b>PPN Besaran Tertentu</b> (Pasal 9A UU PPN) — DPP = 10% dari harga jual, sehingga tarif efektif <b>1,2%</b> sejak 1 Jan 2025 (sebelumnya 1,1%).</p>
            <p>📌 <b>Pajak Masukan</b> yang berkaitan dengan jasa ini <b>tidak dapat dikreditkan</b> (Pasal 5 PMK 71/2022).</p>
            <p>📌 Umroh/ibadah: tagihan <b>dirinci</b> → 1,2%; <b>tidak dirinci</b> → 0,6% (DPP 5%).</p>
            <p>📌 Penyetoran & e-Faktur dilakukan via <b>Coretax DJP</b>. Wajib jadi PKP untuk memungut PPN.</p>
            <p className="text-amber-700">⚠ Alat bantu estimasi — bukan nasihat pajak resmi. Konsultasikan dgn konsultan pajak/AR untuk kasus spesifik.</p>
            <p className="text-slate-400">Dasar hukum: PMK 71/2022 · PMK 131/2024 · UU 7/2021 (HPP). Diperbarui Jun 2026.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong, hint }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={`text-sm ${strong ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
      </div>
      <p className={`text-sm font-mono whitespace-nowrap ${strong ? 'font-bold text-brand-700' : 'text-slate-700'}`}>{value}</p>
    </div>
  );
}
