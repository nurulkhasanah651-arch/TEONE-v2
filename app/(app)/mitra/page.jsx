// Portal Mitra — Dashboard: closingan & fee, + trip open selling (sisa seat, link web, WA template)
import { getMitraDashboard } from '@/lib/actions/mitra';
import CopyWaTemplateButton from '@/components/trips/CopyWaTemplateButton';

export const dynamic = 'force-dynamic';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(s) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return s; } }

export default async function MitraPortalPage() {
  const res = await getMitraDashboard();
  if (res?.error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">⚠ {res.error}</div>
      </div>
    );
  }
  const { mitra, stats, openTrips } = res;

  const cards = [
    { label: 'Closingan (pax)', value: stats.sold, sub: 'total peserta dari kamu', cls: 'bg-blue-50 border-blue-200 text-blue-800' },
    { label: 'Total Fee', value: fmtRupiah(stats.feeEarned), sub: 'estimasi komisi', cls: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    { label: 'Fee Sudah Cair', value: fmtRupiah(stats.paid), sub: 'sudah dibayar', cls: 'bg-slate-50 border-slate-200 text-slate-700' },
    { label: 'Sisa Fee', value: fmtRupiah(stats.remaining), sub: 'belum dicairkan', cls: 'bg-amber-50 border-amber-200 text-amber-800' },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">👋 Halo, {mitra.name}</h1>
        <p className="mt-1 text-slate-600">Ringkasan closingan & fee kamu, plus trip yang sedang dijual untuk kamu tawarkan.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.cls}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide leading-tight">{c.label}</p>
            <p className="mt-1 text-2xl font-extrabold">{c.value}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Rincian closingan per trip */}
      {stats.trips.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 font-bold text-brand-700 text-sm">Closingan kamu per trip</div>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-slate-500 bg-slate-50/50">
              <tr><th className="text-left px-4 py-2">Trip</th><th className="text-center px-2 py-2">Pax</th><th className="text-right px-4 py-2">Fee</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.trips.map((t, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 text-slate-700">{t.name}</td>
                  <td className="px-2 py-2 text-center font-semibold">{t.count}</td>
                  <td className="px-4 py-2 text-right font-semibold text-emerald-700">{fmtRupiah(t.fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Trip open selling */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 mb-1">🤝 Trip Sedang Dijual (Open Selling)</h2>
        <p className="text-sm text-slate-500 mb-3">Cek sisa seat, buka halaman web trip, atau salin template WA untuk ditawarkan ke calon jamaah.</p>
        {openTrips.length === 0 ? (
          <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-500">Belum ada trip open selling saat ini.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openTrips.map((t) => (
              <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-card flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono text-brand-600">{t.kode_trip}</p>
                    <h3 className="text-lg font-bold text-slate-800">{t.name}</h3>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold shrink-0">OPEN SELLING</span>
                </div>
                <p className="text-sm text-slate-600 mt-2">📅 {fmtDate(t.departure)}</p>
                <p className="text-lg font-bold text-brand-700 mt-1">{fmtRupiah(t.price)}<span className="text-xs font-normal text-slate-500">/pax</span></p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-sm font-bold ${t.seat_left <= 5 ? 'text-red-600' : 'text-green-700'}`}>Sisa {t.seat_left} seat</span>
                  <span className="text-xs text-slate-400">dari {t.quota}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={t.webUrl} target="_blank" rel="noreferrer" className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">🌐 Lihat Web Trip</a>
                  <CopyWaTemplateButton tripId={t.id} />
                  {t.pdf && <a href={t.pdf} target="_blank" rel="noreferrer" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg">📄 Itinerary PDF</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
