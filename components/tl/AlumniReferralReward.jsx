// Leaderboard "Alumni Referral Reward" — 3 besar TL dengan peserta terbanyak yang
// berhasil mereka ajak balik daftar (realtime dari self-report di portal TL).
// Tampil di paling atas semua halaman /tl (via app/(app)/tl/layout.jsx).

const MEDAL = ['🥇', '🥈', '🥉'];

export default function AlumniReferralReward({ rows = [] }) {
  const data = [...rows].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 3);
  return (
    <div className="rounded-2xl border border-indigo-300 bg-gradient-to-br from-indigo-50 via-violet-50 to-fuchsia-50 shadow-card overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-indigo-200/70 bg-indigo-100/60">
        <h2 className="font-extrabold text-indigo-800 text-sm sm:text-base flex items-center gap-2">
          🏆 Alumni Referral Reward
        </h2>
        <p className="text-[11px] text-indigo-700/80 mt-0.5">3 besar TL dengan peserta terbanyak yang berhasil diajak balik daftar (realtime dari input TL).</p>
      </div>
      {data.length === 0 ? (
        <div className="px-5 py-6 text-center text-sm text-slate-400">Belum ada data referral.</div>
      ) : (
        <ol className="divide-y divide-indigo-100">
          {data.map((r, i) => (
            <li key={r.name} className={`flex items-center gap-3 px-4 sm:px-5 py-2.5 ${i === 0 ? 'bg-indigo-100/40' : ''}`}>
              <span className="text-xl sm:text-2xl w-8 text-center shrink-0">{MEDAL[i] || `#${i + 1}`}</span>
              <span className={`flex-1 min-w-0 font-bold truncate ${i === 0 ? 'text-indigo-900 text-base sm:text-lg' : 'text-slate-700 text-sm sm:text-base'}`}>{r.name}</span>
              <span className="shrink-0 px-2.5 py-1 rounded-full bg-indigo-600 text-white text-xs sm:text-sm font-extrabold whitespace-nowrap">{r.count} peserta</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
