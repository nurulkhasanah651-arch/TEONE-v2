// Halaman EDIT Karyawan — render EmployeeForm dgn data karyawan + action updateEmployee.
// (Sebelumnya file ini keliru berisi salinan halaman daftar, jadi tombol Edit tidak berfungsi.)
// Path: app/(app)/hr/employees/[id]/page.jsx

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { updateEmployee } from '@/lib/actions/hr';
import EmployeeForm from '@/components/hr/EmployeeForm';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function EditEmployeePage({ params }) {
  const { id } = await params;
  const db = getServiceClient();
  if (!db) notFound();
  const { data: emp } = await db.from('employees').select('*').eq('id', id).maybeSingle();
  if (!emp) notFound();

  const action = updateEmployee.bind(null, id);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/hr/employees" className="text-sm text-brand-600 font-medium hover:underline">← Karyawan</Link>
        <h1 className="mt-1 text-3xl font-bold text-brand-700">✏️ Edit Karyawan — {emp.full_name}</h1>
      </div>
      <EmployeeForm action={action} employee={emp} submitLabel="Update Karyawan" />
    </div>
  );
}
