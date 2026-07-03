'use client';

// Tombol Download Manifest paspor lengkap (Excel) — dipakai di Portal TL,
// HPP Cashflow, dan tab Visa. Cukup kasih prop tripId.
import { useState } from 'react';
import { getManifestRows } from '@/lib/actions/manifest';

export default function ManifestDownloadButton({ tripId, label = '📥 Download Manifest', className = '' }) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      const res = await getManifestRows(tripId);
      if (res?.error) { alert('Gagal: ' + res.error); return; }
      const { trip, rows } = res;
      const XLSX = await import('xlsx');
      const aoa = [
        [`MANIFEST — ${trip.name || ''}${trip.kode_trip ? ` (${trip.kode_trip})` : ''}`],
        [`Keberangkatan: ${trip.departure || '—'}   Kepulangan: ${trip.return || '—'}`],
        [''],
        ['No.', 'First Name', 'Last Name', 'Gender', 'Tempat Lahir', 'Tgl Lahir', 'Umur',
         'No. Paspor', 'Tgl Issue', 'Issuing Office', 'Tgl Expired', 'No. HP', 'Keterangan'],
        ...rows.map((r) => [
          r.no, r.first_name, r.last_name, r.gender, r.place_of_birth, r.birth_date, r.age,
          r.passport_no, r.issue_date, r.issuing_office, r.expiry_date, r.phone, r.keterangan,
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 18 }, { wch: 7 }, { wch: 16 }, { wch: 13 }, { wch: 6 },
        { wch: 18 }, { wch: 13 }, { wch: 18 }, { wch: 13 }, { wch: 16 }, { wch: 20 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Manifest');
      XLSX.writeFile(wb, `Manifest - ${trip.kode_trip || trip.name || 'trip'}.xlsx`);
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
