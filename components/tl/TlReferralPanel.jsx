'use client';
// Panel input self-report peserta yang dibawa TL (nama + trip). Untuk penilaian TL.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTlReferral, deleteTlReferral } from '@/lib/actions/tl-referral';

function fmtDate(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); } catch { return ''; }
}

export default function TlReferralPanel({ tripOptions = [], initialReferrals = [] }) {
  const router = useRouter();
  const [nama, setNama] = useState('');
  const [trip, setTrip] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [pending, start] = useTransition();

  function submit(e) {
    e.preventDefault();
    setErr(''); setOk('');
    if (!nama.trim()) { setErr('Nama peserta wajib diisi'); return; }
    start(async () => {
      const r = await addTlReferral(nama.trim(), trip.trim());
      if (r?.ok) { setNama(''); setTrip(''); setOk('Tersimpan'); router.refresh(); setTimeout(() => setOk(''), 2000); }
      else setErr(r?.error || 'Gagal simpan');
    });
  }
  function hapus(id) {
    if (!confirm('Hapus data ini?')) return;
    start(async () => {
      const r = await deleteTlReferral(id);
      if (r?.ok) router.refresh();
      else setErr(r?.error || 'Gagal hapus');
    });
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-emerald-50">
        <h2 className="font-bold text-emerald-800">Peserta yang Kamu Ajak (Self-Report)</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Catat peserta yang berhasil kamu ajak daftar - untuk penilaian performa TL. Bulan ini: <b>{initialReferrals.length} peserta</b>.
          <br />Ini hanya perhitungan TL, bukan data pendaftaran resmi (peserta tetap diinput CS).
        </p>
      </div>

      <form onSubmit={submit} className="px-5 py-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end border-b border-slate-100">
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Nama Peserta</label>
          <input value={nama} onChange={(e) => setNama(e.target.value)} disabled={pending}
            placeholder="Nama peserta yang kamu ajak" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-slate-600 mb-1">Trip (pilih / ketik)</label>
          <input value={trip} onChange={(e) => setTrip(e.target.value)} disabled={pending}
            list="tl-referral-trips" placeholder="Pilih dari daftar atau ketik bebas" className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <datalist id="tl-referral-trips">
            {tripOptions.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>
        <button type="submit" disabled={pending}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 whitespace-nowrap">
          {pending ? '...' : '+ Tambah'}
        </button>
      </form>
      {(err || ok) && (
        <div className={`px-5 py-1.5 text-xs ${err ? 'text-rose-600' : 'text-emerald-600'}`}>{err || ok}</div>
      )}

      {initialReferrals.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">Belum ada data bulan ini.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {initialReferrals.map((r) => (
            <li key={r.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
              <span className="text-slate-400 text-xs w-12 shrink-0">{fmtDate(r.created_at)}</span>
              <span className="flex-1 min-w-0">
                <span className="font-semibold text-slate-800">{r.participant_name}</span>
                {r.trip_label && <span className="text-slate-500"> - {r.trip_label}</span>}
              </span>
              <button onClick={() => hapus(r.id)} disabled={pending} className="text-xs text-rose-500 hover:text-rose-700 shrink-0">Hapus</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
