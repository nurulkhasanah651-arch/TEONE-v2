// Leaderboard "Best Performing TL for Private Group Sales 2026"
// Tampil di paling atas SEMUA halaman portal TL (via app/(app)/tl/layout.jsx),
// biar semua TL bisa lihat performa satu sama lain.
// Data sementara di-hardcode; nanti bisa disambung ke query private-trips per TL.

const LEADERBOARD_2026 = [
  { name: 'Satria', groups: 3 },
  { name: 'Wildan Rivky', groups: 1 },
  { name: 'Aji Wirasakti', groups: 1 },
];

const MEDAL = ['🥇', '🥈', '🥉'];

export default function TLLeaderboard({ rows = LEADERBOARD_2026 }) {
  const data = [...rows].sort((a, b) => (b.groups || 0) - (a.groups || 0));
  return (
    <div className="rounded-2xl border border-amber-300 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 shadow-card overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-amber-200/70 bg-amber-100/60">
        <h2 className="font-extrabold text-amber-800 text-sm sm:text-base flex items-center gap-2">
          🏆 Best Performing TL for Private Group Sales 2026
        </h2>
        <p className="text-[11px] text-amber-700/80 mt-0.5">Ranking TL berdasarkan jumlah private group yang berhasil di-closing tahun 2026.</p>
      </div>
      <ol className="divide-y divide-amber-100">
        {data.map((r, i) => (
          <li key={r.name} className={`flex items-center gap-3 px-4 sm:px-5 py-2.5 ${i === 0 ? 'bg-amber-100/40' : ''}`}>
            <span className="text-xl sm:text-2xl w-8 text-center shrink-0">{MEDAL[i] || `#${i + 1}`}</span>
            <span className={`flex-1 font-bold ${i === 0 ? 'text-amber-900 text-base sm:text-lg' : 'text-slate-700 text-sm sm:text-base'}`}>{r.name}</span>
            <span className="shrink-0 px-2.5 py-1 rounded-full bg-white/80 border border-amber-200 text-amber-800 text-xs sm:text-sm font-extrabold">
              {r.groups} group
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
