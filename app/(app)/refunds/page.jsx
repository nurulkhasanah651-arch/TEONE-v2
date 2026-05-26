// Round 116: Refund management page — list semua refund + approve/reject
// Path: app/(app)/refunds/page.jsx

import { createClient } from '@/lib/supabase/server';
import { getRefunds } from '@/lib/actions/refunds';
import RefundsTable from './RefundsTable';

export const dynamic = 'force-dynamic';

export default async function RefundsPage({ searchParams }) {
  const sp = await searchParams;
  const filterStatus = sp?.status || 'pending_approval';

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userEmail = user?.email || '';

  // Fetch all refunds (filter by status if any)
  const refundsRes = await getRefunds({
    status: filterStatus === 'all' ? null : filterStatus,
  });
  const refunds = refundsRes?.data || [];

  // Counts per status
  const allRes = await getRefunds({});
  const all = allRes?.data || [];
  const counts = {
    pending_approval: all.filter((r) => r.status === 'pending_approval').length,
    approved: all.filter((r) => r.status === 'approved').length,
    rejected: all.filter((r) => r.status === 'rejected').length,
    all: all.length,
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">💸 Manajemen Refund</h1>
        <p className="mt-1 text-slate-600">List refund peserta + approval workflow</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <FilterTab href="?status=pending_approval" active={filterStatus === 'pending_approval'} count={counts.pending_approval} label="Pending Approval" color="amber" />
        <FilterTab href="?status=approved" active={filterStatus === 'approved'} count={counts.approved} label="Approved" color="green" />
        <FilterTab href="?status=rejected" active={filterStatus === 'rejected'} count={counts.rejected} label="Rejected" color="red" />
        <FilterTab href="?status=all" active={filterStatus === 'all'} count={counts.all} label="Semua" color="slate" />
      </div>

      {/* Table */}
      <RefundsTable refunds={refunds} userEmail={userEmail} />
    </div>
  );
}

function FilterTab({ href, active, count, label, color }) {
  const colorMap = {
    amber: active ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200',
    green: active ? 'bg-green-500 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200',
    red: active ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200',
    slate: active ? 'bg-slate-700 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200',
  };
  return (
    <a href={href} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${colorMap[color]}`}>
      {label} <span className="ml-1 opacity-75">({count})</span>
    </a>
  );
}
