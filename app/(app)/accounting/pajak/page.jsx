// Halaman Pajak Tahunan (otomatis) + kalkulator manual — era Coretax.
// Path: app/(app)/accounting/pajak/page.jsx
import Link from 'next/link';
import TaxAnnualPanel from '@/components/accounting/TaxAnnualPanel';
import TaxCalculatorCoretax from '@/components/accounting/TaxCalculatorCoretax';

export const dynamic = 'force-dynamic';

export default function PajakPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/accounting" className="text-sm text-brand-600 font-medium hover:underline">← Accounting</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Pajak Tahunan</h1>
        <p className="mt-1 text-slate-600">Hitung otomatis PPN & PPh tiap tahun dari omzet & laba riil (era Coretax).</p>
      </div>

      <TaxAnnualPanel />
      <TaxCalculatorCoretax />
    </div>
  );
}
