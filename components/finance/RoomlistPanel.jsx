'use client';

// R231: Roomlist Panel — EDITOR INTERAKTIF + FINAL ROOMLIST
// - Auto tersusun dari master trip (room type + gender + family)
// - Bisa: pindah/tukar peserta antar kamar, tambah orang manual (TL/driver),
//   tambah room extra, ganti label, hapus room kosong
// - Tombol "Simpan Final Roomlist" → tersimpan permanen, ikut ke Google Sheet
// Path: components/finance/RoomlistPanel.jsx

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { generateRoomlist, normalizeGender } from '@/lib/utils/roomlist';
import { saveFinalRoomlist, clearFinalRoomlist } from '@/lib/actions/roomlist';
import { ROOM_TYPES, ROOM_CAPACITY } from '@/lib/utils/room-pricing';

function genderOf(p, custMap) {
  const c = custMap[p.customer_id] || {};
  return normalizeGender({ gender: p.gender || p.sex || c.gender || c.sex });
}

// Konversi hasil auto-generate → bentuk editable
function autoToEditable(passengers, customers, custMap) {
  const rooms = generateRoomlist(passengers, customers);
  return rooms.map((r, i) => ({
    key: `auto-${i}`,
    room_type: r.room_type === 'unassigned' ? 'double' : r.room_type,
    label: r.label,
    is_family: !!r.is_family,
    members: (r.pax || []).map((p) => ({
      passenger_id: p.id,
      name: custMap[p.customer_id]?.name || `#${p.id}`,
      gender: genderOf(p, custMap),
    })),
  }));
}

function savedToEditable(saved) {
  return (saved?.rooms || []).map((r, i) => ({
    key: `saved-${i}`,
    room_type: r.room_type || 'double',
    label: r.label || `Room ${i + 1}`,
    is_family: !!r.is_family,
    members: (r.members || []).map((m) => ({ ...m })),
  }));
}

function roomWarning(room) {
  const cap = ROOM_CAPACITY[room.room_type] || room.members.length || 1;
  if (room.members.length === 0) return { level: 'info', text: 'Kamar kosong' };
  if (room.is_family) {
    if (room.members.length === 1 && cap > 1) return { level: 'warn', text: 'Sisa 1 anggota family — gabung kamar lain / upgrade' };
    return null;
  }
  const genders = new Set(room.members.map((m) => m.gender).filter((g) => g === 'M' || g === 'F'));
  if (genders.size > 1) return { level: 'error', text: 'CAMPUR GENDER — pisahkan atau jadikan family' };
  if (room.members.some((m) => m.gender !== 'M' && m.gender !== 'F')) return { level: 'warn', text: 'Ada yang gender-nya belum diisi' };
  if (room.members.length < cap && cap > 1) return { level: 'warn', text: `Kurang ${cap - room.members.length} pax — NEED UPGRADE ROOM / cari roommate` };
  if (room.members.length > cap) return { level: 'error', text: `Kelebihan ${room.members.length - cap} pax dari kapasitas` };
  return null;
}

export default function RoomlistPanel({ trip, passengers = [], customers = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);

  const custMap = useMemo(
    () => Object.fromEntries((customers || []).map((c) => [c.id, c])),
    [customers]
  );

  const hasSaved = !!trip?.final_roomlist?.rooms;
  const [rooms, setRooms] = useState(() =>
    hasSaved ? savedToEditable(trip.final_roomlist) : autoToEditable(passengers, customers, custMap)
  );
  const [isFinal, setIsFinal] = useState(hasSaved);
  const [savedAt, setSavedAt] = useState(trip?.final_roomlist?.saved_at || null);
  const [newNames, setNewNames] = useState({});

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }

  function update(fn) { setRooms((prev) => fn(structuredClone(prev))); setIsFinal(false); }

  function moveMember(fromIdx, memberIdx, toIdx) {
    update((rs) => {
      const [m] = rs[fromIdx].members.splice(memberIdx, 1);
      if (toIdx === -1) {
        rs.push({ key: `new-${Date.now()}`, room_type: rs[fromIdx].room_type, label: 'Room baru', is_family: false, members: [m] });
      } else {
        rs[toIdx].members.push(m);
      }
      return rs;
    });
  }

  function swapWith(fromIdx, memberIdx, toIdx, toMemberIdx) {
    update((rs) => {
      const a = rs[fromIdx].members[memberIdx];
      const b = rs[toIdx].members[toMemberIdx];
      rs[fromIdx].members[memberIdx] = b;
      rs[toIdx].members[toMemberIdx] = a;
      return rs;
    });
  }

  function addManual(roomIdx) {
    const name = (newNames[roomIdx] || '').trim();
    if (!name) return;
    update((rs) => {
      rs[roomIdx].members.push({ passenger_id: null, name, gender: '?', manual: true });
      return rs;
    });
    setNewNames((n) => ({ ...n, [roomIdx]: '' }));
  }

  function removeMember(roomIdx, memberIdx) {
    update((rs) => { rs[roomIdx].members.splice(memberIdx, 1); return rs; });
  }

  function addRoom(type = 'double') {
    update((rs) => {
      rs.push({ key: `new-${Date.now()}`, room_type: type, label: `Extra Room`, is_family: false, members: [] });
      return rs;
    });
  }

  function removeRoom(roomIdx) {
    update((rs) => { rs.splice(roomIdx, 1); return rs; });
  }

  function setRoomField(roomIdx, field, value) {
    update((rs) => { rs[roomIdx][field] = value; return rs; });
  }

  function regenerate() {
    setRooms(autoToEditable(passengers, customers, custMap));
    setIsFinal(false);
    showMsg('Disusun ulang otomatis dari master trip');
  }

  function handleSaveFinal() {
    startTransition(async () => {
      const payload = rooms.map((r, i) => ({
        room_no: i + 1,
        room_type: r.room_type,
        capacity: ROOM_CAPACITY[r.room_type] || r.members.length,
        label: r.label,
        is_family: r.is_family,
        gender: r.is_family ? 'family' : (r.members[0]?.gender || '?'),
        members: r.members,
        note: roomWarning(r)?.text || '',
      }));
      const res = await saveFinalRoomlist(trip.id, payload);
      if (res.error) { showMsg(res.error, 'error'); return; }
      setIsFinal(true);
      setSavedAt(res.saved_at);
      showMsg('✅ Final Roomlist tersimpan!');
      router.refresh();
    });
  }

  function handleUnlock() {
    startTransition(async () => {
      const res = await clearFinalRoomlist(trip.id);
      if (res.error) { showMsg(res.error, 'error'); return; }
      setIsFinal(false);
      setSavedAt(null);
      showMsg('Final roomlist dibuka lagi — silakan edit');
    });
  }

  async function downloadRoomlistExcel() {
    try {
      const XLSX = await import('xlsx');
      const aoa = [
        [`FINAL ROOMLIST — ${trip?.name || ''}`],
        [''],
        ['Room#', 'Type', 'Cap', 'Label', 'Pax 1', 'Pax 2', 'Pax 3', 'Pax 4', 'Note'],
      ];
      rooms.forEach((r, i) => {
        const names = [0, 1, 2, 3].map((x) => {
          const m = r.members[x];
          return m ? `${m.name}${m.gender && m.gender !== '?' ? ` (${m.gender})` : ''}` : '';
        });
        aoa.push([i + 1, (r.room_type || '').toUpperCase(), ROOM_CAPACITY[r.room_type] || '', r.label, ...names, roomWarning(r)?.text || '']);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [{ wch: 7 }, { wch: 10 }, { wch: 5 }, { wch: 26 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 24 }, { wch: 36 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Final Roomlist');
      XLSX.writeFile(wb, `Roomlist - ${trip?.kode_trip || trip?.name || 'trip'}.xlsx`);
    } catch (e) {
      showMsg('Gagal download: ' + e.message, 'error');
    }
  }

  const totalPax = rooms.reduce((s, r) => s + r.members.length, 0);
  const problemRooms = rooms.map((r) => roomWarning(r)).filter((w) => w && w.level !== 'info').length;

  return (
    <div className="bg-white rounded-xl shadow-card border border-indigo-200 overflow-hidden">
      {/* HEADER */}
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-bold text-slate-800">🛏 Roomlist {isFinal && <span className="ml-1 text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">✓ FINAL</span>}</p>
          <p className="text-[11px] text-slate-500">
            {isFinal
              ? `Final tersimpan ${savedAt ? new Date(savedAt).toLocaleString('id-ID') : ''} — ikut ke Google Sheet saat Sync`
              : 'Auto dari master trip — bisa tukar kamar, tambah TL/driver, tambah room, lalu Simpan Final'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={regenerate} disabled={pending} className="text-[11px] font-semibold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded">
            🔄 Susun Ulang Otomatis
          </button>
          <button onClick={downloadRoomlistExcel} className="text-[11px] font-semibold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded">
            📥 Download Excel
          </button>
          {isFinal ? (
            <button onClick={handleUnlock} disabled={pending} className="text-[11px] font-semibold px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded">
              ✏️ Edit Lagi
            </button>
          ) : (
            <button onClick={handleSaveFinal} disabled={pending} className="text-[11px] font-bold px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded">
              {pending ? 'Menyimpan…' : '💾 Simpan Final Roomlist'}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-xs font-semibold ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {msg.text}
        </div>
      )}

      {/* SUMMARY */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap gap-2 text-[11px] font-semibold">
        <span className="px-2 py-1 bg-white border border-slate-200 rounded">Total Rooms: {rooms.length}</span>
        <span className="px-2 py-1 bg-white border border-slate-200 rounded">Total Pax: {totalPax}</span>
        {problemRooms > 0 && (
          <span className="px-2 py-1 bg-red-100 text-red-700 border border-red-200 rounded">🔔 {problemRooms} kamar perlu perhatian</span>
        )}
      </div>

      {/* ROOM CARDS */}
      <div className="p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rooms.map((r, roomIdx) => {
            const warn = roomWarning(r);
            const cap = ROOM_CAPACITY[r.room_type] || 0;
            return (
              <div key={r.key} className={`border rounded-lg p-3 ${
                warn?.level === 'error' ? 'border-red-400 bg-red-50' :
                warn?.level === 'warn' ? 'border-amber-300 bg-amber-50/50' :
                r.is_family ? 'border-pink-200 bg-pink-50/40' : 'border-slate-200 bg-slate-50/50'
              }`}>
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-600 shrink-0">Room {roomIdx + 1}</span>
                  <select
                    value={r.room_type}
                    disabled={isFinal}
                    onChange={(e) => setRoomField(roomIdx, 'room_type', e.target.value)}
                    className="text-[10px] border border-slate-300 rounded px-1 py-0.5"
                  >
                    {ROOM_TYPES.map((rt) => <option key={rt.key} value={rt.key}>{rt.label} ({rt.capacity})</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-[9px] font-bold text-pink-600 cursor-pointer shrink-0">
                    <input type="checkbox" checked={r.is_family} disabled={isFinal}
                      onChange={(e) => setRoomField(roomIdx, 'is_family', e.target.checked)} />
                    FAM
                  </label>
                  {r.members.length === 0 && !isFinal && (
                    <button onClick={() => removeRoom(roomIdx)} className="text-red-500 text-xs font-bold" title="Hapus room kosong">✕</button>
                  )}
                </div>
                <input
                  value={r.label}
                  disabled={isFinal}
                  onChange={(e) => setRoomField(roomIdx, 'label', e.target.value)}
                  className="w-full mb-2 text-[11px] font-semibold border border-slate-200 rounded px-2 py-1 bg-white"
                  placeholder="Label kamar (mis. Family RIFAI / TL / Driver)"
                />
                <ul className="space-y-1">
                  {r.members.map((m, mi) => (
                    <li key={mi} className="flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-1">
                      <span className="text-[11px] text-slate-800 truncate flex-1">
                        {m.name}
                        {m.gender && m.gender !== '?' && <span className="ml-1 text-[9px] text-slate-400">({m.gender === 'M' ? 'L' : 'P'})</span>}
                        {m.manual && <span className="ml-1 text-[8px] px-1 bg-indigo-100 text-indigo-600 rounded font-bold">MANUAL</span>}
                      </span>
                      {!isFinal && (
                        <>
                          <select
                            value=""
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === '') return;
                              if (v === 'new') moveMember(roomIdx, mi, -1);
                              else moveMember(roomIdx, mi, Number(v));
                            }}
                            className="text-[9px] border border-slate-300 rounded px-1 py-0.5 w-16 shrink-0"
                            title="Pindah ke kamar lain"
                          >
                            <option value="">↔ Pindah</option>
                            {rooms.map((rr, ri) => ri !== roomIdx && (
                              <option key={ri} value={ri}>→ Room {ri + 1}</option>
                            ))}
                            <option value="new">+ Room baru</option>
                          </select>
                          <button onClick={() => removeMember(roomIdx, mi)} className="text-red-400 text-[10px] font-bold shrink-0" title="Keluarkan dari roomlist">✕</button>
                        </>
                      )}
                    </li>
                  ))}
                  {cap > 0 && r.members.length < cap && (
                    <li className="text-[10px] text-slate-400 italic px-2 py-0.5">+ {cap - r.members.length} slot kosong</li>
                  )}
                </ul>
                {!isFinal && (
                  <div className="mt-2 flex gap-1">
                    <input
                      value={newNames[roomIdx] || ''}
                      onChange={(e) => setNewNames((n) => ({ ...n, [roomIdx]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addManual(roomIdx)}
                      placeholder="+ Tambah orang (TL/driver…)"
                      className="flex-1 text-[10px] border border-dashed border-slate-300 rounded px-2 py-1"
                    />
                    <button onClick={() => addManual(roomIdx)} className="text-[10px] px-2 bg-slate-200 hover:bg-slate-300 rounded font-bold">+</button>
                  </div>
                )}
                {warn && warn.level !== 'info' && (
                  <p className={`mt-2 text-[10px] font-semibold ${warn.level === 'error' ? 'text-red-700' : 'text-amber-700'}`}>
                    🔔 {warn.text}
                  </p>
                )}
              </div>
            );
          })}

          {!isFinal && (
            <button
              onClick={() => addRoom('double')}
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-slate-400 hover:text-slate-600 hover:border-slate-400 text-sm font-semibold"
            >
              + Tambah Room (extra / TL / driver)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
