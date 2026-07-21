// Tour Confirmation — daftar trip. Path: app/(app)/operasional/tour-confirmation/page.jsx
import Link from 'next/link';
import { listTourConfirmationTrips } from '@/lib/actions/tour-confirmation';
import TourConfirmationList from '@/components/operasional/TourConfirmationList';

export const dynamic = 'force-dynamic';

export default async function TourConfirmationListPage() {
  const res = await listTourConfirmationTrips();
  const trips = res?.trips || [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link href="/operasional" className="hover:underline">Operasional</Link>
            <span>/</span>
            <span className="text-slate-700 font-semibold">Tour Confirmation</span>
          </div>
          <h1 className="text-3xl font-bold text-brand-700 mt-1">📄 Tour Confirmation</h1>
          <p className="mt-1 text-slate-600 text-sm">Pilih trip untuk buat / edit Tour Confirmation. Bisa didownload PDF atau dikirim ke peserta dari nomor PIC.</p>
        </div>
      </div>

      {res?.error ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">⚠ {res.error}</div>
      ) : (
        <TourConfirmationList trips={trips} />
      )}
    </div>
  );
}
