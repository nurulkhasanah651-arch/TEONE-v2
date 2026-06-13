import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBooking } from '@/lib/shop/data';
import PayButton from '@/components/shop/PayButton';

export const dynamic = 'force-dynamic';
function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }

export default async function OrderPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const accExists = sp?.acc === 'exists';
  const b = await getBooking(id);
  if (!b) notFound();
  const paid = b.status === 'paid';

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className={`p-6 text-center text-white ${paid ? 'bg-emerald-600' : 'bg-slate-900'}`}>
          <p className="text-4xl mb-2">{paid ? '✅' : '🧾'}</p>
          <h1 className="text-xl font-extrabold">{paid ? 'Pembayaran Berhasil!' : 'Booking Dibuat'}</h1>
          <p className="text-sm opacity-90 mt-1">Order #{b.order_code}</p>
        </div>
        <div className="p-6 space-y-3 text-sm">
          {accExists && <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs">Email kamu sudah terdaftar sebelumnya, jadi akun baru tidak dibuat. Pesanan tetap tercatat. Untuk pantau di menu Akun, login dengan akun lama (atau via Google) di halaman <b>Masuk</b>.</div>}
          <Row label="Trip" value={b.trip?.name || '-'} />
          <Row label="Tanggal" value={`${fmtDate(b.trip?.departure)}${b.trip?.return_date ? ' – ' + fmtDate(b.trip?.return_date) : ''}`} />
          <Row label="Pemesan" value={b.lead_name} />
          <Row label="No HP" value={b.lead_phone} />
          <Row label="Jumlah Peserta" value={`${b.pax_count} pax`} />
          <Row label="Tipe Kamar" value={b.room_type || '-'} />
          <Row label="Jenis Bayar" value={b.payment_type === 'full' ? 'Lunas' : 'DP'} />
          <div className="flex justify-between pt-3 border-t border-slate-200">
            <span className="font-bold text-slate-700">{paid ? 'Sudah Dibayar' : 'Total Bayar'}</span>
            <span className="font-extrabold text-lg text-slate-900">{fmtRp(b.amount)}</span>
          </div>

          {paid ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-center text-sm">
              Pembayaran kamu sudah kami terima. Tim kami akan menghubungi via WhatsApp untuk langkah berikutnya 🙏
            </div>
          ) : (
            <>
              <PayButton bookingId={b.id} amountLabel={fmtRp(b.amount)} />
              <p className="text-[11px] text-center text-slate-400">Pembayaran aman via Midtrans (kartu, VA bank, e-wallet, QRIS). Status otomatis ter-update setelah bayar.</p>
              <a href={`https://wa.me/628145460210?text=${encodeURIComponent('Halo, saya mau bayar booking ' + b.order_code)}`} target="_blank" rel="noreferrer"
                className="block text-center w-full py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50">Atau konfirmasi via WhatsApp</a>
            </>
          )}
          <Link href="/trip" className="block text-center text-sm text-slate-500 hover:underline pt-2">← Lihat trip lainnya</Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800 text-right">{value}</span>
    </div>
  );
}
