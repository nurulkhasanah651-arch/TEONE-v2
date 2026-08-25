// Tab IT — laporan bug/error/request fitur dari semua user. Owner & Manager saja.
// Path: app/(app)/it/page.jsx

import { listItReports } from '@/lib/actions/it-reports';
import ItReportsBoard from '@/components/it/ItReportsBoard';

export const dynamic = 'force-dynamic';

export default async function ItPage() {
  const res = await listItReports();

  if (res?.error) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <p className="font-bold">Tidak bisa memuat laporan IT</p>
          <p className="text-sm mt-1">{res.error}</p>
        </div>
      </div>
    );
  }

  const reports = res.reports || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">🖥️ IT · Laporan & Request</h1>
        <p className="mt-1 text-slate-600">Laporan bug, error, dan request fitur dari seluruh user (staf, tour leader, mitra) di brand ini.</p>
      </div>
      <ItReportsBoard initialReports={reports} />
    </div>
  );
}
