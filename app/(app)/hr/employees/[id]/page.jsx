// Round 173 FIX: Edit Karyawan — compatible Next.js 14 (sync params)
// Path: app/(app)/hr/employees/[id]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { updateEmployee } from '@/lib/actions/hr';
import EmployeeForm from '@/components/hr/EmployeeForm';
import EmployeeActionButtons from '@/components/hr/EmployeeActionButtons';

export const dynamic = 'force-dynamic';

export default async function EditEmployeePage(props) {
  // Compatible Next.js 14 + 15: handle both sync and async params
  const params = await Promise.resolve(props.params);
  const id = params?.id;

  if (!id) notFound();

  let employee = null;
  let fetchError = null;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) fetchError = error.message;
    else employee = data;
  } catch (e) {
    fetchError = e?.message || 'Unknown error';
  }

  if (fetchError) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
          <h1 className="text-xl font-bold text-red-800 mb-2">⚠ Error fetch karyawan</h1>
          <p className="text-sm text-red-700 mb-3">{fetchError}</p>
          <Link href="/hr/employees" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded">
            ← Kembali ke list
          </Link>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
          <h1 className="text-xl font-bold text-amber-800 mb-2">Karyawan tidak ditemukan</h1>
          <p className="text-sm text-amber-700 mb-3">ID: {id}</p>
          <Link href="/hr/employees" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded">
            ← Kembali ke list
          </Link>
        </div>
      </div>
    );
  }

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
