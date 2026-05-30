// Round 170: Edit Karyawan
// Path: app/(app)/hr/employees/[id]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateEmployee } from '@/lib/actions/hr';
import EmployeeForm from '@/components/hr/EmployeeForm';
import EmployeeActionButtons from '@/components/hr/EmployeeActionButtons';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage({ params }) {
  const { id } = await params;
  const supabase = createClient();
  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (!employee) notFound();

  const action = updateEmployee.bind(null, id);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/hr/employees" className="text-sm text-brand-600 font-medium hover:underline">← Karyawan</Link>
          <h1 className="mt-1 text-3xl font-bold text-brand-700">✏️ {employee.full_name}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {employee.role || '-'} · {employee.position || '-'} ·
            <span className={`ml-1 text-xs px-1.5 py-0.5 rounded ${employee.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'}`}>
              {employee.status?.toUpperCase()}
            </span>
          </p>
        </div>
        <EmployeeActionButtons employeeId={employee.id} status={employee.status} />
      </div>

      <EmployeeForm action={action} employee={employee} submitLabel="💾 Simpan Perubahan" />
    </div>
  );
}
