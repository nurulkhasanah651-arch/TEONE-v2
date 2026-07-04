export const dynamic = 'force-dynamic';
import { getTlPlotting } from '@/lib/actions/tl-plotting';
import TlPlottingView from '@/components/tl/TlPlottingView';

export default async function TlPlottingPage() {
  const r = await getTlPlotting();
  if (r?.error) {
    return <div className="max-w-2xl mx-auto p-6 text-sm text-slate-500">{r.error === 'Akses khusus management' ? 'Halaman ini khusus management (owner/manager/ops).' : 'Perlu login.'}</div>;
  }
  return <TlPlottingView trips={r.trips || []} />;
}
