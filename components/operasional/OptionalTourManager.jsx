'use client';

// Optional Tour per Group — MODEL MATRIKS (mirip checklist Finance):
// nama peserta 1x per baris, tiap optional tour jadi KOLOM (mis. Tilis, Balon, dll),
// tiap sel = centang ikut + toggle Belum/Lunas. Ringkas walau 2-4 optional tour.
// ADITIF: komponen ini saja yang berubah; server action & tabel tetap sama.
// Path: components/operasional/OptionalTourManager.jsx

import { useEffect, useState, useTransition } from 'react';
import {
  getTripOptionalTours, addOptionalTour, updateOptionalTour, deleteOptionalTour,
  toggleParticipant, setParticipantPaid,
} from '@/lib/actions/optional-tours';

const CUR = ['IDR', 'USD'];

export default function OptionalTourManager({ tripId, embedded = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', price: '', currency: 'IDR', kurs: '' });

  async function load() {
    setLoading(true);
    const r = await getTripOptionalTours(tripId);
    setLoading(false);
    if (r?.error) { setMsg('⚠ ' + r.error); return; }
    setData(r);
  }
  useEffect(() => { if (tripId) load(); /* eslint-disable-next-line */ }, [tripId]);

  const money = (n, cur) => (cur === 'USD' ? 'USD ' : 'Rp ') + (Math.round(Number(n) || 0)).toLocaleString('id-ID');
  const digits = (v) => String(v).replace(/[^0-9]/g, '');

  function doAdd(e) {
    e?.preventDefault();
    if (!form.name.trim()) { setMsg('⚠ Nama optional tour wajib diisi'); return; }
    start(async () => {
      const r = await addOptionalTour(tripId, form);
      if (r?.error) { setMsg('⚠ ' + r.error); return; }
      setForm({ name: '', price: '', currency: 'IDR', kurs: '' }); setShowAdd(false); setMsg('✓ Optional tour ditambah'); load();
    });
  }
  function doDelete(t) {
    if (!confirm(`Hapus optional tour "${t.name}"? Semua data peserta ikutannya ikut terhapus.`)) return;
    start(async () => { const r = await deleteOptionalTour(t.id); if (r?.error) { setMsg('⚠ ' + r.error); return; } setMsg('✓ Dihapus'); load(); });
  }
  function saveTourField(t, field, value) {
    const cur = field === 'price' ? Number(t.price) || 0 : t[field];
    const nv = field === 'price' ? Number(value) || 0 : value;
    if (String(cur) === String(nv)) return; // tak berubah
    start(async () => { const r = await updateOptionalTour(t.id, { [field]: nv }); if (r?.error) { setMsg('⚠ ' + r.error); load(); return; } setMsg('✓ Tersimpan'); load(); });
  }
  function toggleJoin(tourId, passengerId, join) {
    setData((d) => {
      if (!d) return d;
      const joins = { ...(d.joins || {}) };
      const m = { ...(joins[tourId] || {}) };
      if (join) m[passengerId] = { rowId: 'tmp', paid: false, note: '' }; else delete m[passengerId];
      joins[tourId] = m; return { ...d, joins };
    });
    start(async () => { const r = await toggleParticipant(tripId, tourId, passengerId, join); if (r?.error) setMsg('⚠ ' + r.error); load(); });
  }
  function togglePaid(tourId, passengerId, rowId, paid) {
    setData((d) => {
      if (!d) return d;
      const joins = { ...(d.joins || {}) };
      const m = { ...(joins[tourId] || {}) };
      if (m[passengerId]) m[passengerId] = { ...m[passengerId], paid };
      joins[tourId] = m; return { ...d, joins };
    });
    start(async () => { const r = await setParticipantPaid(rowId, paid); if (r?.error) setMsg('⚠ ' + r.error); load(); });
  }

  const wrapCls = 'bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden';
  if (loading && !data) return <div className={wrapCls}><div className="px-5 py-4 text-sm text-slate-500">Memuat optional tour…</div></div>;
  if (!data) return <div className={wrapCls}><div className="px-5 py-4 text-sm text-rose-600">{msg || 'Gagal memuat.'}</div></div>;

  const { tours, participants, joins } = data;
  const sticky = { position: 'sticky', left: 0, zIndex: 1 };

  // Ringkasan per tour
  const summary = (t) => {
    const jm = joins[t.id] || {};
    const ids = Object.keys(jm);
    const ikut = ids.length;
    const paid = ids.filter((pid) => jm[pid]?.paid).length;
    return { ikut, paid };
  };

  return (
    <div className={wrapCls}>
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-bold text-brand-700">🎈 Optional Tour</h2>
          <p className="text-[11px] text-slate-500">Centang peserta yang ikut tiap optional tour, lalu tandai Lunas kalau sudah bayar.</p>
        </div>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[11px] text-slate-500">{msg}</span>}
          <button onClick={() => setShowAdd((v) => !v)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white">
            {showAdd ? 'Tutup' : '+ Optional Tour'}
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={doAdd} className="px-5 py-3 border-b border-slate-100 bg-brand-50/40 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Nama Optional Tour</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="mis. Hot Air Balloon"
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
          </div>
          <div className="w-28">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Harga</label>
            <input value={form.price} inputMode="numeric" onChange={(e) => setForm({ ...form, price: digits(e.target.value) })} placeholder="0"
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right" />
          </div>
          <div className="w-20">
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Mata Uang</label>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white">
              {CUR.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {form.currency === 'USD' && (
            <div className="w-24">
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Kurs</label>
              <input value={form.kurs} inputMode="numeric" onChange={(e) => setForm({ ...form, kurs: digits(e.target.value) })} placeholder="16000"
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right" />
            </div>
          )}
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">Simpan</button>
        </form>
      )}

      {tours.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada optional tour untuk group ini. Klik <b>+ Optional Tour</b> untuk menambah.</p>
      ) : participants.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada peserta aktif di group ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse" style={{ minWidth: 320 + tours.length * 132 }}>
            <thead>
              <tr className="bg-slate-50">
                <th style={{ ...sticky, background: '#f8fafc' }} className="text-left px-3 py-2 border-b border-r border-slate-200 min-w-[220px]">
                  <span className="text-[11px] font-bold uppercase text-slate-500">Peserta ({participants.length})</span>
                </th>
                {tours.map((t) => {
                  const s = summary(t);
                  return (
                    <th key={t.id} className="px-2 py-2 border-b border-slate-200 align-top min-w-[130px]">
                      <div className="flex items-start justify-between gap-1">
                        <input defaultValue={t.name} onBlur={(e) => saveTourField(t, 'name', e.target.value.trim() || t.name)}
                          className="w-full font-bold text-slate-800 text-[13px] bg-transparent border-0 border-b border-dashed border-transparent hover:border-slate-300 focus:border-brand-400 focus:outline-none px-0 py-0.5" />
                        <button onClick={() => doDelete(t)} title="Hapus optional tour" className="text-rose-400 hover:text-rose-600 text-xs shrink-0">✕</button>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] text-slate-400">{t.currency}</span>
                        <input defaultValue={t.price || ''} inputMode="numeric" placeholder="0"
                          onBlur={(e) => saveTourField(t, 'price', digits(e.target.value))}
                          className="w-full text-right text-[11px] text-slate-600 bg-transparent border-0 border-b border-dashed border-transparent hover:border-slate-300 focus:border-brand-400 focus:outline-none px-0" />
                      </div>
                      <div className="mt-1 text-[10px] font-semibold">
                        <span className="text-slate-500">{s.ikut} ikut</span> · <span className="text-emerald-600">{s.paid} lunas</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {participants.map((p, ri) => (
                <tr key={p.id} className={ri % 2 ? 'bg-slate-50/40' : ''}>
                  <td style={{ ...sticky, background: ri % 2 ? '#fbfcfd' : '#ffffff' }} className="px-3 py-1.5 border-b border-r border-slate-100">
                    <span className="text-[13px] font-medium text-slate-800">{p.name}</span>
                    {p.room_type && <span className="block text-[10px] text-slate-400">{p.room_type}</span>}
                  </td>
                  {tours.map((t) => {
                    const j = (joins[t.id] || {})[p.id];
                    const joined = !!j;
                    return (
                      <td key={t.id} className="px-2 py-1.5 border-b border-slate-100 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <input type="checkbox" checked={joined} onChange={(e) => toggleJoin(t.id, p.id, e.target.checked)} title="Ikut optional tour ini" />
                          {joined && (
                            <button onClick={() => togglePaid(t.id, p.id, j.rowId, !j.paid)} disabled={j.rowId === 'tmp'}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${j.paid
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'} disabled:opacity-40`}>
                              {j.paid ? '✓ Lunas' : 'Belum'}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tours.length > 0 && participants.length > 0 && (
        <div className="px-5 py-2 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
          <span>☑ centang = peserta ikut</span>
          <span><span className="font-bold text-amber-700">Belum</span> / <span className="font-bold text-emerald-700">✓ Lunas</span> = status bayar (klik untuk ubah)</span>
          <span className="text-slate-400">Nama optional tour &amp; harga bisa diklik langsung untuk diedit.</span>
        </div>
      )}
    </div>
  );
}
