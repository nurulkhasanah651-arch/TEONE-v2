'use client';

// Panel TL / Tim per trip (Master Trip). Crew TIDAK bayar, terpisah dari peserta,
// jadi tidak mempengaruhi income/okupansi/seat. Data passport ikut master TL
// (tour_leaders) via tl_id; kalau master belum ada paspor -> bisa diisi di sini.
// Crew otomatis muncul di Roomlist & Manifest (section "TL & Tim", keterangan role).

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTripCrew, removeTripCrew, updateTlPassport } from '@/lib/actions/crew';

const ROLES = ['Tour Leader', 'Muthawif', 'Driver', 'Handling', 'Tim Medis', 'Tim'];
const ROOM_TYPES = ['', 'single', 'twin', 'double', 'triple', 'quad', 'family'];

export default function TripCrewPanel({ tripId, crew = [], tourLeaders = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [tlId, setTlId] = useState('');
  const [manualName, setManualName] = useState('');
  const [role, setRole] = useState('Tour Leader');
  const [roomType, setRoomType] = useState('');
  const [editPassportFor, setEditPassportFor] = useState(null); // crew id

  function show(text, type = 'ok') { setMsg({ text, type }); setTimeout(() => setMsg(null), 4000); }

  function handleAdd() {
    if (!tlId && !manualName.trim()) { show('Pilih TL dari master atau isi nama', 'error'); return; }
    startTransition(async () => {
      const res = await addTripCrew(tripId, { tl_id: tlId || null, name: manualName, role, room_type: roomType });
      if (res?.error) { show(res.error, 'error'); return; }
      setTlId(''); setManualName(''); setRole('Tour Leader'); setRoomType('');
      show('TL/Tim ditambahkan');
      router.refresh();
    });
  }

  function handleRemove(id) {
    startTransition(async () => {
      const res = await removeTripCrew(id, tripId);
      if (res?.error) { show(res.error, 'error'); return; }
      show('Dihapus');
      router.refresh();
    });
  }

  const activeTLs = (tourLeaders || []).filter((t) => t.active !== false);

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-indigo-200 bg-indigo-50 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-indigo-800 flex items-center gap-2"><span>🧑‍✈️</span> TL &amp; Tim Trip</h2>
          <p className="text-[11px] text-slate-600 mt-0.5">Tanpa pembayaran · tidak masuk income/okupansi · otomatis muncul di Roomlist &amp; Manifest.</p>
        </div>
        <span className="text-xs font-semibold text-indigo-700">{crew.length} orang</span>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-xs font-semibold ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{msg.text}</div>
      )}

      {/* Form tambah */}
      <div className="p-4 border-b border-slate-100 bg-slate-50 grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Pilih TL (Master)</label>
          <select value={tlId} onChange={(e) => setTlId(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white">
            <option value="">— pilih dari master TL —</option>
            {activeTLs.map((t) => <option key={t.id} value={t.id}>{t.name}{t.passport_no ? ' ✓paspor' : ' (paspor kosong)'}</option>)}
          </select>
          <input autoComplete="off" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="atau ketik nama manual" className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Keterangan</label>
          <input autoComplete="off" list="crew-roles" value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
          <datalist id="crew-roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Kamar (opsional)</label>
          <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white">
            {ROOM_TYPES.map((r) => <option key={r} value={r}>{r ? r.toUpperCase() : '— TL & Tim —'}</option>)}
          </select>
        </div>
        <button onClick={handleAdd} disabled={pending} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold rounded">+ Tambah</button>
      </div>

      {/* List crew */}
      {crew.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">Belum ada TL/Tim untuk trip ini.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {crew.map((c) => (
            <div key={c.id} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{c.name || '(tanpa nama)'} <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold">{c.role}</span>{c.room_type ? <span className="ml-1 text-[10px] text-slate-500">🛏 {c.room_type.toUpperCase()}</span> : null}</p>
                  <p className="text-[11px] text-slate-500">
                    {c.passport_no ? `Paspor: ${c.passport_no}` : <span className="text-amber-600 font-semibold">Paspor belum ada</span>}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.tl_id && (
                    <button onClick={() => setEditPassportFor(editPassportFor === c.id ? null : c.id)} className="text-[11px] font-semibold px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded">
                      {c.masterPassportMissing ? '📝 Isi Paspor' : '✏ Edit Paspor'}
                    </button>
                  )}
                  <button onClick={() => handleRemove(c.id)} disabled={pending} className="text-[11px] font-semibold px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded">🗑 Hapus</button>
                </div>
              </div>

              {editPassportFor === c.id && c.tl_id && (
                <PassportForm crew={c} tripId={tripId} onDone={() => { setEditPassportFor(null); router.refresh(); }} onMsg={show} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PassportForm({ crew, tripId, onDone, onMsg }) {
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({
    gender: crew.gender || '',
    place_of_birth: crew.place_of_birth || '',
    birth_date: crew.birth_date || '',
    passport_no: crew.passport_no || '',
    passport_issued_date: crew.passport_issued_date || '',
    passport_issued_at: crew.passport_issued_at || '',
    passport_expiry: crew.passport_expiry || '',
  });
  const upd = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function save() {
    startTransition(async () => {
      const res = await updateTlPassport(crew.tl_id, f, tripId);
      if (res?.error) { onMsg?.(res.error, 'error'); return; }
      onMsg?.('Paspor TL tersimpan di Master TL — semua trip ikut ter-sync');
      onDone?.();
    });
  }

  const inp = 'w-full px-2 py-1.5 border border-slate-300 rounded text-sm';
  return (
    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-[11px] font-bold text-amber-800 mb-2">Data paspor disimpan ke MASTER TL ({crew.name}) — otomatis dipakai di semua trip TL ini.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <select value={f.gender} onChange={(e) => upd('gender', e.target.value)} className={inp}>
          <option value="">Gender…</option><option value="L">L</option><option value="P">P</option>
        </select>
        <input autoComplete="off" value={f.place_of_birth} onChange={(e) => upd('place_of_birth', e.target.value)} placeholder="Tempat lahir" className={inp} />
        <label className="text-[10px] text-slate-500">Tgl lahir<input autoComplete="off" type="date" value={f.birth_date || ''} onChange={(e) => upd('birth_date', e.target.value)} className={inp} /></label>
        <input autoComplete="off" value={f.passport_no} onChange={(e) => upd('passport_no', e.target.value)} placeholder="No. Paspor" className={inp} />
        <label className="text-[10px] text-slate-500">Tgl issue<input autoComplete="off" type="date" value={f.passport_issued_date || ''} onChange={(e) => upd('passport_issued_date', e.target.value)} className={inp} /></label>
        <input autoComplete="off" value={f.passport_issued_at} onChange={(e) => upd('passport_issued_at', e.target.value)} placeholder="Issuing office" className={inp} />
        <label className="text-[10px] text-slate-500">Tgl expired<input autoComplete="off" type="date" value={f.passport_expiry || ''} onChange={(e) => upd('passport_expiry', e.target.value)} className={inp} /></label>
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={save} disabled={pending} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-bold rounded">{pending ? 'Menyimpan…' : '💾 Simpan Paspor'}</button>
      </div>
    </div>
  );
}
