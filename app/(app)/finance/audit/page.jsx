// Audit Tagihan — jaring pengaman finance.
// Bandingkan tagihan yg SEHARUSNYA (dihitung ulang dari Master Trip) vs yg DIPAKAI SISTEM.
// Path: app/(app)/finance/audit/page.jsx
import { getBillingAudit } from '@/lib/actions/billing-audit';
import AuditClient from './AuditClient';

export const dynamic = 'force-dynamic';

export default async function AuditTagihanPage() {
  const r = await getBillingAudit();
  if (r?.error) {
    return (
      <div className="max-w-3xl mx-auto bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-medium">
        ⚠ {r.error}
      </div>
    );
  }
  return <AuditClient trips={r.trips || []} ringkas={r.ringkas} />;
}
