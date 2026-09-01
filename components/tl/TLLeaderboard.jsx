// Leaderboard "Best Performing TL for Private Group Sales 2026"
// Tampil di paling atas SEMUA halaman portal TL (via app/(app)/tl/layout.jsx),
// biar semua TL bisa lihat performa satu sama lain.
// omzet Wildan (PR001) & Aji Wirasakti (PR003) diambil LIVE dari data trip (di layout);
// Lalu Satria di-set manual: 3 group, proyeksi Rp 1,8 M.

const FALLBACK_2026 = [
  { name: 'Lalu Satria', groups: 3, omzet: 1800000000 },
  { name: 'Wildan Rivky', groups: 1, omzet: 0 },
  { name: 'Aji Wirasakti', groups: 1, omzet: 0 },
];

const MEDAL = ['🥇', '🥈', '🥉'];

// Format ringkas: Rp 1,8 M / Rp 920,8 jt.
function fmtOmzet(n) {
  const v = Number(n) || 0;
  if (v <= 0) return '—';
  if (v >= 1e9) return `Rp ${(v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (v >= 1e6) return `Rp ${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  return `Rp ${v.toLocaleString('id-ID')}`;
}

export default function TLLeaderboard({ rows = FALLBACK_2026 }) {
  const data = [...rows].sort((a, b) => (b.groups || 0) - (a.groups || 0) || (b.omzet || 0) - (a.omzet || 0));
  const totalOmzet = data.reduce((s, r) => s + (Number(r.omzet) || 0), 0);
  return (
    <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 shadow-card overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-amber-200/70 bg-amber-100/60 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-extrabold text-amber-800 text-sm sm:text-base flex items-center gap-2">
            🏆 Best Performing TL for Private Group Sales 2026
          </h2>
          <p className="text-[11px] text-amber-700/80 mt-0.5">Ranking TL berdasarkan jumlah private group + proyeksi omzet yang di-closing tahun 2026.</p>
        </div>
        {totalOmzet > 0 && (
          <div className="text-right shrink-0">
            <p className="text-[10px] font-bold text-amber-700/70 uppercase tracking-wide">Total Proyeksi</p>
            <p className="text-sm sm:text-base font-extrabold text-amber-900">{fmtOmzet(totalOmzet)}</p>
          </div>
        )}
      </div>
      <ol className="divide-y divide-amber-100">
        {data.map((r, i) => (
          <li key={r.name} className={`flex items-center gap-3 px-4 sm:px-5 py-2.5 ${i === 0 ? 'bg-amber-100/40' : ''}`}>
            <span className="text-xl sm:text-2xl w-8 text-center shrink-0">{MEDAL[i] || `#${i + 1}`}</span>
            <span className={`flex-1 min-w-0 font-bold truncate ${i === 0 ? 'text-amber-900 text-base sm:text-lg' : 'text-slate-700 text-sm sm:text-base'}`}>{r.name}</span>
            <div className="shrink-0 flex items-center gap-1.5 sm:gap-2">
              <span className="px-2.5 py-1 rounded-full bg-white/80 border border-amber-200 text-amber-800 text-xs sm:text-sm font-extrabold whitespace-nowrap">
                {r.groups} group
              </span>
              <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-xs sm:text-sm font-extrabold whitespace-nowrap" title="Proyeksi omzet group">
                {fmtOmzet(r.omzet)}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
