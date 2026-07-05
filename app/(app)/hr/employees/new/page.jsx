// Round 170: Tambah Karyawan Baru
// Path: app/(app)/hr/employees/new/page.jsx

import Link from 'next/link';
import { createEmployee } from '@/lib/actions/hr';
import EmployeeForm from '@/components/hr/EmployeeForm';

export const dynamic = 'force-dynamic';

export default async function NewEmployeePage({ searchParams }) {
  const sp = (await searchParams) || {};
  const defaultType = typeof sp.type === 'string' ? sp.type : '';
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <Link href="/hr/employees" className="text-sm text-brand-600 font-medium hover:underline">← Karyawan</Link>
        <h1 className="mt-1 text-3xl font-bold text-brand-700">+ {defaultType === 'tour_leader' ? 'Tour Leader Baru' : 'Karyawan Baru'}</h1>
        <p className="text-sm text-slate-600 mt-1">Isi data karyawan baru. Semua field bisa diedit nanti.</p>
      </div>
      <EmployeeForm action={createEmployee} employee={null} submitLabel="Simpan Karyawan" defaultType={defaultType} />
    </div>
  );
}
