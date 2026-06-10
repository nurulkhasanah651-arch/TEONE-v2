// Portal Mitra — hanya lihat trip open selling + sisa seat + link PDF itinerary
import { getOpenTripsForMitra } from '@/lib/actions/mitra';

export const dynamic = 'force-dynamic';

function fmtRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); }
function fmtDate(s) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }); } catch { return s; } }

export default async function MitraPortalPage() {
  const res = await getOpenTripsForMitra();
  const trips = res?.trips || [];
  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold text-brand-700">🤝 Trip yang Sedang Dijual</h1>
      <p className="mt-1 text-slate-600 mb-5">Daftar trip open selling — cek sisa seat & unduh itinerary untuk ditawarkan ke calon jamaah.</p>
      {trips.length === 0 ? (
        <div className="p-8 text-center bg-white border border-slate-200 rounded-xl text-slate-500">Belum ada trip open selling saat ini.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trips.map((t) => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-mono text-brand-600">{t.kode_trip || ''}</p>
                  <h2 className="text-lg font-bold text-slate-800">{t.name}</h2>
                </div>
                <span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold shrink-0">OPEN SELLING</span>
              </div>
              <p className="text-sm text-slate-600 mt-2">📅 {fmtDate(t.departure)}</p>
              <p className="text-lg font-bold text-brand-700 mt-1">{fmtRupiah(t.price)}<span className="text-xs font-normal text-slate-500">/pax</span></p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`text-sm font-bold ${t.seat_left <= 5 ? 'text-red-600' : 'text-green-700'}`}>Sisa {t.seat_left} seat</span>
                <span className="text-xs text-slate-400">dari {t.quota}</span>
              </div>
              {t.pdf ? (
                <a href={t.pdf} target="_blank" rel="noreferrer" className="mt-3 inline-block px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg">📄 Lihat Itinerary (PDF)</a>
              ) : (
                <p className="mt-3 text-xs text-slate-400 italic">Itinerary PDF belum tersedia</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
