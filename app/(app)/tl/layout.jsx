// Layout portal TL — menempelkan leaderboard "Best Performing TL for Private
// Group Sales 2026" di paling atas SEMUA halaman /tl (dashboard + detail trip),
// biar semua TL bisa lihat performa satu sama lain.
import TLLeaderboard from '@/components/tl/TLLeaderboard';

export default function TLLayout({ children }) {
  return (
    <div className="space-y-6">
      <div className="max-w-6xl mx-auto">
        <TLLeaderboard />
      </div>
      {children}
    </div>
  );
}
