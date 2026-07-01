import { getPendingWA } from '@/lib/actions/wa-outbox';
import WAPendingClient from '@/components/wa/WAPendingClient';

export const dynamic = 'force-dynamic';

export default async function WAPendingPage() {
  const res = await getPendingWA();
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-brand-700">📩 Pesan WA Tertunda</h1>
      <p className="mt-1 text-slate-600 mb-4">
        Pesan yang <b>gagal terkirim</b> (biasanya nomor Fonnte terputus/logout). Login ulang nomornya di Fonnte,
        lalu klik <b>Kirim Ulang</b>. Data pembayaran tetap aman — hanya WA-nya yang tertunda.
      </p>
      <WAPendingClient rows={res?.rows || []} />
    </div>
  );
}
