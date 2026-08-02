// Detail pembukuan 1 trip — dokumen PPh Badan (pemasukan peserta + biaya vendor). Owner/accounting.
// Path: app/(app)/accounting/pembukuan/[tripId]/page.jsx
import Link from 'next/link';
import { getTripBookkeeping } from '@/lib/actions/bookkeeping';
import { fmtRupiah } from '@/lib/utils/format';
import BookkeepingDownloads from '@/components/accounting/BookkeepingDownloads';

export const dynamic = 'force-dynamic';

export default async function TripBookkeepingPage({ params }) {
  const res = await getTripBookkeeping(params.tripId);
  if (res?.error) {
    return <div className="max-w-5xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {res.error}</div></div>;
  }
  const { trip, peserta, vendor, buktiCount, omzet, cashIn, biaya, laba, pph } = res;
  const ratePct = Math.round((res.rate || 0.22) * 1000) / 10;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/accounting/pembukuan" className="text-sm text-brand-600 font-medium hover:underline">← Pembukuan Trip</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">{trip.kode} · {trip.name}</h1>
        <p className="mt-1 text-slate-600">Berangkat {trip.depFmt} · Tahun pajak {trip.year || '—'}</p>
      </div>

      {/* Download dokumen untuk audit */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Download Dokumen Pembukuan</p>
        <BookkeepingDownloads trip={trip} peserta={peserta} vendor={vendor} buktiCount={buktiCount} />
      </div>

      {/* Ringkasan laba–rugi */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-slate-50">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Omzet Peserta</p>
          <p className="mt-1 text-lg font-bold text-slate-700">{fmtRupiah(omzet)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Diterima: {fmtRupiah(cashIn)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-rose-50">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Biaya Vendor (HPP)</p>
          <p className="mt-1 text-lg font-bold text-rose-700">{fmtRupiah(biaya)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{vendor.length} item</p>
        </div>
        <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-emerald-50">
          <p className="text-[11px] font-bold text-slate-500 uppercase">Laba Kotor Trip</p>
          <p className={`mt-1 text-lg font-bold ${laba < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtRupiah(laba)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Omzet − HPP vendor</p>
        </div>
        <div className="rounded-xl border border-slate-200 shadow-card p-4 bg-slate-100">
          <p className="text-[11px] font-bold text-slate-500 uppercase">PPh Badan</p>
          <p className="mt-1 text-sm font-medium text-slate-600">Dihitung per tahun</p>
          <Link href="/accounting/pembukuan" className="text-[11px] text-brand-600 hover:underline">Lihat PPh tahunan →</Link>
        </div>
      </div>

      {vendor.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">⚠ Belum ada biaya vendor (HPP) yang diinput untuk trip ini — laba &amp; PPh masih memakai biaya Rp 0. Lengkapi di modul HPP/Finance trip agar pembukuan akurat.</div>
      )}

      {/* Pemasukan peserta */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Pemasukan — Invoice Peserta ({peserta.length})</h2>
          <span className="text-sm font-bold text-slate-700">{fmtRupiah(omzet)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2">Peserta</th>
                <th className="px-3 py-2">Kamar</th>
                <th className="px-3 py-2 text-right">Nilai Jual</th>
                <th className="px-3 py-2 text-right">Sudah Dibayar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {peserta.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 text-slate-700">{p.nama}</td>
                  <td className="px-3 py-2 text-slate-500">{p.room}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{fmtRupiah(p.nilai)}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{fmtRupiah(p.dibayar)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                <td className="px-3 py-2" colSpan={2}>TOTAL</td>
                <td className="px-3 py-2 text-right">{fmtRupiah(omzet)}</td>
                <td className="px-3 py-2 text-right text-emerald-700">{fmtRupiah(cashIn)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Biaya vendor */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Biaya — Invoice Vendor / HPP ({vendor.length})</h2>
          <span className="text-sm font-bold text-rose-700">{fmtRupiah(biaya)}</span>
        </div>
        {vendor.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-400">Belum ada item biaya vendor.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200 bg-slate-50">
                  <th className="px-3 py-2">Kategori</th>
                  <th className="px-3 py-2">Vendor</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Jumlah</th>
                  <th className="px-3 py-2">Dokumen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendor.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 text-slate-700">{v.kategori}{v.komponen ? <span className="text-slate-400"> · {v.komponen}</span> : null}</td>
                    <td className="px-3 py-2 text-slate-600">{v.vendor || '—'}</td>
                    <td className="px-3 py-2"><span className="text-[11px] font-bold text-slate-500 uppercase">{v.status || '—'}</span></td>
                    <td className="px-3 py-2 text-right text-rose-700">{fmtRupiah(v.jumlah)}</td>
                    <td className="px-3 py-2">{v.invoiceUrl ? <a href={v.invoiceUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">Invoice ↗</a> : <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                  <td className="px-3 py-2" colSpan={3}>TOTAL HPP</td>
                  <td className="px-3 py-2 text-right text-rose-700">{fmtRupiah(biaya)}</td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Laba kotor trip */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <h2 className="font-bold text-slate-800 mb-3">Laba Kotor Trip Ini</h2>
        <div className="space-y-1.5 text-sm max-w-md">
          <div className="flex justify-between"><span className="text-slate-600">Peredaran Usaha (Omzet)</span><span className="font-medium text-slate-800">{fmtRupiah(omzet)}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Biaya / HPP Vendor</span><span className="font-medium text-rose-700">− {fmtRupiah(biaya)}</span></div>
          <div className="flex justify-between border-t border-slate-200 pt-1.5"><span className="font-bold text-slate-700">Laba Kotor Trip</span><span className={`font-bold ${laba < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{fmtRupiah(laba)}</span></div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3"><b>PPh Badan tidak dihitung per trip.</b> Laba kotor semua trip dalam satu tahun dikurangi biaya operasional kantor (refund, gaji, iklan, biaya kantor), lalu dikenai PPh Badan {ratePct}% — lihat halaman <Link href="/accounting/pembukuan" className="text-brand-600 hover:underline">Pembukuan Trip &amp; PPh Badan</Link>. Bukan nasihat pajak.</p>
      </div>
    </div>
  );
}
