// Tab Accounting: Pembukuan per Trip & PPh Badan. Owner/accounting.
// Path: app/(app)/accounting/pembukuan/page.jsx
import Link from 'next/link';
import { getBookkeepingYears } from '@/lib/actions/bookkeeping';
import { fmtRupiah } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export default async function PembukuanPage() {
  const res = await getBookkeepingYears();
  if (res?.error) {
    return <div className="max-w-6xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div></div>;
  }
  const years = res.years || [];
  const ratePct = Math.round((res.rate || 0.22) * 1000) / 10;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Pembukuan Trip &amp; PPh Badan</h1>
        <p className="mt-1 text-slate-600">Gabungan omzet peserta &amp; biaya vendor per trip untuk dokumentasi pajak. <b>PPh Badan {ratePct}%</b> dihitung dari laba kena pajak per tahun (laba/rugi antar-trip saling menutup). Klik trip untuk rincian dokumen.</p>
      </div>

      {years.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-8 text-center text-sm text-slate-400">Belum ada data trip.</div>
      ) : years.map((y) => (
        <div key={y.label} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-bold text-slate-800">Tahun Pajak {y.label}</h2>
            {y.nIncomplete > 0 && (
              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">⚠ {y.nIncomplete} trip belum ada biaya vendor</span>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-slate-50">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Omzet (Peredaran Usaha)</p>
              <p className="mt-1 text-lg font-bold text-slate-700">{fmtRupiah(y.omzet)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-rose-50">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Biaya Vendor (HPP)</p>
              <p className="mt-1 text-lg font-bold text-rose-700">{fmtRupiah(y.biaya)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-emerald-50">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Laba Kena Pajak</p>
              <p className="mt-1 text-lg font-bold text-emerald-700">{fmtRupiah(y.laba)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-fuchsia-50">
              <p className="text-[11px] font-bold text-slate-500 uppercase">PPh Badan {ratePct}%</p>
              <p className="mt-1 text-lg font-bold text-fuchsia-700">{fmtRupiah(y.pph)}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-2">Group</th>
                    <th className="px-3 py-2">Berangkat</th>
                    <th className="px-3 py-2 text-right">Pax</th>
                    <th className="px-3 py-2 text-right">Omzet</th>
                    <th className="px-3 py-2 text-right">Biaya Vendor</th>
                    <th className="px-3 py-2 text-right">Laba</th>
                    <th className="px-3 py-2 text-right">PPh {ratePct}%</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {y.trips.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2"><span className="font-bold text-brand-700">{r.kode}</span> <span className="text-slate-600">{r.name}</span></td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.depFmt}</td>
                      <td className="px-3 py-2 text-right">{r.pax}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtRupiah(r.omzet)}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{r.nItem === 0 ? <span className="text-amber-600" title="Belum ada biaya vendor">{fmtRupiah(0)} ⚠</span> : fmtRupiah(r.biaya)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${r.laba < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtRupiah(r.laba)}</td>
                      <td className="px-3 py-2 text-right text-fuchsia-700">{fmtRupiah(r.pph)}</td>
                      <td className="px-3 py-2 text-right"><Link href={`/accounting/pembukuan/${r.id}`} className="text-brand-600 font-medium hover:underline whitespace-nowrap">Rincian →</Link></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                    <td className="px-3 py-2" colSpan={3}>TOTAL {y.label}</td>
                    <td className="px-3 py-2 text-right">{fmtRupiah(y.omzet)}</td>
                    <td className="px-3 py-2 text-right text-rose-700">{fmtRupiah(y.biaya)}</td>
                    <td className="px-3 py-2 text-right text-emerald-700">{fmtRupiah(y.laba)}</td>
                    <td className="px-3 py-2 text-right text-fuchsia-700">{fmtRupiah(y.pph)}</td>
                    <td className="px-3 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ))}

      <p className="text-[11px] text-slate-400">Catatan: Omzet = nilai jual peserta aktif (price paid, sudah dikurangi diskon; PPN tidak termasuk). Biaya Vendor = total item HPP (trip_finance_items). PPh Badan {ratePct}% = tarif umum atas laba kena pajak per tahun — bukan nasihat pajak; sesuaikan dengan konsultan bila memakai fasilitas Pasal 31E / PP-23.</p>
    </div>
  );
}
