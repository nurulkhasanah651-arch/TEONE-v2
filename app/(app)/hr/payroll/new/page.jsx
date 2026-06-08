// Round 171: Generate Payroll baru
// Path: app/(app)/hr/payroll/new/page.jsx

import Link from 'next/link';
import { generatePayroll } from '@/lib/actions/payroll';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

export default async function NewPayrollPage() {
  const supabase = createClient();
  const { count: activeCount } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <Link href="/hr/payroll" className="text-sm text-brand-600 font-medium hover:underline">← Payroll</Link>
        <h1 className="mt-1 text-3xl font-bold text-brand-700">+ Generate Payroll</h1>
        <p className="text-sm text-slate-600 mt-1">
          System bakal auto-bikin slip gaji untuk {activeCount || 0} karyawan active.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-bold mb-1">⚙ Logic auto-hitung:</p>
        <ul className="list-disc pl-5 text-xs space-y-1">
          <li><b>Full-time/Part-time/Contract</b>: gaji pokok + tunjangan transport + uang makan - BPJS</li>
          <li><b>Tour Leader</b>: per_trip_fee × jumlah trip departed di bulan target (auto-count dari Master Trip)</li>
          <li><b>Freelance</b>: di-generate 0, manual input nanti di edit payslip</li>
        </ul>
        <p className="mt-2 text-xs">Setelah generate, kamu bisa edit per karyawan untuk tambah bonus, overtime, kasbon, dll.</p>
      </div>

      <form action={generatePayroll} className="bg-white rounded-xl border border-slate-200 shadow-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 block mb-1">Bulan</span>
            <select name="month" defaultValue={currentMonth} className={inputCls}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-slate-700 block mb-1">Tahun</span>
            <select name="year" defaultValue={currentYear} className={inputCls}>
              {[currentYear-1, currentYear, currentYear+1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700 block mb-1">Catatan (opsional)</span>
          <textarea autoComplete="off" name="notes" rows="2" placeholder="Misal: 'Payroll dengan THR Lebaran'" className={inputCls + ' resize-y'} />
        </label>

        <div className="flex gap-3 justify-end pt-2 border-t border-slate-200">
          <Link href="/hr/payroll" className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded">Batal</Link>
          <button type="submit" className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded shadow-card">
            ⚙ Generate Payroll
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
