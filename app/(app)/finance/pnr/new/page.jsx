import Link from 'next/link';
import PnrForm from '@/components/finance/PnrForm';
import { createPnr } from '@/lib/actions/pnr';

export default function NewPnrPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link href="/finance/pnr" className="text-sm text-brand-600 font-medium hover:underline">← Kembali ke list</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Tambah PNR Baru</h1>
        <p className="mt-1 text-slate-600">Daftarkan deposit tiket pesawat dari vendor/maskapai.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <PnrForm onSubmit={createPnr} submitLabel="Tambah PNR" />
      </div>
    </div>
  );
}
