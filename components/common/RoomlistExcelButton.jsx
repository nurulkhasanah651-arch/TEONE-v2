'use client';

// Tombol Download Roomlist (Excel) — FORMAT SAMA dengan Roomlist PDF (kolom paspor/
// tempat-tgl lahir/umur, Room Type merge, ringkasan kamar) + section TL & Tim.
// Sumber data sama dgn PDF (getRoomlistRows: pakai Final Roomlist tersimpan / auto).
import { useState } from 'react';
import { getRoomlistRows } from '@/lib/actions/manifest';
import { buildRoomlistAOA } from '@/lib/utils/roomlist-export';

export default function RoomlistExcelButton({ tripId, label = '🛏 Roomlist Excel', className = '' }) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      const res = await getRoomlistRows(tripId);
      if (res?.error) { alert('Gagal: ' + res.error); return; }
      const XLSX = await import('xlsx');
      const { aoa, merges, cols, sheetName, fileName } = buildRoomlistAOA({ trip: res.trip || {}, rooms: res.rooms || [] });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      if (Array.isArray(merges)) ws['!merges'] = merges;
      if (Array.isArray(cols)) ws['!cols'] = cols;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Roomlist');
      XLSX.writeFile(wb, fileName || `Roomlist - ${tripId}.xlsx`);
    } catch (e) {
      alert('Gagal download: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <button type="button" onClick={handle} disabled={loading}
      className={className || 'px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded disabled:opacity-50'}>
      {loading ? 'Menyiapkan…' : label}
    </button>
  );
}
