// Tab Accounting: PPN Paket Tour per Group (Khasanah). Owner/accounting.
// Path: app/(app)/accounting/ppn/page.jsx
import Link from 'next/link';
import { getPpnPerGroup } from '@/lib/actions/tour-templates';
import { fmtRupiah } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function fmtDep(d) { if (!d) return '—'; try { const x = new Date(d); return `${x.getDate()} ${MONTHS_ID[x.getMonth()]} ${x.getFullYear()}`; } catch { return d; } }

export default async function AccountingPpnPage() {
  const res = await getPpnPerGroup();
  if (res?.error) {
    return <div className="max-w-5xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div></div>;
  }
  const rows = res.rows || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">PPN Paket Tour per Group</h1>
        <p className="mt-1 text-slate-600">PPN 1,1% atas paket tour, keberangkatan Okt 2026+. Dari harga tour &amp; PPN yang sudah dibayar peserta.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-slate-50">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Total Harga Tour</p>
          <p className="mt-1 text-xl font-bold text-slate-700">{fmtRupiah(res.totalTour)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-amber-50">
          <p className="text-[11px] font-bold text-slate-500 uppercase">PPN Potensi (semua pax)</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{fmtRupiah(res.totalExpected)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-emerald-50">
          <p className="text-[11px] font-bold text-slate-500 uppercase">PPN Sudah Dibayar</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{fmtRupiah(res.totalCollected)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Belum ada group Umroh Plus yang kena PPN (berangkat Okt 2026+).</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2">Group</th>
                  <th className="px-3 py-2">Berangkat</th>
                  <th className="px-3 py-2">Paket Tour</th>
                  <th className="px-3 py-2 text-right">Pax</th>
                  <th className="px-3 py-2 text-right">Total Harga Tour</th>
                  <th className="px-3 py-2 text-right">PPN Potensi</th>
                  <th className="px-3 py-2 text-right">PPN Dibayar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2"><span className="font-bold text-brand-700">{r.kode}</span> <span className="text-slate-600">{r.name}</span></td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtDep(r.departure)}</td>
                    <td className="px-3 py-2 text-slate-600">{r.tourLabel}</td>
                    <td className="px-3 py-2 text-right">{r.pax}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmtRupiah(r.tourTotal)}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{fmtRupiah(r.ppnExpected)}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmtRupiah(r.ppnCollected)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                  <td className="px-3 py-2" colSpan={4}>TOTAL</td>
                  <td className="px-3 py-2 text-right">{fmtRupiah(res.totalTour)}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{fmtRupiah(res.totalExpected)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{fmtRupiah(res.totalCollected)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-400">Catatan: "PPN Dibayar" dihitung proporsional dari pokok yang sudah dibayar tiap peserta. Nilai ini juga masuk sebagai income di Estimate Profit & Real Proyeksi Group.</p>
    </div>
  );
}
