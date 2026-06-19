'use client';

import { useState } from 'react';
import { getRoomlistRows } from '@/lib/actions/manifest';
import { buildRoomlistAOA } from '@/lib/utils/roomlist-export';

export default function RoomlistDownloadButton({ tripId, label = '🛏 Download Roomlist', className = '' }) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      const res = await getRoomlistRows(tripId);
      if (res?.error) { alert('Gagal: ' + res.error); return; }
      const { trip, rooms } = res;
      const XLSX = await import('xlsx');
      const { aoa, merges, cols, sheetName, fileName } = buildRoomlistAOA({ trip, rooms });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = cols;
      ws['!merges'] = merges;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, fileName);
    } catch (e) {
      alert('Gagal download: ' + (e?.message || e));
    } finally { setLoading(false); }
  }
  return (
    <button type="button" onClick={handle} disabled={loading}
      className={className || 'px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded disabled:opacity-50'}>
      {loading ? 'Menyiapkan…' : label}
    </button>
  );
}
