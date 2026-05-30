// Round 171: Payslip detail — edit per karyawan
// Path: app/(app)/hr/payroll/[id]/entry/[entryId]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updatePayrollEntry, markEntryAsPaid } from '@/lib/actions/payroll';
import PayslipForm from '@/components/hr/PayslipForm';

export const dynamic = 'force-dynamic';

export default async function PayslipEditPage({ params }) {
  const { id, entryId } = await params;
  const supabase = createClient();

  const { data: entry } = await supabase
    .from('payroll_entries')
    .select('*, employee:employees(*), period:payroll_periods(*)')
    .eq('id', entryId)
    .eq('period_id', id)
    .maybeSingle();

  if (!entry) notFound();

  const action = updatePayrollEntry.bind(null, entryId);

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

      <PayslipForm entry={entry} action={action} markPaidAction={markEntryAsPaid} />
    </div>
  );
}
