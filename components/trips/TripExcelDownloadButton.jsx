'use client';
// Download Excel lengkap 1 trip: Master Info, Client Data, Manifest, Payment Checklist,
// Status Visa, Roomlist (live terbaru), Refund. Mirror format Google Sheet Master Trip.
import { useState } from 'react';
import { getTripExportData } from '@/lib/actions/trip-export';

export default function TripExcelDownloadButton({ tripId, label = '📊 Download Excel Lengkap', className = '' }) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      const res = await getTripExportData(tripId);
      if (res?.error) { alert('Gagal: ' + res.error); return; }
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      for (const tab of res.tabs) {
        const ws = XLSX.utils.aoa_to_sheet(tab.rows || [[]]);
        XLSX.utils.book_append_sheet(wb, ws, tab.name.slice(0, 31));
      }
      const safe = String(res.kode || res.name || 'trip').replace(/[^a-zA-Z0-9 _-]+/g, '').slice(0, 40).trim();
      XLSX.writeFile(wb, `Master Trip - ${safe || 'trip'}.xlsx`);
    } catch (e) {
      alert('Gagal download: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={handle} disabled={loading}
      className={className || 'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded disabled:opacity-50'}>
      {loading ? 'Menyiapkan…' : label}
    </button>
  );
}
