'use client';

// R215e: Roomlist Panel — auto-generate + display + Excel download + manual reassign
// Path: components/finance/RoomlistPanel.jsx

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updatePaxRoomType } from '@/lib/actions/hotel-hpp';
import { generateRoomlist, roomlistSummary, normalizeGender, genderLabel } from '@/lib/utils/roomlist';
import { ROOM_TYPES, ROOM_CAPACITY } from '@/lib/utils/room-pricing';

export default function RoomlistPanel({ trip, passengers = [], customers = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showAssign, setShowAssign] = useState(false);
  const [msg, setMsg] = useState(null);

  const custMap = useMemo(
    () => Object.fromEntries((customers || []).map((c) => [c.id, c])),
    [customers]
  );

  const activePassengers = useMemo(
    () => passengers.filter((p) => {
      if (p.transfer_status === 'transferred') return false;
      if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') return false;
      return true;
    }),
    [passengers]
  );

  const rooms = useMemo(() => generateRoomlist(passengers, customers), [passengers, customers]);
  const summary = useMemo(() => roomlistSummary(rooms), [rooms]);

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }

  function handleAssignRoom(paxId, roomType) {
    startTransition(async () => {
      const r = await updatePaxRoomType(paxId, roomType);
      if (r.error) showMsg(r.error, 'error');
      else router.refresh();
    });
  }

  async function downloadRoomlistExcel() {
    try {
      const XLSX = await import('xlsx');

      const aoa = [];
      // Header info
      aoa.push([`ROOMLIST — ${trip.kode_trip || `#${trip.id}`} ${trip.name}`]);
      aoa.push([`${activePassengers.length} pax aktif · ${summary.total_rooms} rooms`]);
      aoa.push([`Generated: ${new Date().toLocaleString('id-ID')}`]);
      aoa.push([]);

      // Summary
      aoa.push(['SUMMARY']);
      aoa.push(['Total Rooms', summary.total_rooms]);
      aoa.push(['Family Rooms', summary.family_rooms]);
      aoa.push(['Cowok Rooms', summary.cowok_rooms]);
      aoa.push(['Cewok Rooms', summary.cewok_rooms]);
      if (summary.unknown_rooms > 0) aoa.push(['Belum tau gender', summary.unknown_rooms]);
      aoa.push([]);
      aoa.push(['Per Room Type:']);
      for (const rt of ['single', 'twin', 'double', 'triple', 'quad', 'unassigned']) {
        if (summary.by_type[rt] > 0) {
          aoa.push([rt.charAt(0).toUpperCase() + rt.slice(1), summary.by_type[rt]]);
        }
      }
      aoa.push([]);

      // Table header
      const headerIdx = aoa.length;
      aoa.push(['Room No', 'Room Type', 'Capacity', 'Label', 'Gender', 'Pax 1', 'Pax 2', 'Pax 3', 'Pax 4', 'Notes']);

      // Data rows
      for (const r of rooms) {
        const row = [
          r.room_no,
          (r.room_type || '').toUpperCase(),
          r.capacity,
          r.label,
          r.is_family ? '👨‍👩‍👧 Family' : genderLabel(r.gender),
        ];
        for (let i = 0; i < 4; i++) {
          const pax = r.pax[i];
          if (pax) {
            const cust = custMap[pax.customer_id];
            const name = cust?.name || `#${pax.id}`;
            const g = normalizeGender(pax);
            row.push(`${name}${g !== '?' ? ` (${g})` : ''}`);
          } else {
            row.push('');
          }
        }
        row.push(r.needs_upgrade ? (r.upgrade_note || 'NEED UPGRADE ROOM') : (r.pax.length < r.capacity ? `Kurang ${r.capacity - r.pax.length} pax` : ''));
        aoa.push(row);
      }
      const dataEndIdx = aoa.length - 1;

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      ws['!cols'] = [
        { wch: 8 },   // Room No
        { wch: 10 },  // Room Type
        { wch: 8 },   // Capacity
        { wch: 28 },  // Label
        { wch: 14 },  // Gender
        { wch: 24 },  // Pax 1
        { wch: 24 },  // Pax 2
        { wch: 24 },  // Pax 3
        { wch: 24 },  // Pax 4
        { wch: 20 },  // Notes
      ];

      // Auto-filter
      if (rooms.length > 0) {
        ws['!autofilter'] = {
          ref: `A${headerIdx + 1}:J${dataEndIdx + 1}`,
        };
      }

      // Freeze top
      ws['!views'] = [{
        state: 'frozen',
        xSplit: 0,
        ySplit: headerIdx + 1,
        topLeftCell: `A${headerIdx + 2}`,
      }];

      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Roomlist');
      XLSX.writeFile(wb, `roomlist-${trip.kode_trip || trip.id}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      showMsg('Gagal generate Roomlist Excel: ' + e.message, 'error');
    }
  }

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-indigo-800 flex items-center gap-2">
              <span>🏠</span> Roomlist Auto-Generator
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Auto-assign room: Family sekamar · Same room type · Cowok/Cewok terpisah
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowAssign((v) => !v)}
              className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded"
            >
              {showAssign ? '✕ Tutup Assign' : '🛏 Assign / Re-assign Room'}
            </button>
            <button
              type="button"
              onClick={downloadRoomlistExcel}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded"
            >
              📊 Download Roomlist Excel
            </button>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-sm border-b ${
          msg.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          {msg.text}
        </div>
      )}

      {/* SUMMARY */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">📊 Summary</p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          <SummaryCard label="Total Rooms" value={summary.total_rooms} color="bg-indigo-100 text-indigo-800" />
          <SummaryCard label="👨‍👩 Family" value={summary.family_rooms} color="bg-pink-100 text-pink-800" />
          <SummaryCard label="👨 Cowok" value={summary.cowok_rooms} color="bg-blue-100 text-blue-800" />
          <SummaryCard label="👩 Cewok" value={summary.cewok_rooms} color="bg-purple-100 text-purple-800" />
          {summary.unknown_rooms > 0 && (
            <SummaryCard label="? Belum gender" value={summary.unknown_rooms} color="bg-red-100 text-red-800" />
          )}
          <SummaryCard label="Total Pax" value={summary.total_pax} color="bg-emerald-100 text-emerald-800" />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {Object.entries(summary.by_type).filter(([, count]) => count > 0).map(([type, count]) => (
            <span key={type} className="px-2 py-0.5 bg-white rounded border border-slate-200 font-semibold text-slate-700">
              {type.toUpperCase()}: {count} room
            </span>
          ))}
        </div>
      </div>

      {/* EDIT ROOM MATE — per kolom kamar (auto dari master trip, bisa diedit) */}
      {showAssign && (
        <div className="px-5 py-3 border-b border-slate-200 bg-white">
          <p className="text-xs font-bold text-slate-700 uppercase mb-1">🛏 Room Mate per Kamar</p>
          <p className="text-[10px] text-slate-500 mb-3">
            Otomatis disusun dari room type di master trip — double dengan double, segender, family sekamar.
            Mau pindah orang? Ganti room type-nya di bawah, kamar tersusun ulang otomatis.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[480px] overflow-auto">
            {rooms.map((r) => (
              <div
                key={r.room_no}
                className={`border rounded-lg p-3 ${
                  r.needs_upgrade ? 'border-red-300 bg-red-50' :
                  r.is_family ? 'border-pink-200 bg-pink-50/40' : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-bold text-slate-700">
                    Room {r.room_no} · {(r.room_type || '?').toUpperCase()}
                  </p>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    r.is_family ? 'bg-pink-100 text-pink-700' :
                    r.gender === 'M' ? 'bg-blue-100 text-blue-700' :
                    r.gender === 'F' ? 'bg-pink-100 text-pink-700' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {r.is_family ? '👨‍👩‍👧 FAMILY' : r.gender === 'M' ? 'COWOK' : r.gender === 'F' ? 'CEWOK' : '?'}
                  </span>
                </div>
                <ul className="space-y-1.5">
                  {r.pax.map((p) => {
                    const c = custMap[p.customer_id];
                    const g = normalizeGender({ ...p, gender: p.gender || p.sex || c?.gender || c?.sex });
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded px-2 py-1">
                        <span className="text-[11px] text-slate-800 truncate">
                          {c?.name || `#${p.id}`}
                          {g !== '?' && <span className="ml-1 text-[9px] text-slate-400">({g === 'M' ? 'L' : 'P'})</span>}
                        </span>
                        <select
                          defaultValue={p.room_type || ''}
                          disabled={pending}
                          onChange={(e) => handleAssignRoom(p.id, e.target.value)}
                          className="px-1.5 py-0.5 border border-slate-300 rounded text-[10px] shrink-0"
                          title="Ganti room type — kamar tersusun ulang otomatis"
                        >
                          <option value="">— Belum —</option>
                          {ROOM_TYPES.map((rt) => (
                            <option key={rt.key} value={rt.key}>{rt.label} ({rt.capacity})</option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                  {r.pax.length < r.capacity && !r.is_family && (
                    <li className="text-[10px] text-slate-400 italic px-2 py-1 border border-dashed border-slate-300 rounded">
                      + {r.capacity - r.pax.length} slot kosong
                    </li>
                  )}
                </ul>
                {r.needs_upgrade && (
                  <p className="mt-2 text-[10px] font-semibold text-red-700">🔔 {r.upgrade_note}</p>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">
            ℹ Sinkron dengan master trip — perubahan room type langsung menyusun ulang kamar & ikut ke tab Final Roomlist saat Sync.
          </p>
        </div>
      )}

      {/* ROOMLIST TABLE */}
      <div className="p-5">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
          🏠 Roomlist ({rooms.length} rooms)
        </p>
        {summary.need_upgrade_rooms > 0 && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-bold text-red-700">
              🔔 NEED UPGRADE ROOM — {summary.need_upgrade_rooms} kamar bermasalah
            </p>
            <p className="text-[11px] text-red-600 mt-1">
              Ada peserta tanpa roommate segender / gender belum diisi / room type belum ditulis di master file.
              Cek kolom Note di bawah, lalu upgrade room atau lengkapi datanya.
            </p>
          </div>
        )}
        {rooms.length === 0 ? (
          <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-lg">
            <p className="text-sm">Belum ada room. Assign room_type peserta dulu.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b-2 border-slate-200">
                <tr className="text-left text-[11px] font-bold text-slate-700 uppercase">
                  <th className="px-3 py-2">Room#</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Cap</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Gender</th>
                  <th className="px-3 py-2">Pax</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => {
                  const isUnderfilled = r.pax.length < r.capacity;
                  return (
                    <tr key={r.room_no} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-bold text-indigo-700">{r.room_no}</td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          r.room_type === 'quad' ? 'bg-amber-100 text-amber-800' :
                          r.room_type === 'triple' ? 'bg-emerald-100 text-emerald-800' :
                          r.room_type === 'double' ? 'bg-cyan-100 text-cyan-800' :
                          r.room_type === 'twin' ? 'bg-blue-100 text-blue-800' :
                          r.room_type === 'single' ? 'bg-purple-100 text-purple-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {r.room_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.capacity}</td>
                      <td className="px-3 py-2 font-semibold text-slate-700">
                        {r.is_family && <span className="text-pink-500 mr-1">👨‍👩</span>}
                        {r.label}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          r.is_family ? 'bg-pink-100 text-pink-800' :
                          r.gender === 'M' ? 'bg-blue-100 text-blue-800' :
                          r.gender === 'F' ? 'bg-purple-100 text-purple-800' :
                          'bg-slate-200 text-slate-600'
                        }`}>
                          {r.is_family ? '👨‍👩 Family' : genderLabel(r.gender)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <ul className="space-y-0.5">
                          {r.pax.map((p) => {
                            const c = custMap[p.customer_id];
                            const g = normalizeGender(p);
                            return (
                              <li key={p.id} className="text-slate-800">
                                {c?.name || `#${p.id}`}
                                {g !== '?' && (
                                  <span className="ml-1 text-[10px] text-slate-400">({g})</span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                      <td className="px-3 py-2">
                        {r.needs_upgrade ? (
                          <span className="text-[10px] text-red-700 font-semibold">
                            🔔 {r.upgrade_note || 'NEED UPGRADE ROOM'}
                          </span>
                        ) : isUnderfilled ? (
                          <span className="text-[10px] text-amber-700 font-semibold">
                            ⚠ Kurang {r.capacity - r.pax.length} pax
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className={`p-2 rounded text-center ${color}`}>
      <p className="text-[9px] font-bold uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
