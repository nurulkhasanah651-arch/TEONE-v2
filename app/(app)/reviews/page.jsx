// Tab Review internal — hasil review after-trip. Akses: staf internal.
import { getReviews } from '@/lib/actions/reviews';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function Stars({ n }) {
  const v = Number(n) || 0;
  return (
    <span className="whitespace-nowrap">
      <span className="text-yellow-400">{'★'.repeat(v)}</span>
      <span className="text-slate-300">{'★'.repeat(Math.max(0, 5 - v))}</span>
    </span>
  );
}

function avg(arr, key) {
  const vals = arr.map((r) => Number(r[key]) || 0).filter((n) => n > 0);
  if (!vals.length) return '—';
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

export default async function ReviewsPage({ searchParams }) {
  const tripId = searchParams?.trip || null;
  const r = await getReviews(tripId);
  if (r?.error) {
    return <div className="max-w-2xl mx-auto p-6 text-sm text-slate-500">Halaman ini khusus tim internal.</div>;
  }
  const reviews = r.reviews || [];
  const trips = r.trips || [];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-slate-900">⭐ Review Trip</h1>
        <p className="text-slate-500 text-sm mt-0.5">Hasil review peserta setelah trip selesai.</p>
      </div>

      {/* Ringkasan rata-rata */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-500">Rata-rata CS</p>
          <p className="text-2xl font-extrabold text-slate-900">{avg(reviews, 'cs_rating')}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-500">Rata-rata PIC</p>
          <p className="text-2xl font-extrabold text-slate-900">{avg(reviews, 'pic_rating')}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 text-center">
          <p className="text-xs text-slate-500">Rata-rata TL</p>
          <p className="text-2xl font-extrabold text-slate-900">{avg(reviews, 'tl_rating')}</p>
        </div>
      </div>

      {/* Filter per trip */}
      {trips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <Link href="/reviews" className={`text-xs font-bold px-3 py-1.5 rounded-full border ${!tripId ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>Semua ({reviews.length})</Link>
          {trips.map((t) => (
            <Link key={t.id} href={`/reviews?trip=${encodeURIComponent(t.id)}`} className={`text-xs font-bold px-3 py-1.5 rounded-full border ${tripId === String(t.id) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{t.kode || t.name || t.id}</Link>
          ))}
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <p className="text-4xl mb-2">📝</p>
          <p className="font-bold text-slate-600">Belum ada review masuk</p>
          <p className="text-sm mt-1">Review muncul di sini setelah peserta mengisi link yang dikirim via WA.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((rv) => (
            <div key={rv.id} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="font-bold text-slate-900">{rv.trip_name || rv.trip_id} {rv.kode_trip ? <span className="text-slate-400 font-normal">({rv.kode_trip})</span> : null}</p>
                  <p className="text-xs text-slate-500">Peserta: {rv.participant_name || '—'} · PIC: {rv.pic_name || '—'} · TL: {rv.tl_name || '—'}</p>
                </div>
                <p className="text-[11px] text-slate-400 whitespace-nowrap">{(rv.submitted_at || '').slice(0, 10)}</p>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-500 mb-0.5">Customer Service</p>
                  <Stars n={rv.cs_rating} />
                  {rv.cs_note ? <p className="text-slate-600 mt-1 text-xs">“{rv.cs_note}”</p> : null}
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-500 mb-0.5">PIC</p>
                  <Stars n={rv.pic_rating} />
                  {rv.pic_note ? <p className="text-slate-600 mt-1 text-xs">“{rv.pic_note}”</p> : null}
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-xs text-slate-500 mb-0.5">Tour Leader</p>
                  <Stars n={rv.tl_rating} />
                  {rv.tl_note ? <p className="text-slate-600 mt-1 text-xs">“{rv.tl_note}”</p> : null}
                </div>
              </div>
              {rv.additional_note ? <p className="text-sm text-slate-700 mt-3"><span className="font-semibold">Catatan:</span> {rv.additional_note}</p> : null}
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-xs text-slate-500">
                {Array.isArray(rv.source_channels) && rv.source_channels.length > 0 && (
                  <span>Tahu dari: <span className="text-slate-700 font-medium">{rv.source_channels.join(', ')}{rv.source_other ? ` (${rv.source_other})` : ''}</span></span>
                )}
                {rv.next_trip_interest ? <span>Next trip: <span className="text-slate-700 font-medium">{rv.next_trip_interest}</span></span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
