'use client';

import { useState } from 'react';
import { getRoomlistRows } from '@/lib/actions/manifest';
import { downloadRoomlistPDF } from '@/lib/utils/roomlist-pdf';

export default function RoomlistDownloadButton({ tripId, label = '🛏 Download Roomlist (PDF)', className = '' }) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      const res = await getRoomlistRows(tripId);
      if (res?.error) { alert('Gagal: ' + res.error); return; }
      const { trip, rooms } = res;
      await downloadRoomlistPDF({ trip, rooms });
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
