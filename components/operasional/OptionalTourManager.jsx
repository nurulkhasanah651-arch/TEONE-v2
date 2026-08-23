'use client';

// Optional Tour per Group — kelola katalog optional tour + centang peserta yang ikut
// + checklist status bayar. Dipakai di Master Trip (embed) & halaman Operasional.
// ADITIF: komponen baru, tidak menyentuh komponen lama.
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
    start(async () => { const r = await updateOptionalTour(t.id, { [field]: value }); if (r?.error) { setMsg('⚠ ' + r.error); return; } load(); });
  }
  function toggleJoin(tourId, passengerId, join) {
    // optimistik
    setData((d) => {
      if (!d) return d;
      const joins = { ...(d.joins || {}) };
      const m = { ...(joins[tourId] || {}) };
      if (join) m[passengerId] = { rowId: 'tmp', paid: false, note: '' }; else delete m[passengerId];
      joins[tourId] = m;
      return { ...d, joins };
    });
    start(async () => { const r = await toggleParticipant(tripId, tourId, passengerId, join); if (r?.error) { setMsg('⚠ ' + r.error); } load(); });
  }
  function togglePaid(tourId, passengerId, rowId, paid) {
    setData((d) => {
      if (!d) return d;
      const joins = { ...(d.joins || {}) };
      const m = { ...(joins[tourId] || {}) };
      if (m[passengerId]) m[passengerId] = { ...m[passengerId], paid };
      joins[tourId] = m; return { ...d, joins };
    });
    start(async () => { const r = await setParticipantPaid(rowId, paid); if (r?.error) { setMsg('⚠ ' + r.error); } load(); });
  }

  const wrapCls = embedded
    ? 'bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden'
    : 'bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden';

  if (loading && !data) {
    return <div className={wrapCls}><div className="px-5 py-4 text-sm text-slate-500">Memuat optional tour…</div></div>;
  }
  if (!data) {
    return <div className={wrapCls}><div className="px-5 py-4 text-sm text-rose-600">{msg || 'Gagal memuat.'}</div></div>;
  }

  const { tours, participants, joins } = data;

  return (
    <div className={wrapCls}>
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-bold text-brand-700">🎈 Optional Tour</h2>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[11px] text-slate-500">{msg}</span>}
          <button onClick={() => setShowAdd((v) => !v)} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white">
            {showAdd ? 'Tutup' : '+ Optional Tour'}
          </button>
        </div>
      </div>

      {/* Form tambah */}
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
              <input value={form.kurs} inputMode="numeric" onChange={(e) => setForm({ ...form, kurs: digits(e.target.value) })} placeholder="mis. 16000"
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right" />
            </div>
          )}
          <button type="submit" className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">Simpan</button>
        </form>
      )}

      {tours.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">Belum ada optional tour untuk group ini. Klik <b>+ Optional Tour</b> untuk menambah.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {tours.map((t) => {
            const jm = joins[t.id] || {};
            const joinIds = Object.keys(jm);
            const joinCount = joinIds.length;
            const paidCount = joinIds.filter((pid) => jm[pid]?.paid).length;
            return (
              <div key={t.id} className="px-4 py-3">
                {/* Header tour */}
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">{t.name}</span>
                    <span className="text-xs text-slate-500">· {money(t.price, t.currency)}/pax</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{joinCount} ikut</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{paidCount} paid</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">{joinCount - paidCount} belum</span>
                  </div>
                  <button onClick={() => doDelete(t)} className="text-[11px] text-rose-500 hover:text-rose-700 font-semibold">✕ hapus</button>
                </div>

                {/* Daftar peserta + checklist */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-[10px] uppercase text-slate-400">
                        <th className="text-left font-bold py-1 w-10">Ikut</th>
                        <th className="text-left font-bold py-1">Peserta</th>
                        <th className="text-center font-bold py-1 w-28">Status Bayar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {participants.map((p) => {
                        const j = jm[p.id];
                        const joined = !!j;
                        return (
                          <tr key={p.id} className={joined ? 'bg-brand-50/30' : ''}>
                            <td className="py-1.5">
                              <input type="checkbox" checked={joined} onChange={(e) => toggleJoin(t.id, p.id, e.target.checked)} />
                            </td>
                            <td className="py-1.5">
                              <span className={joined ? 'font-semibold text-slate-800' : 'text-slate-600'}>{p.name}</span>
                              {p.room_type && <span className="text-[10px] text-slate-400"> · {p.room_type}</span>}
                            </td>
                            <td className="py-1.5 text-center">
                              {joined ? (
                                <button onClick={() => togglePaid(t.id, p.id, j.rowId, !j.paid)} disabled={j.rowId === 'tmp'}
                                  className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${j.paid
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border-amber-200'} disabled:opacity-50`}>
                                  {j.paid ? '✓ Sudah bayar' : '○ Belum bayar'}
                                </button>
                              ) : <span className="text-[11px] text-slate-300">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                      {participants.length === 0 && (
                        <tr><td colSpan={3} className="py-4 text-center text-slate-400 text-xs">Belum ada peserta aktif di group ini.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
