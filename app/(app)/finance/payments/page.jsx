// Payment Checklist Peserta — placeholder, full build next

import Link from 'next/link';

export default function PaymentsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/finance" className="text-sm text-brand-600 font-medium hover:underline">← Finance</Link>
        <h1 className="mt-2 text-3xl font-bold text-brand-700">Payment Checklist Peserta</h1>
        <p className="mt-1 text-slate-600">Tracking DP, Payment 1/2/3, Pelunasan per peserta.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-8 text-center">
        <p className="text-5xl mb-4">🧾</p>
        <h2 className="text-xl font-bold text-brand-700">Coming Soon</h2>
        <p className="mt-2 text-slate-600 max-w-md mx-auto">
          Section ini sedang dibangun. Fitur yang direncanakan: tracking DP, Payment 1/2/3, Pelunasan, Visa, Asuransi per peserta — dengan progress per trip ("3 org belum bayar Payment 2").
        </p>
        <Link href="/finance" className="mt-5 inline-block px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors">
          Kembali
        </Link>
      </div>
    </div>
  );
}
