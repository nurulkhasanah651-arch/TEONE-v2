// Tour Confirmation editor per trip. Path: app/(app)/operasional/tour-confirmation/[tripId]/page.jsx
import Link from 'next/link';
import { getTourConfirmation } from '@/lib/actions/tour-confirmation';
import TourConfirmationEditor from '@/components/operasional/TourConfirmationEditor';

export const dynamic = 'force-dynamic';

export default async function TourConfirmationEditorPage({ params }) {
  const { tripId } = await params;
  const res = await getTourConfirmation(tripId);

  if (res?.error) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/operasional/tour-confirmation" className="text-sm text-brand-600 hover:underline">← Kembali ke daftar</Link>
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {res.error}</div>
      </div>
    );
  }

  const { tc, trip } = res;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/operasional" className="hover:underline">Operasional</Link>
          <span>/</span>
          <Link href="/operasional/tour-confirmation" className="hover:underline">Tour Confirmation</Link>
          <span>/</span>
          <span className="text-slate-700 font-semibold">{trip.kode_trip || trip.id}</span>
        </div>
        <h1 className="text-2xl font-bold text-brand-700 mt-1">📄 Tour Confirmation — {trip.public_title || trip.name}</h1>
        <p className="text-sm text-slate-500 mt-0.5">Kode {trip.kode_trip || '-'}{trip.pic ? ` · PIC: ${trip.pic}` : ''}</p>
      </div>

      <TourConfirmationEditor tripId={trip.id} trip={trip} initialTc={tc} />
    </div>
  );
}
