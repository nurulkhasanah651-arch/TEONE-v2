// Estimate Profit Group (Operasional) — quotation profit per group/trip.
// Harga jual otomatis dari Master Trip; ops isi pax & biaya vendor. Bisa Print/Save PDF.
// Path: app/(app)/operasional/profit-estimate/page.jsx

import Link from 'next/link';
import { listProfitGroups, getProfitEstimate } from '@/lib/actions/profit-estimate';
import ProfitGroupPicker from '@/components/operasional/ProfitGroupPicker';
import ProfitEstimateEditor from '@/components/operasional/ProfitEstimateEditor';

export const dynamic = 'force-dynamic';

export default async function ProfitEstimatePage({ searchParams }) {
  const tripId = searchParams?.trip || null;
  const groupsRes = await listProfitGroups();
  if (groupsRes?.error) {
    return <div className="max-w-3xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {groupsRes.error}</div></div>;
  }

  if (!tripId) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-700">📈 Estimate Profit Group</h1>
          <p className="mt-1 text-slate-600">Pilih group untuk hitung estimasi profit. Harga jual otomatis dari Master Trip — ops tinggal isi jumlah pax & biaya vendor (expense). Bisa di-download PDF.</p>
        </div>
        <ProfitGroupPicker groups={groupsRes.rows || []} />
      </div>
    );
  }

  const est = await getProfitEstimate(tripId);
  if (est?.error) {
    return (
      <div className="max-w-3xl mx-auto space-y-3">
        <Link href="/operasional/profit-estimate" className="text-sm text-brand-600 font-medium hover:underline">← Pilih group lain</Link>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">⚠ {est.error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="no-print">
        <Link href="/operasional/profit-estimate" className="text-sm text-brand-600 font-medium hover:underline">← Pilih group lain</Link>
        <h1 className="mt-1 text-2xl font-bold text-brand-700">📈 Estimate Profit — {est.trip.kode}</h1>
      </div>
      <ProfitEstimateEditor
        trip={est.trip}
        meta={est.meta}
        income={est.income}
        expense={est.expense}
        vendors={est.vendors}
        autoIncome={est.autoIncome}
        autoExpense={est.autoExpense}
        templates={est.templates}
        hotelRooms={est.hotelRooms}
        savedAt={est.savedAt}
        savedAtFmt={est.savedAtFmt}
        savedBy={est.savedBy}
      />
    </div>
  );
}
