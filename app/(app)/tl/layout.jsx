// Layout portal TL — menempelkan leaderboard "Best Performing TL for Private
// Group Sales 2026" di paling atas SEMUA halaman /tl (dashboard + detail trip).
// Omzet Wildan (PR001) & Aji Wirasakti (PR003) dihitung LIVE dari total price_paid
// peserta aktif; Lalu Satria di-set manual Rp 1,8 M (3 group).
import TLLeaderboard from '@/components/tl/TLLeaderboard';
import AlumniReferralReward from '@/components/tl/AlumniReferralReward';
import { serviceClientFor } from '@/lib/supabase/service-env';

export const dynamic = 'force-dynamic';

// Proyeksi uang masuk 1 trip = total price_paid peserta aktif (bukan transfer/refund).
async function tripProjection(client, kode) {
  try {
    const { data: t } = await client.from('trips').select('id').eq('kode_trip', kode).maybeSingle();
    if (!t?.id) return 0;
    let sum = 0;
    for (let from = 0; ; from += 1000) {
      const { data: pax, error } = await client.from('trip_passengers')
        .select('price_paid, transfer_status, refund_status').eq('trip_id', t.id).range(from, from + 999);
      if (error) break;
      for (const p of (pax || [])) {
        if (p.transfer_status === 'transferred' || p.refund_status === 'refunded' || p.refund_status === 'partial_refund') continue;
        sum += Number(p.price_paid) || 0;
      }
      if (!pax || pax.length < 1000) break;
    }
    return sum;
  } catch { return 0; }
}

export default async function TLLayout({ children }) {
  const rows = [
    { name: 'Lalu Satria', groups: 3, omzet: 1800000000 },
    { name: 'Wildan Rivky', groups: 1, omzet: 0 },
    { name: 'Aji Wirasakti', groups: 1, omzet: 0 },
  ];
  try {
    const c = serviceClientFor('teone');
    if (c) {
      const [pr001, pr003] = await Promise.all([
        tripProjection(c, 'PR001'),
        tripProjection(c, 'PR003'),
      ]);
      rows[1].omzet = pr001;
      rows[2].omzet = pr003;
    }
  } catch {}

  // Alumni Referral Reward: 3 besar TL by jumlah referral (self-report), realtime, gabung 2 brand.
  let alumniRows = [];
  try {
    const byTl = {};
    for (const bc of ['teone', 'khasanah']) {
      const cc = serviceClientFor(bc);
      if (!cc) continue;
      const { data } = await cc.from('tl_referrals').select('tl_name, tl_email').limit(5000);
      for (const r of (data || [])) {
        const key = String(r.tl_email || r.tl_name || '-').toLowerCase();
        if (!byTl[key]) byTl[key] = { name: r.tl_name || r.tl_email || '-', count: 0 };
        byTl[key].count++;
      }
    }
    alumniRows = Object.values(byTl).sort((a, b) => b.count - a.count).slice(0, 3);
  } catch {}

  return (
    <div className="space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <TLLeaderboard rows={rows} />
        <AlumniReferralReward rows={alumniRows} />
      </div>
      {children}
    </div>
  );
}
