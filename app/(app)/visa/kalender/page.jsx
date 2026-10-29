// Kalender Biometrik — tampilan kalender appointment biometrik visa untuk Tim Visa.
// Sumber data: trip_passengers.visa_biometric_date / visa_biometric_time (LIVE dari sistem).
// Dikelompokkan per kedutaan (France / USA / UK / dll). Hari kerja yang KOSONG ditandai.
// Path: app/(app)/visa/kalender/page.jsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandSupabaseUrl, brandServiceRoleKey } from '@/lib/supabase/service-env';

export const dynamic = 'force-dynamic';

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

// Warna per kedutaan
const EMB_STYLE = {
  France: 'bg-blue-100 text-blue-800 border-blue-200',
  USA: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  UK: 'bg-amber-100 text-amber-800 border-amber-200',
  Canada: 'bg-rose-100 text-rose-800 border-rose-200',
  Norway: 'bg-violet-100 text-violet-800 border-violet-200',
};
const embChip = (e) => EMB_STYLE[e] || 'bg-slate-100 text-slate-700 border-slate-200';

function embassyOf(formType, tripVC) {
  const f = (formType || '').toLowerCase();
  const vc = (tripVC || '').toLowerCase();
  if (f.includes('usa') || f.includes('amerika')) return 'USA';
  if (f.includes('uk') || f.includes('england') || f.includes('inggris')) return 'UK';
  if (f.includes('canada') || f.includes('kanada')) return 'Canada';
  if (f.includes('france') || f.includes('prancis') || vc.includes('schengen') || vc.includes('france') || vc.includes('eropa')) return 'France';
  if (f.includes('norway') || vc.includes('norway')) return 'Norway';
  if (tripVC) return tripVC;
  return 'Lainnya';
}

function pad(n) { return String(n).padStart(2, '0'); }

export default async function KalenderBiometrikPage({ searchParams }) {
  const sp = await searchParams;
  const supabase = createClient();
  const _u = brandSupabaseUrl(); const _k = brandServiceRoleKey();
  const db = (_u && _k)
    ? createServiceClient(_u, _k, { auth: { persistSession: false, autoRefreshToken: false } })
    : supabase;

  // Bulan terpilih (default: bulan ini). Format YYYY-MM.
  const now = new Date();
  const curYM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const ym = (sp?.ym && /^\d{4}-\d{2}$/.test(sp.ym)) ? sp.ym : curYM;
  const [yy, mm] = ym.split('-').map(Number);
  const first = `${ym}-01`;
  const lastDay = new Date(yy, mm, 0).getDate();
  const lastStr = `${ym}-${pad(lastDay)}`;

  // Trips (buat kode & visa_country)
  const tripsRes = await db.from('trips').select('id, kode_trip, name, visa_country');
  const tripById = Object.fromEntries((tripsRes.data || []).map((t) => [t.id, t]));

  // Peserta dgn biometrik di bulan ini
  let pax = [];
  try {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from('trip_passengers')
        .select('id, trip_id, customer_id, visa_biometric_date, visa_biometric_time')
        .gte('visa_biometric_date', first).lte('visa_biometric_date', lastStr)
        .order('visa_biometric_date', { ascending: true }).range(from, from + 999);
      if (!data || data.length === 0) break;
      pax = pax.concat(data);
      if (data.length < 1000) break;
    }
  } catch { pax = []; }

  const custIds = [...new Set(pax.map((p) => p.customer_id).filter(Boolean))];
  const paxIds = pax.map((p) => p.id);
  const nameById = {};
  for (let i = 0; i < custIds.length; i += 500) {
    const { data } = await db.from('customers').select('id, name').in('id', custIds.slice(i, i + 500));
    for (const c of (data || [])) nameById[c.id] = c.name;
  }
  // form_type per pax (buat tentukan kedutaan)
  const formByPax = {};
  for (let i = 0; i < paxIds.length; i += 500) {
    const { data } = await db.from('visa_form_responses')
      .select('passenger_id, form_type, status').in('passenger_id', paxIds.slice(i, i + 500));
    for (const r of (data || [])) {
      if (!formByPax[r.passenger_id] || r.status === 'submitted') formByPax[r.passenger_id] = r.form_type;
    }
  }

  // Susun per hari
  const byDay = {}; // day -> [{name, kode, emb, jam}]
  for (const p of pax) {
    const d = String(p.visa_biometric_date).slice(0, 10);
    const day = Number(d.slice(8, 10));
    const t = tripById[p.trip_id] || {};
    const emb = embassyOf(formByPax[p.id], t.visa_country);
    const jam = p.visa_biometric_time ? String(p.visa_biometric_time).slice(0, 5) : '';
    (byDay[day] = byDay[day] || []).push({ name: nameById[p.customer_id] || '—', kode: t.kode_trip || '', emb, jam });
  }
  const embCount = (list) => {
    const c = {};
    for (const x of list) c[x.emb] = (c[x.emb] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  };

  // Grid kalender (Senin..Minggu)
  const firstDow = (new Date(yy, mm - 1, 1).getDay() + 6) % 7; // Mon=0
  const weeks = [];
  let week = new Array(firstDow).fill(null);
  for (let d = 1; d <= lastDay; d++) {
    week.push(d);
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }

  const totalPax = pax.length;
  const daysFilled = Object.keys(byDay).length;
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const isWeekend = (d) => { const w = new Date(yy, mm - 1, d).getDay(); return w === 0 || w === 6; };

  // Navigasi bulan
  const prevYM = (() => { const m = mm - 1; return m < 1 ? `${yy - 1}-12` : `${yy}-${pad(m)}`; })();
  const nextYM = (() => { const m = mm + 1; return m > 12 ? `${yy + 1}-01` : `${yy}-${pad(m)}`; })();

  // Hari kerja kosong
  const kosong = [];
  for (let d = 1; d <= lastDay; d++) if (!byDay[d] && !isWeekend(d)) kosong.push(d);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">📅 Kalender Biometrik</h1>
          <p className="text-sm text-slate-500">Jadwal appointment biometrik visa per kedutaan · sumber: sistem (LIVE)</p>
        </div>
        <div className="flex gap-2">
          <Link href="/visa/dashboard" className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">🛂 Dashboard Tim Visa</Link>
          <Link href="/visa" className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">📋 List Visa per Trip</Link>
        </div>
      </div>

      {/* Navigasi bulan */}
      <div className="flex items-center justify-between flex-wrap gap-2 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <Link href={`/visa/kalender?ym=${prevYM}`} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">←</Link>
          <div className="text-lg font-extrabold text-slate-800 min-w-[180px] text-center">{BULAN_ID[mm - 1]} {yy}</div>
          <Link href={`/visa/kalender?ym=${nextYM}`} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold">→</Link>
        </div>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <span className="text-slate-600">🟢 <b>{totalPax}</b> appointment · {daysFilled} hari terisi</span>
          {ym !== curYM && <Link href="/visa/kalender" className="text-brand-600 hover:underline font-semibold">bulan ini</Link>}
          <Link href="/visa/kalender?ym=2026-11" className="text-brand-600 hover:underline font-semibold">Nov 2026</Link>
          <Link href="/visa/kalender?ym=2026-12" className="text-brand-600 hover:underline font-semibold">Des 2026</Link>
        </div>
      </div>

      {/* Kalender grid */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-7 bg-brand-700 text-white text-xs font-bold">
          {HARI.map((h, i) => (<div key={h} className={`px-2 py-2 text-center ${i >= 5 ? 'bg-brand-800/60' : ''}`}>{h}</div>))}
        </div>
        {weeks.map((wk, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {wk.map((d, di) => {
              if (!d) return <div key={di} className="min-h-[96px] border border-slate-100 bg-slate-50/50" />;
              const list = byDay[d] || [];
              const wend = isWeekend(d);
              const isToday = `${ym}-${pad(d)}` === todayStr;
              const empty = list.length === 0;
              let cellBg = 'bg-white';
              if (empty && !wend) cellBg = 'bg-amber-50';
              else if (empty && wend) cellBg = 'bg-slate-50';
              else if (!empty) cellBg = 'bg-emerald-50/40';
              return (
                <div key={di} className={`min-h-[96px] border border-slate-100 p-1.5 ${cellBg} ${isToday ? 'ring-2 ring-brand-500 ring-inset' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${wend ? 'text-rose-400' : 'text-slate-700'}`}>{d}</span>
                    {!empty && <span className="text-[10px] font-bold text-emerald-700">{list.length}</span>}
                  </div>
                  {!empty ? (
                    <div className="mt-1 space-y-0.5">
                      {embCount(list).map(([e, n]) => (
                        <div key={e} className={`text-[10px] font-semibold rounded px-1 py-0.5 border ${embChip(e)}`}>{n} {e}</div>
                      ))}
                    </div>
                  ) : (
                    <div className={`mt-2 text-[10px] font-semibold ${wend ? 'text-slate-300' : 'text-amber-500'}`}>{wend ? '' : 'KOSONG'}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Hari kerja kosong */}
      {kosong.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="text-sm font-bold text-amber-800 mb-1">⬜ Hari kerja KOSONG ({kosong.length}) — bisa buat pembagian kerja / jadwal baru</div>
          <div className="flex flex-wrap gap-1.5">
            {kosong.map((d) => (<span key={d} className="text-xs font-semibold bg-white border border-amber-300 text-amber-800 rounded px-2 py-0.5">{d} {BULAN_ID[mm - 1].slice(0, 3)}</span>))}
          </div>
        </div>
      )}

      {/* Detail per hari */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="text-lg font-bold text-slate-800 mb-3">Detail per Hari — {BULAN_ID[mm - 1]} {yy}</h2>
        {daysFilled === 0 ? (
          <p className="text-sm text-slate-500">Belum ada appointment biometrik di bulan ini.</p>
        ) : (
          <div className="space-y-4">
            {Object.keys(byDay).map(Number).sort((a, b) => a - b).map((d) => {
              const list = byDay[d];
              const w = (new Date(yy, mm - 1, d).getDay() + 6) % 7;
              return (
                <div key={d}>
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="text-sm font-extrabold text-slate-800">{d} {BULAN_ID[mm - 1]} · {HARI[w]}</span>
                    {embCount(list).map(([e, n]) => (<span key={e} className={`text-[11px] font-semibold rounded px-1.5 py-0.5 border ${embChip(e)}`}>{n} {e}</span>))}
                    <span className="text-[11px] text-slate-400">({list.length} pax)</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[520px]">
                      <thead><tr className="text-left text-slate-400 border-b border-slate-100">
                        <th className="py-1 pr-2 w-8">No</th><th className="py-1 pr-2">Nama</th><th className="py-1 pr-2 w-24">Kedutaan</th><th className="py-1 pr-2 w-20">Trip</th><th className="py-1 pr-2 w-16">Jam</th>
                      </tr></thead>
                      <tbody>
                        {list.sort((a, b) => (a.jam || '').localeCompare(b.jam || '') || (a.name || '').localeCompare(b.name || '')).map((x, i) => (
                          <tr key={i} className="border-b border-slate-50">
                            <td className="py-1 pr-2 text-slate-400">{i + 1}</td>
                            <td className="py-1 pr-2 font-medium text-slate-700">{x.name}</td>
                            <td className="py-1 pr-2"><span className={`rounded px-1.5 py-0.5 border ${embChip(x.emb)}`}>{x.emb}</span></td>
                            <td className="py-1 pr-2 text-slate-500">{x.kode || '—'}</td>
                            <td className="py-1 pr-2 text-slate-500">{x.jam || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
