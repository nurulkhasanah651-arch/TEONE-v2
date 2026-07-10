'use client';

// Round 100f: FamilyGroupManager — DEFENSIVE
// Bug Round 100: peserta dengan family_group_id orphan (family udah
// terhapus) dianggap "sudah dalam family" → ga bisa add ke family baru.
// Fix: cek family_group_id BOTH ada AND match dengan familyGroups
// fetched. Kalau orphan → treat as ungrouped (bisa di-add).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createFamilyGroup,
  updateFamilyGroup,
  addPassengerToFamily,
  removePassengerFromFamily,
  deleteFamilyGroup,
} from '@/lib/actions/families';

export default function FamilyGroupManager({ tripId, passengers = [], familyGroups = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [name, setName] = useState('');
  const [headId, setHeadId] = useState('');
  const [memberIds, setMemberIds] = useState([]);

  const [editName, setEditName] = useState('');
  const [editHeadId, setEditHeadId] = useState('');

  // Tambah anggota susulan ke family yang sudah ada: { [familyId]: passengerId }
  const [addPick, setAddPick] = useState({});

  // Build family map
  const familyMap = {};
  for (const fg of familyGroups) {
    familyMap[fg.id] = { ...fg, members: [] };
  }

  // Distribute passengers — DEFENSIVE: orphan family_group_id → treat as ungrouped
  for (const p of passengers) {
    if (p.family_group_id && familyMap[p.family_group_id]) {
      familyMap[p.family_group_id].members.push(p);
    }
    // orphan or null → handled below
  }
  const familiesList = Object.values(familyMap);

  // ungroupedPassengers: peserta yang TIDAK ada di family valid
  // (termasuk yang punya family_group_id orphan!)
  const ungroupedPassengers = passengers.filter((p) => {
    if (!p.family_group_id) return true; // truly ungrouped
    if (!familyMap[p.family_group_id]) return true; // orphan → treat as ungrouped
    return false; // in valid family
  });

  // Detect orphan peserta (warning purposes)
  const orphanPassengers = passengers.filter(
    (p) => p.family_group_id && !familyMap[p.family_group_id]
  );

  function resetCreate() {
    setName('');
    setHeadId('');
    setMemberIds([]);
    setShowCreate(false);
  }

  function handleCreate() {
    if (!name.trim()) { alert('Nama family wajib'); return; }
    if (!headId) { alert('Pilih kepala keluarga'); return; }
    const allMembers = [headId, ...memberIds].filter((v, i, a) => a.indexOf(v) === i);
    if (allMembers.length < 2) {
      if (!confirm('Family ini cuma 1 orang (kepala saja). Lanjut?')) return;
    }

    startTransition(async () => {
      const r = await createFamilyGroup({
        trip_id: tripId,
        name: name.trim(),
        head_passenger_id: Number(headId),
        member_passenger_ids: memberIds.map(Number),
      });
      if (r?.error) { alert(r.error); return; }
      resetCreate();
      router.refresh();
    });
  }

  function startEdit(fg) {
    setEditingId(fg.id);
    setEditName(fg.name || '');
    setEditHeadId(String(fg.head_passenger_id || ''));
  }

  function handleSaveEdit() {
    if (!editName.trim()) { alert('Nama wajib'); return; }
    startTransition(async () => {
      const r = await updateFamilyGroup({
        family_id: editingId,
        name: editName.trim(),
        head_passenger_id: Number(editHeadId),
      });
      if (r?.error) { alert(r.error); return; }
      setEditingId(null);
      router.refresh();
    });
  }

  function handleDelete(fg) {
    if (!confirm(`Bubarkan family "${fg.name}"?\n\n${fg.members.length} peserta akan jadi individu lagi (data peserta TIDAK terhapus).`)) return;
    startTransition(async () => {
      const r = await deleteFamilyGroup(fg.id);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  // Peserta susulan masuk ke family yang sudah ada (mis. anak baru didaftarkan).
  function handleAddMember(fg) {
    const pid = addPick[fg.id];
    if (!pid) return;
    const pax = passengers.find((p) => String(p.id) === String(pid));
    const nama = pax?.customers?.name || `#${pid}`;
    if (!confirm(`Masukkan ${nama} ke family "${fg.name}"?`)) return;
    startTransition(async () => {
      const r = await addPassengerToFamily({ family_id: fg.id, passenger_id: Number(pid) });
      if (r?.error) { alert(r.error); return; }
      setAddPick((prev) => ({ ...prev, [fg.id]: '' }));
      router.refresh();
    });
  }

  function handleRemoveMember(passengerId, name) {
    if (!confirm(`Keluarkan ${name} dari family?`)) return;
    startTransition(async () => {
      const r = await removePassengerFromFamily({ passenger_id: passengerId });
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  function toggleMember(id) {
    setMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-brand-700">👨‍👩‍👧‍👦 Family Groups</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Group peserta keluarga jadi 1 invoice (1 no HP kepala) — {familiesList.length} family · {ungroupedPassengers.length} individu
            {orphanPassengers.length > 0 && (
              <span className="text-amber-700 ml-1">· ⚠ {orphanPassengers.length} orphan (treated as individu)</span>
            )}
          </p>
        </div>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            + Bikin Family
          </button>
        )}
      </div>

      {orphanPassengers.length > 0 && (
        <p className="px-5 py-2 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-200">
          ⚠ Ada {orphanPassengers.length} peserta dengan family_group_id orphan (family-nya sudah terhapus).
          Mereka diperlakukan sebagai peserta individu dan bisa di-add ke family baru di bawah.
          (Untuk cleanup permanen: run SQL_CLEANUP_ORPHAN.txt)
        </p>
      )}

      {showCreate && (
        <div className="p-5 bg-indigo-50/40 border-b border-indigo-200 space-y-3">
          <p className="text-sm font-bold text-indigo-800">Bikin Family Group Baru</p>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700 block mb-1">Nama Family</span>
            <input autoComplete="off"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Keluarga Andi Santoso"
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-700 block mb-1">
              👑 Kepala Keluarga <span className="text-red-500">*</span>
              <span className="text-[10px] text-slate-500 font-normal ml-1">(no HP-nya yang dipakai untuk invoice)</span>
            </span>
            <select
              value={headId}
              onChange={(e) => setHeadId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm bg-white"
            >
              <option value="">— Pilih kepala —</option>
              {ungroupedPassengers.map((p) => {
                const c = p.customers || {};
                return (
                  <option key={p.id} value={p.id}>
                    {c.name || `Peserta #${p.id}`} {c.phone ? `(📞 ${c.phone})` : '⚠ no HP belum diisi'}
                  </option>
                );
              })}
            </select>
            {ungroupedPassengers.length === 0 && (
              <span className="text-[11px] text-amber-700 block mt-1">
                ⚠ Semua peserta sudah dalam family. Bubarkan family dulu atau tambah peserta baru.
              </span>
            )}
          </label>

          <div>
            <span className="text-xs font-semibold text-slate-700 block mb-1">
              Anggota Keluarga <span className="text-[10px] text-slate-500 font-normal">(centang yang ikut, selain kepala)</span>
            </span>
            <div className="max-h-48 overflow-y-auto border border-slate-300 rounded bg-white p-2 space-y-1">
              {ungroupedPassengers.filter((p) => String(p.id) !== String(headId)).length === 0 ? (
                <p className="text-xs text-slate-500 italic p-2">Belum ada peserta lain yang bisa di-add.</p>
              ) : (
                ungroupedPassengers
                  .filter((p) => String(p.id) !== String(headId))
                  .map((p) => {
                    const c = p.customers || {};
                    const checked = memberIds.map(String).includes(String(p.id));
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm ${
                          checked ? 'bg-indigo-100' : 'hover:bg-slate-50'
                        }`}
                      >
                        <input autoComplete="off"
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(p.id)}
                          className="w-4 h-4"
                        />
                        <span className="font-medium">{c.name || `Peserta #${p.id}`}</span>
                        {p.room_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700">{p.room_type}</span>}
                      </label>
                    );
                  })
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {memberIds.length} anggota dicentang + 1 kepala = total {memberIds.length + (headId ? 1 : 0)} peserta dalam family
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              onClick={resetCreate}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Batal
            </button>
            <button
              onClick={handleCreate}
              disabled={pending || !headId || !name.trim()}
              className="px-4 py-1.5 text-xs font-semibold rounded text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50"
            >
              {pending ? 'Menyimpan...' : '👨‍👩‍👧 Bikin Family'}
            </button>
          </div>
        </div>
      )}

      {familiesList.length === 0 && !showCreate && (
        <div className="p-8 text-center">
          <p className="text-3xl mb-2">👨‍👩‍👧‍👦</p>
          <p className="text-sm font-bold text-slate-700">Belum ada family group</p>
          <p className="mt-1 text-xs text-slate-500">
            Bikin family kalau ada peserta yang dalam 1 keluarga<br />
            (mereka bisa share 1 invoice + 1 no HP kepala)
          </p>
        </div>
      )}

      {familiesList.length > 0 && (
        <div className="divide-y divide-slate-100">
          {familiesList.map((fg) => {
            const head = fg.members.find((m) => String(m.id) === String(fg.head_passenger_id));
            const headCustomer = head?.customers || {};
            const isEditing = editingId === fg.id;

            return (
              <div key={fg.id} className="px-5 py-3">
                {isEditing ? (
                  <div className="space-y-2 bg-amber-50/40 p-3 rounded">
                    <p className="text-xs font-bold text-amber-800">✎ Edit Family</p>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-700">Nama</span>
                      <input autoComplete="off"
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-700">👑 Kepala</span>
                      <select
                        value={editHeadId}
                        onChange={(e) => setEditHeadId(e.target.value)}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                      >
                        {fg.members.map((m) => {
                          const c = m.customers || {};
                          return (
                            <option key={m.id} value={m.id}>
                              {c.name || `#${m.id}`} {c.phone ? `(${c.phone})` : '⚠ no HP'}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={pending}
                        className="px-3 py-1 text-xs font-semibold rounded bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
                      >
                        💾 Simpan
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-lg">👨‍👩‍👧‍👦</span>
                          <p className="font-bold text-indigo-800">{fg.name}</p>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold">
                            {fg.members.length} peserta
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                          👑 <span className="font-semibold">{headCustomer.name || '—'}</span>
                          {headCustomer.phone && <span> · 📞 {headCustomer.phone}</span>}
                          {!headCustomer.phone && <span className="text-amber-700"> · ⚠ no HP kepala belum diisi</span>}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => startEdit(fg)}
                          disabled={pending}
                          className="text-xs px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold"
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => handleDelete(fg)}
                          disabled={pending}
                          className="text-xs px-2.5 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold"
                        >
                          🗑 Bubarkan
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 ml-7 space-y-1">
                      {fg.members.map((m) => {
                        const c = m.customers || {};
                        const isHead = String(m.id) === String(fg.head_passenger_id);
                        return (
                          <div key={m.id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded px-2 py-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{isHead ? '👑' : '👤'}</span>
                              <span className="font-medium text-slate-800">{c.name || `#${m.id}`}</span>
                              {m.room_type && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{m.room_type}</span>}
                              {isHead && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">KEPALA</span>}
                            </div>
                            {!isHead && (
                              <button
                                onClick={() => handleRemoveMember(m.id, c.name)}
                                disabled={pending}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold"
                                title="Keluarkan dari family"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}

                      {/* Tambah anggota susulan */}
                      <div className="flex items-center gap-2 pt-1">
                        {ungroupedPassengers.length === 0 ? (
                          <p className="text-[10px] text-slate-400">Semua peserta sudah punya family.</p>
                        ) : (
                          <>
                            <select
                              value={addPick[fg.id] || ''}
                              onChange={(e) => setAddPick((prev) => ({ ...prev, [fg.id]: e.target.value }))}
                              disabled={pending}
                              className="flex-1 min-w-0 text-[11px] px-2 py-1 border border-slate-300 rounded bg-white text-slate-700"
                            >
                              <option value="">+ Tambah anggota ke family ini…</option>
                              {ungroupedPassengers.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {(p.customers || {}).name || `Peserta #${p.id}`}{p.room_type ? ` · ${p.room_type}` : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAddMember(fg)}
                              disabled={pending || !addPick[fg.id]}
                              className="shrink-0 text-[10px] px-2 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-white font-bold disabled:opacity-40"
                            >
                              ➕ Masukkan
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
