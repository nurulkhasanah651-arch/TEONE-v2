import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPesertaData } from '@/lib/shop/data';
import { getBookingPaymentPlan } from '@/lib/shop/payments';
import LogoutButton from '@/components/shop/LogoutButton';

export const dynamic = 'force-dynamic';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) { if (!d) return '-'; try { return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
function daysTo(d) { if (!d) return null; const ms = new Date(d + 'T00:00:00') - new Date(); return Math.ceil(ms / 86400000); }

const STATUS = {
  paid:     { label: 'Lunas', cls: 'bg-emerald-100 text-emerald-700' },
  pending:  { label: 'Menunggu pembayaran', cls: 'bg-amber-100 text-amber-700' },
  cancelled:{ label: 'Dibatalkan', cls: 'bg-red-100 text-red-700' },
};

export default async function AkunPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/masuk');

  const { customer, bookings } = await getPesertaData(user);
  const name = customer?.name || user.user_metadata?.name || 'Peserta';
  // Sinkron checklist payment: total harga, sudah dibayar pokok, sisa — per booking
  const plans = {};
  await Promise.all(bookings.map(async (b) => { plans[b.id] = await getBookingPaymentPlan(b).catch(() => null); }));
  const totalTrx = bookings.reduce((s, b) => s + Number(plans[b.id]?.pokokTotal || 0), 0);
  const paidTrx = bookings.reduce((s, b) => s + Number(plans[b.id]?.pokokPaid || 0), 0);
  const sisaTrx = bookings.reduce((s, b) => s + Number(plans[b.id]?.pokokSisa || 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-slate-500">Halo,</p>
          <h1 className="text-2xl font-extrabold text-slate-900">{name} 👋</h1>
        </div>
        <LogoutButton className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50" />
      </div>

      {/* Ringkasan */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Trip Diikuti" value={String(bookings.length)} />
        <Stat label="Total Harga Paket" value={fmtRp(totalTrx)} />
        <Stat label="Sudah Dibayar" value={fmtRp(paidTrx)} good />
        <Stat label="Sisa Pembayaran" value={fmtRp(sisaTrx)} warn />
      </div>

      {/* Daftar trip */}
      <h2 className="mt-8 text-lg font-bold text-slate-900">Trip Saya</h2>
      {bookings.length === 0 ? (
        <div className="mt-3 text-center py-12 border border-dashed border-slate-300 rounded-2xl text-slate-400">
          <p className="text-4xl mb-2">🧳</p>
          <p className="font-bold text-slate-600">Belum ada trip</p>
          <Link href="/trip" className="inline-block mt-3 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold">Lihat Open Trip</Link>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {bookings.map((b) => {
            const _sisa = Number(plans[b.id]?.pokokSisa || 0);
            const _paid = Number(plans[b.id]?.pokokPaid || 0);
            let st;
            if (b.status === 'cancelled') st = { label: 'Dibatalkan', cls: 'bg-red-100 text-red-700' };
            else if (b.status === 'pending') st = { label: 'Menunggu pembayaran', cls: 'bg-amber-100 text-amber-700' };
            else if (_sisa <= 0 && _paid > 0) st = { label: 'Lunas', cls: 'bg-emerald-100 text-emerald-700' };
            else st = { label: 'Belum Lunas', cls: 'bg-blue-100 text-blue-700' };
            const dleft = daysTo(b.trip?.departure);
            return (
              <div key={b.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col sm:flex-row">
                <div className="sm:w-40 h-28 sm:h-auto bg-slate-100 shrink-0">
                  {b.trip?.cover_image_url && <img src={b.trip.cover_image_url} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-slate-900">{b.trip?.name || 'Trip'}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{fmtDate(b.trip?.departure)} · {b.pax_count} pax · {b.room_type || '-'}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs text-slate-600">
                      <span className="text-slate-400">Order {b.order_code}</span><br/>
                      <span>Total: <b className="text-slate-800">{fmtRp(plans[b.id]?.pokokTotal)}</b></span> ·
                      <span className="text-emerald-700"> Dibayar: <b>{fmtRp(plans[b.id]?.pokokPaid)}</b></span> ·
                      <span className="text-amber-700"> Sisa: <b>{fmtRp(plans[b.id]?.pokokSisa)}</b></span>
                    </div>
                    {dleft != null && dleft >= 0 && b.status !== 'cancelled' && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">⏳ {dleft === 0 ? 'Hari ini!' : `${dleft} hari lagi`}</span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    {b.status === 'cancelled' ? (
                      <span className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-bold">Dibatalkan</span>
                    ) : b.status === 'paid' ? (
                      _sisa > 0 ? (
                        <Link href={`/akun/bayar/${b.id}`} className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">💳 Bayar Lanjutan</Link>
                      ) : (
                        <span className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold">✓ Lunas</span>
                      )
                    ) : (
                      <Link href={`/order/${b.id}`} className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold">💳 Bayar / Detail</Link>
                    )}
                    {b.trip?.slug && <Link href={`/trip/${b.trip.slug}`} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-bold">Info Trip</Link>}
                    <a href={`https://wa.me/6282210991200?text=${encodeURIComponent('Halo, saya peserta order ' + b.order_code)}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 text-xs font-bold">Tanya CS</a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Profil + Persiapan */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-bold text-slate-900 mb-3">Profil Saya</h3>
          <Field label="Nama" value={name} />
          <Field label="Email" value={user.email} />
          <Field label="No HP / WhatsApp" value={customer?.whatsapp || customer?.phone || user.user_metadata?.phone || '-'} />
          <p className="text-[11px] text-slate-400 mt-2">Untuk ubah data, hubungi CS via WhatsApp.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-bold text-slate-900 mb-3">Checklist Persiapan</h3>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li className="flex gap-2"><span className="text-emerald-500">✓</span> Lunasi pembayaran sebelum H-45</li>
            <li className="flex gap-2"><span className="text-emerald-500">✓</span> Siapkan paspor (berlaku min. 6 bulan)</li>
            <li className="flex gap-2"><span className="text-emerald-500">✓</span> Lengkapi dokumen visa (cek syarat di halaman trip)</li>
            <li className="flex gap-2"><span className="text-emerald-500">✓</span> Ikuti briefing tour leader sebelum berangkat</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, good, warn }) {
  return (
    <div className={`rounded-2xl border p-4 ${good ? 'border-emerald-200 bg-emerald-50' : warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className={`text-lg font-extrabold mt-0.5 ${good ? 'text-emerald-700' : warn ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
function Field({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800 text-right">{value}</span>
    </div>
  );
}
