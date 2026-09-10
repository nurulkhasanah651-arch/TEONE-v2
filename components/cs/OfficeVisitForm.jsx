'use client';

// Input kunjungan kantor harian (orang yang datang ke kantor): Serpong, Bandung, Jogja.
// Upsert by tanggal. Menampilkan juga riwayat beberapa hari terakhir + total.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { upsertOfficeVisits } from '@/lib/actions/office-visits';

function fmtTgl(s) {
  if (!s) return '';
  try { return new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short', day: '2-digit', month: 'short' }); }
  catch { return s; }
}

const OFFICES = [
  { key: 'serpong', label: '🏢 Kantor Serpong' },
  { key: 'bandung', label: '🏢 Bandung' },
  { key: 'jogja', label: '🏢 Jogja' },
];

export default function OfficeVisitForm({ today, todayRow = null, history = [] }) {
  const router = useRouter();
  const [tanggal, setTanggal] = useState(today);
  const [serpong, setSerpong] = useState(0);
  const [bandung, setBandung] = useState(0);
  const [jogja, setJogja] = useState(0);
  const [notes, setNotes] = useState('');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Prefill kalau tanggal yang dipilih sudah ada datanya (dari history).
  useEffect(() => {
    const row = tanggal === today ? todayRow : (history.find((h) => h.tanggal === tanggal) || null);
    setSerpong(row?.serpong || 0);
    setBandung(row?.bandung || 0);
    setJogja(row?.jogja || 0);
    setNotes(row?.notes || '');
  }, [tanggal, today, todayRow, history]);

  const total = (+serpong || 0) + (+bandung || 0) + (+jogja || 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setPending(true); setErr(''); setMsg('');
    const fd = new FormData();
    fd.set('tanggal', tanggal);
    fd.set('serpong', String(serpong || 0));
    fd.set('bandung', String(bandung || 0));
    fd.set('jogja', String(jogja || 0));
    fd.set('notes', notes || '');
    const r = await upsertOfficeVisits(fd);
    setPending(false);
    if (r?.error) { setErr(r.error); return; }
    setMsg('Tersimpan');
    router.refresh();
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="border border-brand-200 rounded-xl p-4 bg-brand-50/30 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">Kunjungan Kantor Hari Ini</p>
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Tanggal</span>
            <input autoComplete="off" type="date" value={tanggal} max={today}
              onChange={(e) => setTanggal(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white" />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <NumberInput label={OFFICES[0].label} value={serpong} onChange={setSerpong} />
          <NumberInput label={OFFICES[1].label} value={bandung} onChange={setBandung} />
          <NumberInput label={OFFICES[2].label} value={jogja} onChange={setJogja} />
        </div>

        <div className="flex items-center justify-between p-2 rounded-lg bg-brand-100">
          <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">Total Datang ke Kantor</span>
          <span className="text-xl font-bold text-brand-700">{total} orang</span>
        </div>

        <input autoComplete="off" type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Catatan (opsional)..." className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white" />

        {err && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">{err}</div>}
        {msg && <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700 font-medium">{msg}</div>}

        <button type="submit" disabled={pending}
          className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
          {pending ? 'Menyimpan...' : 'Simpan Kunjungan Kantor'}
        </button>
      </form>

      {history.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y border-slate-200 text-[11px] font-bold text-slate-600 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Tanggal</th>
                <th className="px-3 py-2 text-center">Serpong</th>
                <th className="px-3 py-2 text-center">Bandung</th>
                <th className="px-3 py-2 text-center">Jogja</th>
                <th className="px-3 py-2 text-center">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((h) => {
                const t = (h.serpong || 0) + (h.bandung || 0) + (h.jogja || 0);
                return (
                  <tr key={h.tanggal} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-700">{fmtTgl(h.tanggal)}</td>
                    <td className="px-3 py-2 text-center">{h.serpong || 0}</td>
                    <td className="px-3 py-2 text-center">{h.bandung || 0}</td>
                    <td className="px-3 py-2 text-center">{h.jogja || 0}</td>
                    <td className="px-3 py-2 text-center font-bold text-brand-700">{t}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NumberInput({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-0.5">{label}</span>
      <input autoComplete="off" type="number" value={value} min="0"
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()}
        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none" />
    </label>
  );
}
