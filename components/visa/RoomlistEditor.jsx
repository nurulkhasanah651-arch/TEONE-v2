'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { autoAssignRooms, updateRoomAssignment, clearAllRoomAssignments } from '@/lib/actions/roomlist';
import { fmtDate } from '@/lib/utils/format';
import RoomlistExcelButton from '@/components/common/RoomlistExcelButton';
import RoomlistDownloadButton from '@/components/common/RoomlistDownloadButton';

export default function RoomlistEditor({ tripId, tripCode, passengers = [] }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(null); // passenger id being edited
  const [editVal, setEditVal] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const router = useRouter();

  function handleAutoAssign() {
    if (!confirm('Auto-assign room ke semua peserta? Ini akan menimpa room_assignment yang sudah ada.')) return;
    startTransition(async () => {
      const r = await autoAssignRooms(tripId);
      if (r?.error) { alert(r.error); return; }
      alert(`✓ Auto-assign selesai. ${r.assigned} peserta dapat room.`);
      router.refresh();
    });
  }

  function handleClearAll() {
    if (!confirm('Hapus SEMUA room assignment? (peserta jadi ga ada room — perlu re-assign manual atau klik Auto Assign lagi)')) return;
    startTransition(async () => {
      const r = await clearAllRoomAssignments(tripId);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  function startEdit(p) {
    setEditing(p.id);
    setEditVal(p.room_assignment || '');
    setEditNotes(p.room_notes || '');
  }

  function saveEdit(pid) {
    startTransition(async () => {
      const r = await updateRoomAssignment(pid, tripId, editVal, editNotes);
      if (r?.error) { alert(r.error); return; }
      setEditing(null);
      router.refresh();
    });
  }

  // Group by room_assignment
  const byRoom = {};
  for (const p of passengers) {
    const room = p.room_assignment || '— belum di-assign —';
    if (!byRoom[room]) byRoom[room] = [];
    byRoom[room].push(p);
  }
  const sortedRooms = Object.keys(byRoom).sort((a, b) => {
    if (a.startsWith('—')) return 1;
    if (b.startsWith('—')) return -1;
    return a.localeCompare(b);
  });

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2 items-center justify-between bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleAutoAssign}
            disabled={pending}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            ⚡ Auto-Assign Rooms
          </button>
          <button
            onClick={handleClearAll}
            disabled={pending}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            🗑 Clear All
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <a
            href={`/visa/${tripId}/roomlist.csv`}
            download={`roomlist_${tripCode}.csv`}
            className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded-lg"
          >
            📥 Download CSV
          </a>
          {/* Format Excel/PDF SERAGAM dgn Operasional (kolom paspor + section TL & Tim) */}
          <RoomlistExcelButton tripId={tripId} label="📊 Download Excel"
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50" />
          <RoomlistDownloadButton tripId={tripId} label="🛏 Download PDF"
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50" />
        </div>
      </div>

      {/* Grouped view */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sortedRooms.map((room) => {
          const list = byRoom[room];
          const isUnassigned = room.startsWith('—');
          return (
            <div key={room} className={`bg-white rounded-xl border ${isUnassigned ? 'border-amber-300' : 'border-slate-200'} shadow-card overflow-hidden`}>
              <div className={`px-4 py-2 border-b ${isUnassigned ? 'bg-amber-50 border-amber-200' : 'bg-brand-50 border-brand-200'} flex items-center justify-between`}>
                <p className={`font-bold ${isUnassigned ? 'text-amber-800' : 'text-brand-700'}`}>{room}</p>
                <span className="text-xs font-semibold text-slate-600">{list.length} pax</span>
              </div>
              <div className="divide-y divide-slate-100">
                {list.map((p) => {
                  const c = p.customers || {};
                  const isEditing = editing === p.id;
                  return (
                    <div key={p.id} className="px-4 py-2">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-brand-700">{c.name || '—'}</p>
                          <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-2">
                            <span>{p.room_type || '—'}</span>
                            {c.passport_no && <span>📕 {c.passport_no}</span>}
                            {c.passport_expiry && <span>Exp: {fmtDate(c.passport_expiry)}</span>}
                          </div>
                          {p.room_notes && !isEditing && (
                            <p className="text-[11px] text-purple-700 italic mt-0.5">📝 {p.room_notes}</p>
                          )}
                        </div>
                        {!isEditing && (
                          <button onClick={() => startEdit(p)} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">
                            ✏ Edit
                          </button>
                        )}
                      </div>
                      {isEditing && (
                        <div className="mt-2 space-y-1.5 p-2 bg-slate-50 rounded">
                          <input autoComplete="off"
                            type="text"
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            placeholder="Room (misal: Quad-01)"
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                          />
                          <input autoComplete="off"
                            type="text"
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            placeholder="Notes (optional, mis: roommate Pak Budi)"
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                          />
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => setEditing(null)} className="text-[11px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200">Batal</button>
                            <button onClick={() => saveEdit(p.id)} disabled={pending} className="text-[11px] px-2 py-0.5 rounded bg-brand-500 hover:bg-brand-600 text-white font-semibold disabled:opacity-50">Save</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {passengers.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-12 text-center">
          <p className="text-4xl mb-3">🛏</p>
          <p className="text-lg font-bold text-slate-700">Belum ada peserta</p>
        </div>
      )}
    </div>
  );
}
