import { getBroadcastData } from '@/lib/actions/wa-blast';
import BroadcastClient from '@/components/inbox/BroadcastClient';

export const dynamic = 'force-dynamic';

export default async function WaBroadcastPage() {
  const data = await getBroadcastData();
  if (data?.notKhasanah) return <div className="p-6 text-sm text-slate-500">Broadcast WABA khusus Khasanah.</div>;
  if (data?.error) return <div className="p-6 text-sm text-red-600">{data.error}</div>;
  return <BroadcastClient initial={data} />;
}
