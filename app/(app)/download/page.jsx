// Download Center — pusat download CSV semua tab (monthly atau all-time)

'use client';

import { useState } from 'react';

const SECTIONS = [
  {
    title: 'Master Trip',
    icon: '✈',
    color: 'from-brand-500 to-brand-700',
    items: [
      { label: 'Semua data trip', url: '/trips/export.csv', monthFilter: true, dateField: 'departure' },
    ],
  },
  {
    title: 'CS Daily',
    icon: '☎',
    color: 'from-green-500 to-green-700',
    items: [
      { label: 'CS daily updates (closing & leads harian)', url: '/cs/export.csv', monthFilter: true, dateField: 'tanggal' },
    ],
  },
  {
    title: 'Finance',
    icon: '$',
    color: 'from-blue-500 to-blue-700',
    items: [
      { label: 'HPP & Income items', url: '/finance/export.csv?type=items', monthFilter: true, dateField: 'created_at' },
      { label: 'Payment peserta (cicilan)', url: '/finance/export.csv?type=payments', monthFilter: true, dateField: 'paid_at' },
    ],
  },
  {
    title: 'Accounting',
    icon: '📊',
    color: 'from-purple-500 to-purple-700',
    items: [
      { label: 'Cash in/out entries', url: '/accounting/export.csv?type=entries', monthFilter: true, dateField: 'date' },
      { label: 'Daftar akun bank/kas', url: '/accounting/export.csv?type=accounts', monthFilter: false },
    ],
  },
  {
    title: 'Ads Manager',
    icon: '🎯',
    color: 'from-orange-500 to-orange-700',
    items: [
      { label: 'Ads spend & leads per platform', url: '/ads/export.csv', monthFilter: true, dateField: 'date' },
    ],
  },
  {
    title: 'Visa',
    icon: '🛂',
    color: 'from-indigo-500 to-indigo-700',
    items: [
      { label: 'Visa report per peserta (status + dokumen)', url: '/visa/export.csv', monthFilter: true, dateField: 'departure' },
    ],
  },
  {
    title: 'Portal TL',
    icon: '👤',
    color: 'from-pink-500 to-pink-700',
    items: [
      { label: 'Trip yang ada TL assigned', url: '/tl/export.csv?type=trips', monthFilter: true, dateField: 'departure' },
      { label: 'Petty cash expense TL', url: '/tl/export.csv?type=expenses', monthFilter: true, dateField: 'date' },
    ],
  },
  {
    title: 'Master TL',
    icon: '👥',
    color: 'from-rose-500 to-rose-700',
    items: [
      { label: 'Daftar lengkap TL (inhouse + freelance)', url: '/tl-master/export.csv', monthFilter: false },
    ],
  },
];

function getMonthOptions() {
  const opts = [{ value: 'all', label: 'Semua Periode (All Time)' }];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    opts.push({ value: v, label });
  }
  return opts;
}

export default function DownloadCenterPage() {
  const [month, setMonth] = useState('all');
  const months = getMonthOptions();

  function buildUrl(baseUrl, monthFilter) {
    if (!monthFilter) return baseUrl;
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}month=${month}`;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">📥 Download Center</h1>
        <p className="mt-1 text-slate-600">
          Export data dari semua tab dalam format CSV. Pilih periode di atas, klik tombol untuk download.
        </p>
      </div>

      {/* Period picker */}
      <div className="bg-white rounded-xl border-2 border-brand-200 shadow-card p-5">
        <label className="block">
          <span className="text-sm font-bold text-brand-700">📅 Periode Data</span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-2 w-full md:w-1/2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
          >
            {months.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <p className="text-xs text-slate-500 mt-1">
            {month === 'all'
              ? 'Akan download SEMUA data dari awal sampai sekarang.'
              : `Hanya data dengan tanggal di bulan ${months.find((m) => m.value === month)?.label}.`}
          </p>
        </label>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SECTIONS.map((s) => (
          <div key={s.title} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            <div className={`h-1.5 bg-gradient-to-r ${s.color}`} />
            <div className="p-4 space-y-3">
              <h2 className="font-bold text-brand-700 flex items-center gap-2">
                <span className="text-xl">{s.icon}</span> {s.title}
              </h2>
              <div className="space-y-2">
                {s.items.map((item) => (
                  <a
                    key={item.url}
                    href={buildUrl(item.url, item.monthFilter)}
                    download
                    className="flex items-center justify-between gap-2 p-2 bg-slate-50 hover:bg-brand-50 rounded text-sm transition-colors group"
                  >
                    <span className="text-slate-700">
                      📄 {item.label}
                      {!item.monthFilter && <span className="ml-1 text-[10px] text-slate-400 uppercase">no period filter</span>}
                    </span>
                    <span className="text-xs font-semibold text-brand-600 group-hover:text-brand-700">⬇ Download CSV</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tips */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
        <p className="font-bold text-amber-800">💡 Tips</p>
        <ul className="mt-2 space-y-1 text-amber-700 text-xs">
          <li>• File CSV bisa langsung dibuka di Excel atau Google Sheets — UTF-8 BOM agar nama Indonesia tampil benar</li>
          <li>• Filter "Semua Periode" = export seluruh history. Filter bulan = cuma data dengan tanggal di bulan itu</li>
          <li>• Filter bulan pakai field tanggal masing-masing data (Trip: departure, CS: tanggal, Accounting: date, dll)</li>
          <li>• File akan ter-download ke folder Downloads di komputer kamu</li>
          <li>• Nama file format: <code className="bg-amber-100 px-1 rounded">[data]_[periode]_[tanggal-download].csv</code></li>
        </ul>
      </div>
    </div>
  );
}
