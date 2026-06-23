import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { resolveBrandCode } from '@/lib/brand-shared';
import { storefrontConfig } from '@/lib/shop/storefront-config';
import { getBooking, getBrandBank } from '@/lib/shop/data';
import { reconcilePendingBooking } from '@/lib/shop/fulfillment';
import OrderPayChoice from '@/components/shop/OrderPayChoice';

export const dynamic = 'force-dynamic';
function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return ''; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return d; } }

export default async function OrderPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const accExists = sp?.acc === 'exists';
  let b = await getBooking(id);
  if (!b) notFound();
  let _brand = 'teone';
  try { const h = headers(); _brand = h.get('x-brand') || resolveBrandCode({ host: h.get('host') }) || 'teone'; } catch {}
  // Self-heal: kalau masih pending tapi sudah settle di Midtrans (webhook telat/terlewat),
  // proses sekarang lalu muat ulang booking agar tampil 'Pembayaran Berhasil'.
  if (b.status !== 'paid' && b.midtrans_order_id) {
    try { const healed = await reconcilePendingBooking(_brand, b); if (healed) { const fresh = await getBooking(id); if (fresh) b = fresh; } } catch {}
  }
  const csWa = storefrontConfig(_brand).waNumber || '6282210991200';
  const paid = b.status === 'paid';
  const bank = await getBrandBank();
  // Nominal transfer manual = total tanpa biaya admin (admin 13rb hanya utk pembayaran online)
  let manualAmount = Number(b.amount) || 0;
  try { const _m = JSON.parse(b.notes || '{}'); manualAmount = Math.max(manualAmount - (Number(_m.admin_fee) || 0), 0); } catch {}

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
            <>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-center text-sm">
                Pembayaran kamu sudah kami terima. Tim kami akan menghubungi via WhatsApp untuk langkah berikutnya 🙏
              </div>
              <Link href="/akun" className="block text-center w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
                👤 Pantau Pesanan di Akun Saya →
              </Link>
              <p className="text-[11px] text-center text-slate-400">Kalau diminta login, gunakan No HP / email + password yang kamu buat tadi.</p>
            </>
          ) : (
            <>
              <OrderPayChoice
                bookingId={b.id}
                amount={b.amount}
                manualAmount={manualAmount}
                bank={bank || {}}
                manualStatus={b.manual_status || null}
                rejectReason={b.manual_reject_reason || null}
              />
              <a href={`https://wa.me/${csWa}?text=${encodeURIComponent('Halo, saya mau bayar booking ' + b.order_code)}`} target="_blank" rel="noreferrer"
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
