'use client';

import { useState } from 'react';
import { getRoomlistRows } from '@/lib/actions/manifest';

export default function RoomlistDownloadButton({ tripId, label = '🛏 Download Roomlist', className = '' }) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      const res = await getRoomlistRows(tripId);
      if (res?.error) { alert('Gagal: ' + res.error); return; }
      const { trip, rooms } = res;
      const XLSX = await import('xlsx');
      const aoa = [
        [`FINAL ROOMLIST — ${trip.name || ''}${trip.kode_trip ? ` (${trip.kode_trip})` : ''}${trip.isFinal ? ' ✓ final' : ' (auto)'}`],
        [''],
        ['Room#', 'Type', 'Family', 'Label', 'Pax 1', 'Pax 2', 'Pax 3', 'Pax 4', 'Note'],
        ...rooms.map((r) => {
          const names = [0, 1, 2, 3].map((i) => {
            const m = r.members[i];
            return m ? `${m.name}${m.gender && m.gender !== '?' ? ` (${m.gender === 'M' ? 'L' : 'P'})` : ''}` : '';
          });
          return [r.room_no, (r.room_type || '').toUpperCase(), r.is_family ? 'YA' : '', r.label || '', ...names, r.note || ''];
        }),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 7 }, { wch: 10 }, { wch: 7 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 28 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Roomlist');
      XLSX.writeFile(wb, `Roomlist - ${trip.kode_trip || trip.name || 'trip'}.xlsx`);
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
