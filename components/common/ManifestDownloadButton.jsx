'use client';

// Tombol Download Manifest paspor lengkap (Excel) — dipakai di Portal TL,
// HPP Cashflow, dan tab Visa. Cukup kasih prop tripId.
import { useState } from 'react';
import { getManifestRows } from '@/lib/actions/manifest';
import { buildManifestAOA } from '@/lib/utils/manifest-export';

export default function ManifestDownloadButton({ tripId, label = '📥 Download Manifest', className = '' }) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      const res = await getManifestRows(tripId);
      if (res?.error) { alert('Gagal: ' + res.error); return; }
      const { trip, rows } = res;
      const XLSX = await import('xlsx');
      // Format Excel SERAGAM (buildManifestAOA) — sama di Operasional, Visa, Portal TL.
      // rows sudah termasuk TL/Tim (crew) dari getManifestRows.
      const { aoa, merges, cols, sheetName, fileName } = buildManifestAOA({ trip, rows });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      if (Array.isArray(merges)) ws['!merges'] = merges;
      if (Array.isArray(cols)) ws['!cols'] = cols;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Manifest');
      XLSX.writeFile(wb, fileName || `Manifest - ${trip.kode_trip || trip.name || 'trip'}.xlsx`);
    } catch (e) {
      alert('Gagal download: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      className={className || 'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded disabled:opacity-50'}
    >
      {loading ? 'Menyiapkan…' : label}
    </button>
  );
}
