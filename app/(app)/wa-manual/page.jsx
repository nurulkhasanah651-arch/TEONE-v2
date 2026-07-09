import { getManualWaQueue } from '@/lib/actions/wa-manual';
import ManualQueueClient from '@/components/wa/ManualQueueClient';

export const dynamic = 'force-dynamic';

export default async function WaManualPage() {
  const r = await getManualWaQueue();

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-brand-700">WA Menunggu Dikirim Manual</h1>
      <p className="text-sm text-slate-500 mt-1 mb-5">
        Khusus pembayaran online peserta (DP, P1, P2, pelunasan, dll) untuk trip yang PIC-nya
        belum tersambung ke WhatsApp. Salin nomor &amp; pesannya, kirim dari WA PIC, lalu tandai
        sudah dikirim. Perlengkapan/ongkir tidak masuk sini — templatenya langsung muncul
        di panel Perlengkapan saat tombolnya diklik.
      </p>

      {r?.error ? (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">⚠ {r.error}</p>
      ) : (
        <ManualQueueClient pending={r.pending || []} done={r.done || []} pics={r.pics || []} scoped={!!r.scoped} />
      )}
    </div>
  );
}
