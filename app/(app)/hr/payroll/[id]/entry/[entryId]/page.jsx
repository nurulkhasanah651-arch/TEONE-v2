// Round 176: Payslip detail — + Download PDF + Send WA actions
// Path: app/(app)/hr/payroll/[id]/entry/[entryId]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { updatePayrollEntry, markEntryAsPaid } from '@/lib/actions/payroll';
import { sendInternalPayslipToWA } from '@/lib/actions/payslip-extras';
import PayslipForm from '@/components/hr/PayslipForm';
import PayslipActionsBar from '@/components/hr/PayslipActionsBar';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function PayslipEditPage(props) {
  const params = await Promise.resolve(props.params);
  const { id, entryId } = params || {};

  const supabase = getServiceClient() || createClient();

  const { data: entry } = await supabase
    .from('payroll_entries')
    .select('*, employee:employees(*), period:payroll_periods(*)')
    .eq('id', entryId)
    .eq('period_id', id)
    .maybeSingle();

  if (!entry) notFound();

  const action = updatePayrollEntry.bind(null, entryId);
  const sendWAAction = sendInternalPayslipToWA.bind(null, entryId);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <Link href={`/hr/payroll/${id}`} className="text-sm text-brand-600 font-medium hover:underline">← {entry.period?.period_label}</Link>
        <h1 className="mt-1 text-3xl font-bold text-brand-700">💼 Slip Gaji — {entry.employee?.full_name}</h1>
        <p className="text-sm text-slate-600 mt-1">
          {entry.employee?.position || entry.employee?.role} · {entry.period?.period_label} ·
          <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${entry.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {entry.status?.toUpperCase()}
          </span>
        </p>
      </div>

      {/* R176: Download slip + Send WA */}
      <PayslipActionsBar entry={entry} sendWAAction={sendWAAction} />

      <PayslipForm entry={entry} action={action} markPaidAction={markEntryAsPaid} />
    </div>
  );
}
