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
      {tab === 'calendar' && <CalendarSection trips={filtered} tlOptions={tlOptions} />}
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
            <div className="mt-1 flex items-center justify-center gap-2 flex-wrap">
              <button onClick={doFinal} disabled={pending} className="text-[10px] text-slate-400 hover:text-slate-600 underline">update lagi</button>
              <button onClick={resendWA} disabled={pending} className="text-[10px] px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50">{wa || '📲 Kirim WA'}</button>
              {t.assign_status === 'approved' && <span className="text-[10px] px-2 py-0.5 rounded bg-green-100 text-green-700 font-bold">✅ TL Approved</span>}
              {t.assign_status === 'rejected' && <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">❌ TL Reject</span>}
              {t.assign_status !== 'approved' && t.assign_status !== 'rejected' && <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">⏳ Belum konfirmasi</span>}
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
// ===== Gantt Plotting TL: baris = Tour Leader, kolom = tanggal =====
const CW = 30;       // lebar 1 kolom hari (px)
const BAR_H = 22;    // tinggi 1 lane (px)
const BRAND_COLOR = { TE: '#2563eb', KT: '#ea580c' };

function pad2G(n) { return String(n).padStart(2, '0'); }
function isoG(y, m, dd) { return `${y}-${pad2G(m)}-${pad2G(dd)}`; }
function hariBulanG(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function akhirPekanG(y, m, dd) { const w = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); return w === 0 || w === 6; }
function normNamaG(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase(); }
function escRegExpG(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Cocokkan nama TL trip ke roster Master TL berdasarkan kata utuh.
function tlRowKeyG(tl, roster) {
  for (const nm of (roster || [])) {
    if (!nm) continue;
    try { if (new RegExp('\\b' + escRegExpG(nm) + '\\b', 'i').test(String(tl || ''))) return nm; } catch {}
  }
  return null;
}
function whoOf(t) { return String(t.tl_plan || t.tl || '').trim(); }
function tglG(t) {
  const a = String(t.departure || '').slice(0, 10);
  let b = String(t.return_date || t.departure || '').slice(0, 10);
  if (!a || !b) return null;
  if (b < a) b = a;
  return { a, b };
}
// Potongan trip pada 1 bulan (hari 1-based), diklip ke batas bulan.
function segmenBulanG(t, y, m) {
  const dt = tglG(t); if (!dt) return null;
  const n = hariBulanG(y, m), awal = isoG(y, m, 1), akhir = isoG(y, m, n);
  if (dt.b < awal || dt.a > akhir) return null;
  return {
    mulaiHari: dt.a < awal ? 1 : Number(dt.a.slice(8, 10)),
    selesaiHari: dt.b > akhir ? n : Number(dt.b.slice(8, 10)),
  };
}
// Tumpuk trip yang tanggalnya beririsan ke sub-baris (lane) secara greedy.
function susunLaneG(segs) {
  const urut = [...segs].sort((a, b) => a.mulaiHari - b.mulaiHari || a.selesaiHari - b.selesaiHari);
  const laneAkhir = [];
  urut.forEach((it) => {
    let lane = laneAkhir.findIndex((end) => end < it.mulaiHari);
    if (lane === -1) lane = laneAkhir.length;
    laneAkhir[lane] = it.selesaiHari;
    it.lane = lane;
  });
  return { items: urut, lanes: Math.max(1, laneAkhir.length) };
}
// Bentrok = 2 trip milik TL SAMA yang rentang tanggalnya beririsan. Trip tanpa TL tak dihitung.
function cariBentrokG(trips) {
  const grup = {};
  for (const t of trips) {
    const who = whoOf(t); if (!who) continue;
    const dt = tglG(t); if (!dt) continue;
    (grup[normNamaG(who)] = grup[normNamaG(who)] || []).push({ t, ...dt });
  }
  const ids = new Set(); let pairs = 0;
  for (const k of Object.keys(grup)) {
    const g = grup[k];
    for (let i = 0; i < g.length; i++) {
      for (let j = i + 1; j < g.length; j++) {
        if (g[i].a <= g[j].b && g[j].a <= g[i].b) { ids.add(g[i].t.id); ids.add(g[j].t.id); pairs++; }
      }
    }
  }
  return { ids, pairs };
}

function CalendarSection({ trips, tlOptions = [] }) {
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [mo, setMo] = useState(now.getMonth() + 1);
  const [fTL, setFTL] = useState('');

  const n = hariBulanG(y, mo);
  const trackW = n * CW;
  const { ids: conflictIds, pairs: conflictPairs } = useMemo(() => cariBentrokG(trips), [trips]);

  const roster = useMemo(() => [...tlOptions].filter(Boolean).sort((a, b) => a.localeCompare(b)), [tlOptions]);

  // Baris: TL internal (roster Master TL) selalu tampil; TL luar roster muncul hanya bila punya trip bulan ini.
  const rows = useMemo(() => {
    const rosterNorm = new Set(roster.map(normNamaG));
    const ext = new Map();
    for (const t of trips) {
      if (!segmenBulanG(t, y, mo)) continue;
      const who = whoOf(t); if (!who) continue;
      const k = tlRowKeyG(who, roster) || who;
      if (!rosterNorm.has(normNamaG(k))) ext.set(normNamaG(k), k);
    }
    const internal = roster.map((nama) => ({ nama, internal: true }));
    const external = [...ext.values()].sort((a, b) => a.localeCompare(b)).map((nama) => ({ nama, internal: false }));
    let out = [...internal, ...external];
    if (fTL) out = out.filter((r) => normNamaG(r.nama) === normNamaG(fTL));
    return out;
  }, [trips, roster, y, mo, fTL]);

  // Segmen per baris TL
  const segsByRow = useMemo(() => {
    const map = new Map();
    for (const r of rows) map.set(r.nama, []);
    for (const t of trips) {
      const who = whoOf(t); if (!who) continue;
      const s = segmenBulanG(t, y, mo); if (!s) continue;
      const k = tlRowKeyG(who, roster) || who;
      const target = rows.find((r) => normNamaG(r.nama) === normNamaG(k));
      if (target) map.get(target.nama).push({ ...s, ref: t });
    }
    return map;
  }, [rows, trips, roster, y, mo]);

  const belumTL = useMemo(
    () => trips.filter((t) => !whoOf(t) && segmenBulanG(t, y, mo))
               .sort((a, b) => String(a.departure).localeCompare(String(b.departure))),
    [trips, y, mo]
  );

  const prev = () => { const dt = new Date(y, mo - 2, 1); setY(dt.getFullYear()); setMo(dt.getMonth() + 1); };
  const next = () => { const dt = new Date(y, mo, 1); setY(dt.getFullYear()); setMo(dt.getMonth() + 1); };
  const today = () => { const dt = new Date(); setY(dt.getFullYear()); setMo(dt.getMonth() + 1); };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={prev} className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-sm">‹</button>
        <h2 className="font-bold text-slate-800 min-w-[140px] text-center">{MON[mo - 1]} {y}</h2>
        <button onClick={next} className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 text-sm">›</button>
        <button onClick={today} className="px-3 py-1 rounded-full border border-slate-200 hover:bg-slate-50 text-xs font-semibold">Hari ini</button>

        <span className="flex items-center gap-1 text-xs text-slate-600 ml-2">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: BRAND_COLOR.TE }} /> Traveling Eropa
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-600">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: BRAND_COLOR.KT }} /> Khasanah Travel
        </span>

        <select value={fTL} onChange={(e) => setFTL(e.target.value)} className="px-2 py-1 border border-slate-300 rounded-lg text-xs ml-auto">
          <option value="">Semua Tour Leader</option>
          {rows.length === 0 && fTL && <option value={fTL}>{fTL}</option>}
          {roster.map((nm) => <option key={nm} value={nm}>{nm}</option>)}
        </select>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${conflictPairs > 0 ? 'bg-red-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
          {conflictPairs > 0 ? `⚠ ${conflictPairs} bentrok` : '✓ 0 bentrok'}
        </span>
      </div>

      {/* Grid Gantt */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <div style={{ minWidth: 170 + trackW + 230 }}>
          {/* header hari */}
          <div className="flex items-stretch border-b border-slate-200 bg-white sticky top-0 z-10">
            <div className="sticky left-0 z-20 bg-white shrink-0 border-r border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 flex items-center" style={{ width: 170, minWidth: 170 }}>
              Tour Leader
            </div>
            <div className="flex" style={{ width: trackW }}>
              {Array.from({ length: n }, (_, i) => i + 1).map((dd) => (
                <div key={dd} className={`text-center text-[11px] text-slate-400 py-1 border-r border-slate-100 ${akhirPekanG(y, mo, dd) ? 'bg-slate-50' : ''}`} style={{ width: CW, minWidth: CW }}>{dd}</div>
              ))}
            </div>
            <div className="shrink-0 border-l border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500" style={{ width: 230, minWidth: 230 }}>
              Trip bulan ini
            </div>
          </div>

          {rows.length === 0 && <div className="p-4 text-sm text-slate-400">Tidak ada Tour Leader untuk ditampilkan.</div>}

          {rows.map((row) => {
            const { items, lanes } = susunLaneG(segsByRow.get(row.nama) || []);
            const tinggi = lanes * BAR_H + 6;
            return (
              <div key={row.nama} className="flex items-stretch border-b border-slate-100">
                <div className="sticky left-0 z-10 bg-white shrink-0 border-r border-slate-200 px-2.5 py-1.5 text-[13px] flex items-center gap-1.5" style={{ width: 170, minWidth: 170 }}>
                  <span className={row.internal ? 'text-slate-800' : 'text-slate-400'}>{row.nama}</span>
                  {!row.internal && <span className="text-[10px] bg-slate-100 text-slate-500 rounded px-1.5 py-px" title="Di luar roster Master TL">ext</span>}
                </div>
                <div className="relative flex shrink-0" style={{ width: trackW, height: tinggi }}>
                  {Array.from({ length: n }, (_, i) => i + 1).map((dd) => (
                    <div key={dd} className={`border-r border-slate-100 ${akhirPekanG(y, mo, dd) ? 'bg-slate-50' : ''}`} style={{ width: CW, minWidth: CW }} />
                  ))}
                  <div className="absolute inset-0">
                    {items.map((it, i) => {
                      const bentrok = conflictIds.has(it.ref.id);
                      return (
                        <a
                          key={`${it.ref.brand}-${it.ref.id}-${i}`}
                          href={masterUrl(it.ref)}
                          target={it.ref.brand === 'KT' ? '_blank' : undefined}
                          rel="noreferrer"
                          title={`[${it.ref.kode}] ${it.ref.name} — ${row.nama}\n${fmt(it.ref.departure)} – ${fmt(it.ref.return_date)}${it.ref.seat ? `\nPax ${it.ref.terisi}/${it.ref.seat}` : ''}${bentrok ? '\n⚠ BENTROK dgn trip lain TL ini' : ''}`}
                          className="absolute rounded-[5px] text-white text-[10px] leading-5 px-1.5 whitespace-nowrap overflow-hidden text-ellipsis hover:brightness-110"
                          style={{
                            background: BRAND_COLOR[it.ref.brand] || '#64748b',
                            left: (it.mulaiHari - 1) * CW + 1,
                            width: (it.selesaiHari - it.mulaiHari + 1) * CW - 2,
                            top: it.lane * BAR_H + 3,
                            height: 20,
                            outline: bentrok ? '2px solid #dc2626' : undefined,
                            outlineOffset: bentrok ? '-2px' : undefined,
                          }}
                        >
                          {[it.ref.kode, it.ref.name].filter(Boolean).join(' ')}
                        </a>
                      );
                    })}
                  </div>
                </div>
                <div className="shrink-0 border-l border-slate-200 px-2.5 py-1 text-xs" style={{ width: 230, minWidth: 230 }}>
                  {items.length === 0 ? <span className="text-slate-300">—</span> : items.map((it, i) => (
                    <div key={i} className={`truncate py-px ${conflictIds.has(it.ref.id) ? 'text-red-700 font-semibold' : 'text-slate-600'}`}>
                      {[it.ref.kode, it.ref.name].filter(Boolean).join(' · ')}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {conflictPairs === 0
        ? <p className="text-sm text-emerald-700 font-semibold">✓ Tidak ada bentrok.</p>
        : <p className="text-sm text-red-700 font-semibold">⚠ Ada {conflictPairs} pasangan trip bentrok (TL sama, tanggal beririsan) — ditandai garis merah.</p>}

      {/* Trip belum ada TL bulan ini */}
      <div>
        <p className="text-sm font-bold text-slate-700 mb-1">📝 Trip belum ada Tour Leader ({belumTL.length})</p>
        {belumTL.length === 0 ? (
          <p className="text-xs text-slate-400">Semua trip bulan ini sudah ada rencana TL.</p>
        ) : (
          <div className="space-y-0.5">
            {belumTL.map((t) => (
              <a key={`${t.brand}-${t.id}`} href={masterUrl(t)} target={t.brand === 'KT' ? '_blank' : undefined} rel="noreferrer"
                 className="flex items-center gap-2 text-xs text-slate-600 hover:text-brand-700">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: BRAND_COLOR[t.brand] || '#64748b' }} />
                <span className="font-semibold">[{t.kode}]</span>
                <span className="truncate">{t.name}</span>
                <span className="text-slate-400 shrink-0">({fmt(t.departure)}–{fmt(t.return_date)})</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


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
