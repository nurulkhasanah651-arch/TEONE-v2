// Dashboard Tim Visa (Lukita & Lukas) — monitoring & urgensi pengurusan visa lintas trip.
// Fokus: apa yang paling mendesak dikerjakan (berangkat terdekat, belum kelar) + ringkasan status.
// Path: app/(app)/visa/dashboard/page.jsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandSupabaseUrl, brandServiceRoleKey } from '@/lib/supabase/service-env';
import { fmtDate, daysUntil } from '@/lib/utils/format';
import { deriveVisaStage } from '@/lib/utils/visa-constants';
import { getPicScope, filterTripsForPic } from '@/lib/auth/pic-scope';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try { const res = await promise; return res.data || fallback; } catch { return fallback; }
}

export default async function VisaDashboardPage() {
  const supabase = createClient();
  const _u = brandSupabaseUrl(); const _k = brandServiceRoleKey();
  const db = (_u && _k) ? createServiceClient(_u, _k, { auth: { persistSession: false, autoRefreshToken: false } }) : supabase;

  const trips = await safeQuery(db.from('trips').select('*').order('departure', { ascending: true, nullsFirst: false }));
  let passengers = [];
  try {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from('trip_passengers')
        .select('id, trip_id, visa_docs, visa_uploaded_docs, visa_uploads_last_viewed_at, visa_status, visa_biometric_date, include_visa, visa_ready, visa_result')
        .order('id', { ascending: true }).range(from, from + 999);
      if (!data || data.length === 0) break;
      passengers = passengers.concat(data);
      if (data.length < 1000) break;
    }
  } catch { passengers = []; }

  let activeTrips = trips.filter((t) => t.status !== 'completed' && t.status !== 'cancelled');
  { const { data: { user } } = await supabase.auth.getUser(); const scope = await getPicScope(supabase, user); activeTrips = filterTripsForPic(activeTrips, scope); }

  const paxByTrip = {};
  for (const p of passengers) { (paxByTrip[p.trip_id] = paxByTrip[p.trip_id] || []).push(p); }

  // Tandai peserta yang sudah BAYAR visa (utk deriveVisaStage: siap biometrik).
  try {
    if (_u && _k && passengers.length) {
      const _svc = createServiceClient(_u, _k, { auth: { persistSession: false, autoRefreshToken: false } });
      const _ids = passengers.map((p) => p.id);
      const paid = {};
      for (let i = 0; i < _ids.length; i += 1000) {
        const { data: pays } = await _svc.from('participant_payments').select('passenger_id, amount, is_transferred').eq('type', 'Visa').in('passenger_id', _ids.slice(i, i + 1000));
        for (const r of (pays || [])) { if (r.is_transferred !== true && Number(r.amount) > 0) paid[r.passenger_id] = true; }
      }
      for (const p of passengers) p.visaPaid = paid[p.id] === true;
    }
  } catch {}

  function newUploads(pax) {
    let n = 0;
    for (const p of pax) {
      const ups = Array.isArray(p.visa_uploaded_docs) ? p.visa_uploaded_docs : [];
      if (!ups.length) continue;
      const lv = p.visa_uploads_last_viewed_at ? new Date(p.visa_uploads_last_viewed_at).getTime() : 0;
      for (const u of ups) { const ut = u.uploaded_at ? new Date(u.uploaded_at).getTime() : 0; if (ut > lv) n++; }
    }
    return n;
  }

  // Bucket per trip
  const rows = [];
  const G = { needs: 0, approved: 0, proses: 0, belum: 0, rejected: 0, newUp: 0 };
  for (const t of activeTrips) {
    const pax = paxByTrip[t.id] || [];
    const tmpl = t.visa_doc_template || [];
    let needs = 0, approved = 0, proses = 0, belum = 0, rejected = 0;
    for (const p of pax) {
      const s = deriveVisaStage(p, tmpl).key;
      if (s === 'punya_visa' || s === 'tidak_perlu') continue;
      needs++;
      if (s === 'approved') approved++;
      else if (s === 'rejected') rejected++;
      else if (s === 'proses' || s === 'biometrik_terjadwal' || s === 'siap_biometrik') proses++;
      else belum++; // belum_mulai / lengkapi_dokumen
    }
    if (needs === 0) continue;
    const nu = newUploads(pax);
    const d = daysUntil(t.departure);
    const done = approved >= needs;
    rows.push({
      id: t.id, kode: t.kode_trip || t.id, name: t.public_title || t.name || '',
      departure: t.departure, d, needs, approved, proses, belum, rejected, nu, done,
    });
    G.needs += needs; G.approved += approved; G.proses += proses; G.belum += belum; G.rejected += rejected; G.newUp += nu;
  }

  // Urutan: yang BELUM kelar dulu, berangkat terdekat di atas; yang sudah kelar di bawah.
  rows.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.d == null ? 99999 : a.d, bd = b.d == null ? 99999 : b.d;
    return ad - bd;
  });
  const tripsAction = rows.filter((r) => !r.done).length;

  const KPI = [
    { label: 'Butuh Visa', v: G.needs, cls: 'text-slate-800', bg: 'bg-white' },
    { label: 'Approved', v: G.approved, cls: 'text-green-700', bg: 'bg-green-50 border-green-200' },
    { label: 'Dalam Proses', v: G.proses, cls: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
    { label: 'Belum / Lengkapi Dok', v: G.belum, cls: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    { label: 'Ditolak', v: G.rejected, cls: 'text-red-700', bg: 'bg-red-50 border-red-200' },
    { label: 'Dok Baru (review)', v: G.newUp, cls: 'text-sky-700', bg: 'bg-sky-50 border-sky-200' },
  ];

  function hx(d) { if (d == null) return '—'; if (d < 0) return `lewat ${Math.abs(d)}h`; if (d === 0) return 'HARI INI'; return `H-${d}`; }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">🛂 Dashboard Tim Visa</h1>
          <p className="text-sm text-slate-500">Monitoring pengurusan visa lintas trip · Tim: Lukita &amp; Lukas</p>
        </div>
        <Link href="/visa" className="text-sm px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">📋 Buka List Visa per Trip →</Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {KPI.map((k) => (
          <div key={k.label} className={`rounded-xl border border-slate-200 p-3 ${k.bg}`}>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{k.label}</p>
            <p className={`text-2xl font-extrabold ${k.cls}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Ringkasan aksi */}
      <div className="bg-white rounded-xl border border-slate-200 p-3 text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
        <span><b className="text-brand-700">{tripsAction}</b> trip masih perlu ditindaklanjuti</span>
        <span>Approved keseluruhan: <b className="text-green-700">{G.needs ? Math.round((G.approved / G.needs) * 100) : 0}%</b></span>
        {G.newUp > 0 && <span className="text-sky-700 font-semibold">📄 {G.newUp} dokumen baru menunggu review</span>}
        {G.rejected > 0 && <span className="text-red-700 font-semibold">⚠ {G.rejected} peserta ditolak — perlu tindak lanjut</span>}
      </div>

      {/* Tabel urgensi per trip */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Monitoring per Trip <span className="text-xs font-normal text-slate-400">· berangkat terdekat & belum kelar di atas</span></h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[840px]">
            <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Trip</th>
                <th className="px-3 py-2 text-left">Berangkat</th>
                <th className="px-3 py-2 text-center">Butuh</th>
                <th className="px-3 py-2 text-left w-[26%]">Progress</th>
                <th className="px-3 py-2 text-center">Approved</th>
                <th className="px-3 py-2 text-center">Proses</th>
                <th className="px-3 py-2 text-center">Belum</th>
                <th className="px-3 py-2 text-center">Tolak</th>
                <th className="px-3 py-2 text-center">Dok Baru</th>
                <th className="px-3 py-2 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-slate-400">Tidak ada trip yang butuh visa saat ini.</td></tr>
              ) : rows.map((r) => {
                const pApproved = Math.round((r.approved / r.needs) * 100);
                const pProses = Math.round((r.proses / r.needs) * 100);
                const urgent = !r.done && r.d != null && r.d <= 30;
                return (
                  <tr key={r.id} className={`align-middle ${r.done ? 'bg-emerald-50/30' : ''}`}>
                    <td className="px-3 py-2">
                      <div className="text-xs font-mono font-bold text-brand-700">{r.kode}</div>
                      <div className="text-[11px] text-slate-600 max-w-[230px] truncate">{r.name}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-slate-500">
                      {fmtDate(r.departure)}
                      <span className={`ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${r.done ? 'bg-emerald-100 text-emerald-700' : urgent ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{r.done ? '✓ kelar' : hx(r.d)}</span>
                    </td>
                    <td className="px-3 py-2 text-center font-bold">{r.needs}</td>
                    <td className="px-3 py-2">
                      <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
                        <div className="h-full bg-green-500" style={{ width: `${pApproved}%` }} title={`Approved ${pApproved}%`} />
                        <div className="h-full bg-purple-400" style={{ width: `${pProses}%` }} title={`Proses ${pProses}%`} />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{pApproved}% approved</div>
                    </td>
                    <td className="px-3 py-2 text-center text-green-700 font-semibold">{r.approved}</td>
                    <td className="px-3 py-2 text-center text-purple-700">{r.proses || '—'}</td>
                    <td className="px-3 py-2 text-center text-amber-700 font-semibold">{r.belum || '—'}</td>
                    <td className="px-3 py-2 text-center">{r.rejected ? <span className="text-red-700 font-bold">{r.rejected}</span> : '—'}</td>
                    <td className="px-3 py-2 text-center">{r.nu ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">{r.nu} baru</span> : '—'}</td>
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      <Link href={`/visa/${r.id}`} className="text-[11px] font-bold px-3 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white">Kelola</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-slate-400">Legenda progress: <span className="text-green-600 font-semibold">hijau</span> = approved, <span className="text-purple-600 font-semibold">ungu</span> = dalam proses (biometrik/menunggu hasil). "Belum" = belum diurus / dokumen belum lengkap.</p>
    </div>
  );
}
