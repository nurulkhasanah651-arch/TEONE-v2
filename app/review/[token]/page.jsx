// PUBLIC — Review After Trip. Diakses via link WA: https://<brand>/review/<token>
// Di luar route group (app) -> tanpa auth. Data via service-role (token rahasia).
import { getReviewByToken } from '@/lib/actions/reviews';
import ReviewForm from '@/components/shop/ReviewForm';

export const dynamic = 'force-dynamic';

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50 py-6 px-4">
      <div className="max-w-xl mx-auto">{children}</div>
    </div>
  );
}

export default async function ReviewPage({ params }) {
  const { token } = await params;
  const r = await getReviewByToken(token);

  if (r?.error || !r?.ok) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <p className="text-5xl mb-3">⚠</p>
          <h1 className="text-xl font-bold text-red-700 mb-2">Link Tidak Valid</h1>
          <p className="text-sm text-slate-600">{r?.error || 'Link review tidak valid atau sudah kedaluwarsa.'}</p>
        </div>
      </Shell>
    );
  }

  if (r.already) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl shadow p-8 text-center">
          <p className="text-5xl mb-3">✅</p>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Terima kasih!</h1>
          <p className="text-sm text-slate-600">Review untuk trip ini sudah pernah dikirim. Terima kasih atas masukannya 💙</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ReviewForm
        token={token}
        tripName={r.tripName}
        kodeTrip={r.kodeTrip}
        picName={r.picName}
        tlName={r.tlName}
        participantName={r.participantName}
      />
    </Shell>
  );
}
