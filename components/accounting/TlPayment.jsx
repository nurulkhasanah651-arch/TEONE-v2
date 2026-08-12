'use client';
// Pencairan Gaji TL (Accounting) + Reminder Payment TL (H-3) di dashboard.
// Sumber data: getTlPlotting() (gabungan trip TE + KT), memakai flag tl_gaji70 / tl_gaji30 /
// tl_konten_approved di Master Trip. Aturan: 30% terkunci sampai konten di-approve.
import { useState, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { setTlPayFlag } from '@/lib/actions/tl-plotting';

const MONSHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BR = { TE: 'bg-blue-100 text-blue-700', KT: 'bg-emerald-100 text-emerald-700' };

function d(x) { if (!x) return null; const dt = new Date(String(x).slice(0, 10) + 'T00:00:00'); return isNaN(dt) ? null : dt; }
function fmt(x) { const dt = d(x); return dt ? `${dt.getDate()} ${MONSHORT[dt.getMonth()]}` : '—'; }
function masterUrl(t) { return t.brand === 'KT' ? `https://khasanahtravel.app/trips/${t.id}` : `/trips/${t.id}`; }
// Sisa hari ke keberangkatan berdasarkan tanggal WIB
function daysToDep(departure) {
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) + 'T00:00:00');
  const dep = d(departure);
  if (!dep) return null;
  return Math.round((dep - today) / 86400000);
}

// ============ REMINDER (dashboard) ============
// items: trip yg berangkat ≤ H-3 dan 70% BELUM dibayar. Centang "Sudah dibayar" → hilang.
export function TlPaymentReminder({ items = [] }) {
  const [list, setList] = useState(items);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  if (!list.length) return null;

  function markPaid(it) {
    setErr(''); setBusy(it.brand + it.id);
    start(async () => {
      const r = await setTlPayFlag(it.brand, it.id, '70', true);
      setBusy('');
      if (r?.ok) setList((l) => l.filter((x) => !(x.brand === it.brand && x.id === it.id)));
      else setErr(r?.error || 'Gagal menandai');
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-red-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-red-700 flex items-center gap-2">
          ⏰ REMINDER PAYMENT TL
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">{list.length}</span>
        </h2>
        <Link href="/accounting/tl-payment" className="text-[11px] font-semibold px-3 py-1 rounded bg-red-100 hover:bg-red-200 text-red-700">
          Buka Pencairan Gaji TL →
        </Link>
      </div>
      <p className="px-5 pt-2 text-[11px] text-slate-500">Trip berangkat ≤ 3 hari lagi (H-3) yang gaji TL-nya belum dibayar. Centang setelah ditransfer.</p>
      <div className="divide-y divide-slate-100">
        {list.map((it) => {
          const sisa = daysToDep(it.departure);
          const sisaLbl = sisa === 0 ? 'HARI INI' : sisa === 1 ? 'H-1 (besok)' : sisa < 0 ? 'LEWAT' : `H-${sisa}`;
          return (
            <div key={it.brand + it.id} className="px-5 py-2.5 flex items-center gap-3 flex-wrap hover:bg-slate-50">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BR[it.brand]}`}>{it.brand}</span>
              <a href={masterUrl(it)} target={it.brand === 'KT' ? '_blank' : undefined} rel="noreferrer" className="text-xs font-mono font-bold text-brand-700 hover:underline">{it.kode}</a>
              <span className="flex-1 min-w-[120px] text-sm text-slate-700 truncate">{it.name}</span>
              <span className="text-xs text-slate-500">👤 {it.tl || '—'}</span>
              <span className="text-[11px] text-slate-500 whitespace-nowrap">{fmt(it.departure)}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sisa <= 1 ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-700'}`}>{sisaLbl}</span>
              <button onClick={() => markPaid(it)} disabled={pending}
                className="text-[11px] font-bold px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50">
                {busy === it.brand + it.id ? '…' : '✓ Sudah dibayar'}
              </button>
            </div>
          );
        })}
      </div>
      {err && <p className="px-5 py-2 text-[11px] text-rose-600">⚠ {err}</p>}
    </div>
  );
}

// ============ PAPAN PENCAIRAN (halaman /accounting/tl-payment) ============
export default function TlPaymentBoard({ trips = [], tlOptions = [] }) {
  const [q, setQ] = useState('');
  const [onlyUpcoming, setOnlyUpcoming] = useState(true);

  // Hanya trip yg sudah ada rencana/penugasan TL
  const withTl = useMemo(() => {
    return trips
      .map((t) => ({ ...t, who: (t.tl_plan || t.tl || '').trim() }))
      .filter((t) => t.who);
  }, [trips]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = withTl;
    if (onlyUpcoming) list = list.filter((t) => { const dd = daysToDep(t.departure); return dd == null || dd >= -1; });
    if (s) list = list.filter((t) => `${t.kode} ${t.name} ${t.who}`.toLowerCase().includes(s));
    return list;
  }, [withTl, q, onlyUpcoming]);

  // Group per TL
  const byTl = useMemo(() => {
    const m = {};
    for (const t of filtered) (m[t.who] = m[t.who] || []).push(t);
    for (const k in m) m[k].sort((a, b) => (d(a.departure) - d(b.departure)));
    return m;
  }, [filtered]);
  const names = Object.keys(byTl).sort((a, b) => a.localeCompare(b));

  // Ringkasan
  const totalTrip = filtered.length;
  const belum70 = filtered.filter((t) => !t.gaji70).length;
  const belum30 = filtered.filter((t) => !t.gaji30).length;

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">💵 Pencairan Gaji TL</h1>
          <p className="text-sm text-slate-500">Semua Tour Leader (TE + KT) beserta jadwal trip-nya. Centang saat gaji ditransfer.</p>
        </div>
        <Link href="/accounting" className="text-sm text-slate-500 hover:underline">← Kembali ke Accounting</Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3"><p className="text-[10px] font-bold text-slate-500 uppercase">Trip aktif</p><p className="text-xl font-bold text-brand-700">{totalTrip}</p></div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-3"><p className="text-[10px] font-bold text-amber-700 uppercase">Belum bayar 70%</p><p className="text-xl font-bold text-amber-700">{belum70}</p></div>
        <div className="bg-orange-50 rounded-xl border border-orange-200 p-3"><p className="text-[10px] font-bold text-orange-700 uppercase">Belum bayar 30%</p><p className="text-xl font-bold text-orange-700">{belum30}</p></div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari TL / trip / kode…" className="flex-1 min-w-[200px] px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={onlyUpcoming} onChange={(e) => setOnlyUpcoming(e.target.checked)} className="w-4 h-4" /> Hanya trip mendatang
        </label>
      </div>

      {names.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-10">Tidak ada TL/trip yang cocok.</p>
      ) : names.map((nm) => (
        <div key={nm} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
            <span className="font-bold text-slate-800">👤 {nm}</span>
            <span className="text-[11px] text-slate-400">{byTl[nm].length} trip</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-white text-[11px] font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Trip</th>
                  <th className="px-3 py-2 text-left">Berangkat</th>
                  <th className="px-3 py-2 text-center">Status</th>
                  <th className="px-3 py-2 text-center">Gaji 70% (H-1)</th>
                  <th className="px-3 py-2 text-center">Konten approve</th>
                  <th className="px-3 py-2 text-center">Gaji 30%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {byTl[nm].map((t) => <PayRow key={t.brand + t.id} t={t} />)}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function PayRow({ t }) {
  const [g70, setG70] = useState(!!t.gaji70);
  const [g30, setG30] = useState(!!t.gaji30);
  const [kOk, setKOk] = useState(!!t.konten_approved);
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  const sisa = daysToDep(t.departure);
  const sisaLbl = sisa == null ? '' : sisa === 0 ? 'HARI INI' : sisa === 1 ? 'H-1' : sisa < 0 ? 'selesai' : `H-${sisa}`;

  function togglePay(field, next) {
    setErr('');
    if (field === '70') setG70(next);
    if (field === 'konten') { setKOk(next); if (!next) setG30(false); }
    if (field === '30') { if (next && !kOk) { setErr('Konten belum approve'); return; } setG30(next); }
    start(async () => {
      const r = await setTlPayFlag(t.brand, t.id, field, next);
      if (r?.error) {
        setErr(r.error);
        if (field === '70') setG70(!next);
        if (field === 'konten') setKOk(!next);
        if (field === '30') setG30(!next);
      }
    });
  }

  const bothPaid = g70 && g30;
  return (
    <tr className={`align-middle ${bothPaid ? 'bg-emerald-50/40' : ''}`}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BR[t.brand]}`}>{t.brand}</span>
          <a href={masterUrl(t)} target={t.brand === 'KT' ? '_blank' : undefined} rel="noreferrer" className="text-xs font-mono font-bold text-brand-700 hover:underline">{t.kode}</a>
        </div>
        <div className="text-[11px] text-slate-600 max-w-[220px] truncate">{t.name || t.kategori}</div>
      </td>
      <td className="px-3 py-2 text-[11px] text-slate-500 whitespace-nowrap">
        {fmt(t.departure)} – {fmt(t.return_date)}
        {sisaLbl && <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${sisa != null && sisa >= 0 && sisa <= 3 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{sisaLbl}</span>}
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {bothPaid ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">✓ Lunas</span>
          : g70 ? <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-700">70% dibayar</span>
          : <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">Belum bayar</span>}
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={g70} disabled={pending} onChange={(e) => togglePay('70', e.target.checked)} className="w-4 h-4 cursor-pointer" />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={kOk} disabled={pending} onChange={(e) => togglePay('konten', e.target.checked)} className="w-4 h-4 cursor-pointer" />
      </td>
      <td className="px-3 py-2 text-center">
        <input type="checkbox" checked={g30} disabled={pending || !kOk} onChange={(e) => togglePay('30', e.target.checked)}
          title={kOk ? '' : 'Konten harus di-approve dulu'} className={`w-4 h-4 ${kOk ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}`} />
        {err && <div className="text-[10px] text-rose-600 mt-0.5">⚠ {err}</div>}
      </td>
    </tr>
  );
}
