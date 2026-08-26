// Blast TL — kirim informasi ke semua TL dari nomor PIC Putri. Owner/manager/ops/accounting.
// Path: app/(app)/tl-blast/page.jsx

import { getTlBlastList } from '@/lib/actions/tl-blast';
import TlBlastClient from '@/components/tl-blast/TlBlastClient';

export const dynamic = 'force-dynamic';

export default async function TlBlastPage() {
  const res = await getTlBlastList();

  if (res?.error) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-sm text-amber-800">⚠ {res.error}</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">📣 Blast TL</h1>
        <p className="mt-1 text-slate-600">Kirim informasi ke semua Tour Leader (TEONE + Khasanah digabung) sekaligus lewat WhatsApp, dari nomor <b>CS TravelingEropa</b>.</p>
      </div>
      <TlBlastClient tls={res.tls || []} sender={res.sender} />
    </div>
  );
}
