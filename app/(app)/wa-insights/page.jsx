// Insights WhatsApp (Khasanah) — khusus owner/manager/accounting.
import { getInsights } from '@/lib/actions/wa-inbox';
import InsightsClient from '@/components/inbox/InsightsClient';

export const dynamic = 'force-dynamic';

export default async function WaInsightsPage() {
  const data = await getInsights({ days: 14 });
  if (data?.notKhasanah) return <div className="p-6 text-sm text-slate-500">Insights WhatsApp khusus Khasanah.</div>;
  if (data?.error) return <div className="p-6 text-sm text-red-600">{data.error}</div>;
  return <InsightsClient data={data} />;
}
