// Round 173 FIX v2: Edit Karyawan — pakai service client (bypass RLS)
// Path: app/(app)/hr/employees/[id]/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { updateEmployee } from '@/lib/actions/hr';
import EmployeeForm from '@/components/hr/EmployeeForm';
import EmployeeActionButtons from '@/components/hr/EmployeeActionButtons';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function EditEmployeePage(props) {
  // Compatible Next.js 14 + 15
  const params = await Promise.resolve(props.params);
  const idRaw = params?.id;

  if (!idRaw) {
    return <ErrorView title="ID karyawan kosong" message="URL tidak valid" />;
  }

  // Coba kedua tipe — string dan number
  const idNum = parseInt(idRaw, 10);

  let employee = null;
  let fetchError = null;
  let debugInfo = `URL id: ${idRaw} (parsed: ${idNum})`;

  try {
    // Pakai service client (bypass RLS)
    const supabase = getServiceClient() || createClient();

    // Try with number first
    let res = await supabase
      .from('employees')
      .select('*')
      .eq('id', idNum)
      .maybeSingle();

    if (res.error) {
      fetchError = `Query error: ${res.error.message}`;
    } else if (res.data) {
      employee = res.data;
    } else {
      // Fallback: try with string
      res = await supabase
        .from('employees')
        .select('*')
        .eq('id', idRaw)
        .maybeSingle();
      if (res.data) {
        employee = res.data;
      } else {
        // Debug: list semua employees biar tau ada apa enggak
        const allRes = await supabase
          .from('employees')
          .select('id, full_name')
          .order('id', { ascending: false })
          .limit(5);

        const allIds = (allRes.data || []).map((e) => `${e.id} (${e.full_name})`).join(', ');
        debugInfo += ` · DB last 5 employees: [${allIds || 'KOSONG'}]`;
      }
    }
  } catch (e) {
    fetchError = `Exception: ${e?.message || 'Unknown'}`;
  }

  if (fetchError) {
    return <ErrorView title="⚠ Error fetch karyawan" message={fetchError} debug={debugInfo} />;
  }

  if (!employee) {
    return <ErrorView title="Karyawan tidak ditemukan" message={`ID: ${idRaw}`} debug={debugInfo} />;
  }

  const action = updateEmployee.bind(null, employee.id);

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

function ErrorView({ title, message, debug }) {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6">
        <h1 className="text-xl font-bold text-amber-800 mb-2">{title}</h1>
        <p className="text-sm text-amber-700 mb-3">{message}</p>
        {debug && (
          <p className="text-[11px] font-mono text-slate-600 bg-white border border-amber-200 rounded p-2 mb-3 break-all">
            🐛 Debug: {debug}
          </p>
        )}
        <Link href="/hr/employees" className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded inline-block">
          ← Kembali ke list
        </Link>
      </div>
    </div>
  );
}
