// Halaman Optional Tour (Operasional) — daftar trip; klik untuk lihat peserta + checklist bayar.
// ADITIF: halaman baru. Path: app/(app)/operasional/optional-tour/page.jsx
import Link from 'next/link';
import { listOptionalTourTrips } from '@/lib/actions/optional-tours';
import { fmtDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function OptionalTourListPage() {
  const r = await listOptionalTourTrips();
  const rows = r?.ok ? r.rows : [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-700">🎈 Optional Tour</h1>
        <p className="text-sm text-slate-500">Pilih group untuk lihat daftar peserta optional tour &amp; status pembayaran.</p>
      </div>

      {r?.error ? (
        <div className="bg-white rounded-xl border border-rose-200 p-4 text-sm text-rose-600">⚠ {r.error}</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">Belum ada trip aktif.</div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Trip</th>
                  <th className="px-4 py-2.5 text-left">Berangkat</th>
                  <th className="px-3 py-2.5 text-center">Optional Tour</th>
                  <th className="px-3 py-2.5 text-center">Peserta Ikut</th>
                  <th className="px-3 py-2.5 text-center">Sudah Bayar</th>
                  <th className="px-3 py-2.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="text-xs font-mono font-bold text-brand-700">{t.kode}</div>
                      <div className="text-[12px] text-slate-600 max-w-[280px] truncate">{t.name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-500 whitespace-nowrap">{t.departure ? fmtDate(t.departure) : '—'}</td>
                    <td className="px-3 py-2.5 text-center font-semibold">{t.tourCount || '—'}</td>
                    <td className="px-3 py-2.5 text-center">{t.joinCount || '—'}</td>
                    <td className="px-3 py-2.5 text-center">
                      {t.joinCount > 0
                        ? <span className={`text-xs font-bold ${t.paidCount >= t.joinCount ? 'text-emerald-700' : 'text-amber-700'}`}>{t.paidCount}/{t.joinCount}</span>
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <Link href={`/operasional/optional-tour/${t.id}`} className="text-[11px] font-bold px-3 py-1 rounded bg-brand-600 hover:bg-brand-700 text-white">Buka</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
