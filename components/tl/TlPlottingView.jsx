'use client';
import { useState, useMemo, useTransition } from 'react';
import { setTlPlan, finalPlotTl, resendTlAssignmentWA } from '@/lib/actions/tl-plotting';

const MON = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const MONSHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const BR = { TE: { label: 'TE', cls: 'bg-blue-100 text-blue-700' }, KT: { label: 'KT', cls: 'bg-emerald-100 text-emerald-700' } };

function d(x) { if (!x) return null; const dt = new Date(String(x) + 'T00:00:00'); return isNaN(dt) ? null : dt; }
function fmt(x) { const dt = d(x); return dt ? `${dt.getDate()} ${MONSHORT[dt.getMonth()]}` : '—'; }
function monthKey(x) { const dt = d(x); return dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : 'zzz'; }
// warna stabil per TL
function tlColor(name) {
  if (!name) return 'bg-slate-100 text-slate-500 border-slate-200';
  const palette = ['bg-rose-100 text-rose-700 border-rose-200','bg-amber-100 text-amber-800 border-amber-200','bg-lime-100 text-lime-800 border-lime-200','bg-teal-100 text-teal-700 border-teal-200','bg-sky-100 text-sky-700 border-sky-200','bg-violet-100 text-violet-700 border-violet-200','bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200','bg-orange-100 text-orange-700 border-orange-200','bg-cyan-100 text-cyan-700 border-cyan-200','bg-indigo-100 text-indigo-700 border-indigo-200'];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
function masterUrl(t) { return t.brand === 'KT' ? `https://khasanahtravel.app/trips/${t.id}` : `/trips/${t.id}`; }
function overlaps(a, b) {
  const a1 = d(a.departure), a2 = d(a.return_date) || d(a.departure);
  const b1 = d(b.departure), b2 = d(b.return_date) || d(b.departure);
  if (!a1 || !b1) return false;
  return a1 <= (b2 || b1) && b1 <= (a2 || a1);
}

export default function TlPlottingView({ trips = [], tlOptions = [] }) {
  const [tab, setTab] = useState('cards');
  const [brand, setBrand] = useState('all');
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return trips.filter((t) => {
      if (brand !== 'all' && t.brand !== brand) return false;
      if (!s) return true;
      return `${t.kode} ${t.name} ${t.kategori} ${t.tl}`.toLowerCase().includes(s);
    });
  }, [trips, brand, q]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <datalist id="tl-plan-options">{tlOptions.map((n) => <option key={n} value={n} />)}</datalist>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">🗺 Plotting TL</h1>
          <p className="text-sm text-slate-500">Rencana penugasan Tour Leader gabungan TEONE (TE) + Khasanah (KT).</p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-[13px] text-amber-800">
        ⚠️ Ini <b>rencana plotting (belum final)</b>. Isi <b>nama TL rencana</b> di tab “Rencana Plot” (draft, belum menyentuh Master Trip). Klik <b>Final Plot</b> untuk mendorong nama itu ke <b>Master Trip</b>. Penugasan resmi/undangan WA tetap dilakukan di Master Trip.
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto">
          {[['cards','📝 Rencana Plot'],['calendar','📅 Kalender TL'],['bytl','📋 Jadwal per TL']].map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md text-sm font-bold whitespace-nowrap ${tab===k?'bg-white text-brand-700 shadow-sm':'text-slate-500'}`}>{l}</button>
          ))}
        </div>
        <select value={brand} onChange={(e)=>setBrand(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm">
          <option value="all">Semua brand</option><option value="TE">TE (Traveling Eropa)</option><option value="KT">KT (Khasanah)</option>
        </select>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Cari trip / kategori / TL…" className="flex-1 min-w-[180px] px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
      </div>

      {tab === 'cards' && <CardsSection trips={filtered} />}
      {tab === 'calendar' && <CalendarSection trips={filtered} />}
      {tab === 'bytl' && <ByTlSection trips={filtered} />}
    </div>
  );
}

// ── 1) RENCANA PLOT (list trip + isi nama TL draft + Final Plot) ──
function CardsSection({ trips }) {
  const byMonth = useMemo(() => {
    const m = {};
    for (const t of trips) (m[monthKey(t.departure)] = m[monthKey(t.departure)] || []).push(t);
    return m;
  }, [trips]);
  const months = Object.keys(byMonth).sort();
  if (!months.length) return <p className="text-center text-sm text-slate-400 py-10">Tidak ada trip.</p>;
  return (
    <div className="space-y-5">
      {months.map((mk) => {
        const [y, mo] = mk.split('-');
        const list = byMonth[mk].sort((a,b)=> (d(a.departure)-d(b.departure)) || a.brand.localeCompare(b.brand));
        return (
          <div key={mk}>
            <h2 className="text-sm font-extrabold text-slate-700 mb-2">📍 {MON[Number(mo)-1]} {y} <span className="text-slate-400 font-normal">· {list.length} trip</span></h2>
            <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Trip</th>
                    <th className="px-3 py-2 text-left">Tanggal</th>
                    <th className="px-3 py-2 text-center">Seat</th>
                    <th className="px-3 py-2 text-left">Rencana TL (draft)</th>
                    <th className="px-3 py-2 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((t) => <PlotRow key={t.brand+t.id} t={t} />)}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlotRow({ t }) {
  const [name, setName] = useState(t.tl_plan || t.tl || '');
  const [saved, setSaved] = useState('');
  const [connected, setConnected] = useState(t.connected);
  const [connName, setConnName] = useState(t.tl || '');
  const [err, setErr] = useState('');
  const [pending, start] = useTransition();

  function saveDraft() {
    if ((name || '').trim() === (t.tl_plan || '').trim()) return;
    start(async () => {
      const r = await setTlPlan(t.brand, t.id, name);
      if (r?.ok) { setSaved('draft tersimpan'); setTimeout(()=>setSaved(''), 1500); } else setErr(r?.error || 'gagal simpan');
    });
  }
  function doFinal() {
    if (!(name || '').trim()) { setErr('Isi nama TL dulu'); return; }
    setErr('');
    start(async () => {
      const r1 = await setTlPlan(t.brand, t.id, name);
      if (r1?.error) { setErr(r1.error); return; }
      const r = await finalPlotTl(t.brand, t.id);
      if (r?.ok) { setConnected(true); setConnName(r.tl_name); }
      else setErr(r?.error || 'gagal final');
    });
  }
  const [wa, setWa] = useState('');
  function resendWA() {
    const who = connName || t.tl || 'TL';
    if (!confirm(`Kirim ulang WA konfirmasi ke ${who} untuk trip ${t.kode}?`)) return;
    setErr(''); setWa('…');
    start(async () => {
      const r = await resendTlAssignmentWA(t.brand, t.id);
      if (r?.ok) { setWa('terkirim ✓'); setTimeout(()=>setWa(''), 3000); }
      else { setWa(''); setErr(r?.error || 'gagal kirim WA'); }
    });
  }

  return (
    <tr className="hover:bg-slate-50 align-middle">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BR[t.brand].cls}`}>{t.brand}</span>
          <a href={masterUrl(t)} target={t.brand==='KT'?'_blank':undefined} rel="noreferrer" className="text-xs font-mono font-bold text-brand-700 hover:underline">{t.kode}</a>
        </div>
        <div className="text-[11px] text-slate-600 max-w-[240px] truncate">{t.name || t.kategori}</div>
      </td>
      <td className="px-3 py-2 text-[11px] text-slate-500 whitespace-nowrap">{fmt(t.departure)} – {fmt(t.return_date)}</td>
      <td className="px-3 py-2 text-center text-xs whitespace-nowrap">{t.terisi}/{t.seat}</td>
      <td className="px-3 py-2">
        <input value={name} onChange={(e)=>setName(e.target.value)} onBlur={saveDraft} disabled={pending}
          list="tl-plan-options" placeholder="pilih / ketik nama TL…" className="w-full max-w-[200px] px-2 py-1.5 border border-slate-300 rounded text-xs disabled:opacity-50" />
        {saved && <div className="text-[10px] text-emerald-600 mt-0.5">✓ {saved}</div>}
        {err && <div className="text-[10px] text-rose-600 mt-0.5">⚠ {err}</div>}
      </td>
      <td className="px-3 py-2 text-center whitespace-nowrap">
        {connected ? (
          <div className="text-[11px]">
            <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">✓ Final: {connName}</span>
            <div className="mt-1 flex items-center justify-center gap-2">
              <button onClick={doFinal} disabled={pending} className="text-[10px] text-slate-400 hover:text-slate-600 underline">update lagi</button>
              <button onClick={resendWA} disabled={pending} className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50">{wa || '📲 Kirim WA'}</button>
            </div>
          </div>
        ) : (
          <button onClick={doFinal} disabled={pending}
            className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold disabled:opacity-50">
            {pending ? '…' : '✔ Final Plot'}
          </button>
        )}
      </td>
    </tr>
  );
}

// ── 2) KALENDER TL (grid bulanan, chip per trip di tanggal berangkat) ──
function CalendarSection({ trips }) {
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`);
  const [y, mo] = ym.split('-').map(Number);
  const first = new Date(y, mo-1, 1);
  const startDow = first.getDay();
  const dim = new Date(y, mo, 0).getDate();
  const byDay = useMemo(() => {
    const m = {};
    for (const t of trips) { const dt = d(t.departure); if (dt && dt.getFullYear()===y && dt.getMonth()===mo-1) (m[dt.getDate()]=m[dt.getDate()]||[]).push(t); }
    return m;
  }, [trips, ym]);
  const cells = []; for (let i=0;i<startDow;i++) cells.push(null); for (let day=1;day<=dim;day++) cells.push(day);
  const prev=()=>{ const dt=new Date(y,mo-2,1); setYm(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`); };
  const next=()=>{ const dt=new Date(y,mo,1); setYm(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`); };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <button onClick={prev} className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 text-sm">←</button>
        <h2 className="font-bold text-slate-800">{MON[mo-1]} {y}</h2>
        <button onClick={next} className="px-3 py-1 rounded border border-slate-200 hover:bg-slate-50 text-sm">→</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-[10px] font-bold text-slate-400 mb-1">
        {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map((w)=><div key={w} className="text-center">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div key={i} className={`min-h-[72px] rounded border ${day?'border-slate-100':'border-transparent'} p-1`}>
            {day && <div className="text-[10px] text-slate-400 mb-0.5">{day}</div>}
            {(byDay[day]||[]).map((t)=>(
              <a key={t.brand+t.id} href={masterUrl(t)} target={t.brand==='KT'?'_blank':undefined} rel="noreferrer"
                title={`${t.kode} ${t.name} · TL ${(t.tl_plan||t.tl)||'-'} · s/d ${fmt(t.return_date)}`}
                className={`block text-[10px] leading-tight px-1 py-0.5 rounded mb-0.5 border ${tlColor(t.tl_plan||t.tl)} truncate`}>
                {t.kode} · {(t.tl_plan||t.tl) || 'TL?'}
              </a>
            ))}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Chip diletakkan di tanggal keberangkatan, warna per TL. Hover untuk detail. Klik → Master Trip.</p>
    </div>
  );
}

// ── 3) JADWAL PER TL (grup TL + deteksi bentrok) ──
function ByTlSection({ trips }) {
  const byTl = useMemo(() => {
    const m = {};
    for (const t of trips) { const k = (t.tl_plan || t.tl) || '— Belum ada TL —'; (m[k]=m[k]||[]).push(t); }
    for (const k in m) m[k].sort((a,b)=> d(a.departure)-d(b.departure));
    return m;
  }, [trips]);
  const names = Object.keys(byTl).sort((a,b)=> a.localeCompare(b));
  if (!names.length) return <p className="text-center text-sm text-slate-400 py-10">Tidak ada trip.</p>;
  return (
    <div className="space-y-3">
      {names.map((nm) => {
        const list = byTl[nm];
        const conflictIds = new Set();
        for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++) if (overlaps(list[i],list[j])) { conflictIds.add(list[i].brand+list[i].id); conflictIds.add(list[j].brand+list[j].id); }
        return (
          <div key={nm} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className={`px-4 py-2 flex items-center gap-2 border-b border-slate-100 ${tlColor(nm)}`}>
              <span className="font-bold">👤 {nm}</span>
              <span className="text-[11px] opacity-70">{list.length} trip</span>
              {conflictIds.size>0 && <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded bg-red-600 text-white">⚠ {conflictIds.size/2 || ''} bentrok jadwal</span>}
            </div>
            <div className="divide-y divide-slate-50">
              {list.map((t) => {
                const bad = conflictIds.has(t.brand+t.id);
                return (
                  <a key={t.brand+t.id} href={masterUrl(t)} target={t.brand==='KT'?'_blank':undefined} rel="noreferrer"
                    className={`flex items-center gap-2 px-4 py-2 hover:bg-slate-50 ${bad?'bg-red-50':''}`}>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BR[t.brand].cls}`}>{t.brand}</span>
                    <span className="text-xs font-mono font-bold text-slate-700 w-14">{t.kode}</span>
                    <span className="flex-1 text-xs text-slate-700 truncate">{t.name || t.kategori}</span>
                    <span className="text-[11px] text-slate-500 whitespace-nowrap">{fmt(t.departure)} – {fmt(t.return_date)}</span>
                    {bad && <span className="text-[10px] font-bold text-red-600">⚠</span>}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
