'use client';

// Round 170: EmployeeActionButtons — delete + toggle status
// Path: components/hr/EmployeeActionButtons.jsx

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEmployee, toggleEmployeeStatus } from '@/lib/actions/hr';

export default function EmployeeActionButtons({ employeeId, status }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    const newStatus = status === 'active' ? 'inactive' : 'active';
    startTransition(async () => {
      const r = await toggleEmployeeStatus(employeeId, newStatus);
      if (r?.error) alert(r.error);
      else router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm('Hapus karyawan ini? Semua data (payroll, absensi, KPI) ikut terhapus.')) return;
    startTransition(async () => {
      const r = await deleteEmployee(employeeId);
      if (r?.error) alert(r.error);
      else router.push('/hr/employees');
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className={`px-3 py-1.5 text-xs font-semibold rounded ${status === 'active' ? 'bg-amber-100 hover:bg-amber-200 text-amber-800' : 'bg-green-100 hover:bg-green-200 text-green-800'} disabled:opacity-50`}
      >
        {status === 'active' ? '⏸ Set Inactive' : '▶ Set Active'}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded disabled:opacity-50"
      >
        🗑 Hapus
      </button>
    </div>
  );
}
