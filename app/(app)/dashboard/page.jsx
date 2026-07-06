// Dashboard — Round 74: sync Total Leads ke cs_daily_leads (global, organic + ads)
// Tidak lagi aggregate per trip — pakai 1 source of truth dari /cs page

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { greeting, fmtRupiah, fmtDate, daysUntil } from '@/lib/utils/format';
import { mainExpectedPerPassenger } from '@/lib/utils/price-breakdown';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { getRoleFromUser, filterNavByRole } from '@/lib/utils/roles';
import { getBrandCode } from '@/lib/brand';
import { BRAND_UI } from '@/lib/brand-shared';
import ReviewPendingCard from '@/components/common/ReviewPendingCard';

export const dynamic = 'force-dynamic';

const ALL_QUICK = [
  { href: '/trips',             icon: '✈',   label: 'Master Trip',     color: 'from-brand-500 to-brand-700' },
  { href: '/cs',                icon: '☎',   label: 'CS Daily',        color: 'from-green-500 to-green-700' },
  { href: '/cs/new',            icon: '➕',  label: 'Input CS Baru',   color: 'from-green-400 to-green-600' },
  { href: '/finance',           icon: '$',   label: 'Finance',         color: 'from-blue-500 to-blue-700' },
  { href: '/finance/payments',  icon: '🧾',  label: 'Payment Peserta', color: 'from-blue-400 to-blue-600' },
  { href: '/accounting',        icon: '📊',  label: 'Accounting',      color: 'from-purple-500 to-purple-700' },
  { href: '/ads',               icon: '🎯',  label: 'Ads Manager',     color: 'from-orange-500 to-orange-700' },
  { href: '/visa',              icon: '🛂',  label: 'Visa',            color: 'from-indigo-500 to-indigo-700' },
  { href: '/tl',                icon: '👤',  label: 'Portal TL',       color: 'from-pink-500 to-pink-700' },
  { href: '/tl-master',         icon: '👥',  label: 'Master TL',       color: 'from-rose-500 to-rose-700' },
  { href: '/tasks',             icon: '✅',  label: 'To-Do List',      color: 'from-amber-500 to-amber-700' },
  { href: '/chat',              icon: '💬',  label: 'Chat Tim',        color: 'from-cyan-500 to-cyan-700' },
];

function sumOrganic(l) {
  return (l?.leads_ig || 0) + (l?.leads_tiktok || 0) + (l?.leads_wa || 0) + (l?.leads_fb || 0);
}
function sumAds(l) {
  return (l?.leads_ads_meta || 0) + (l?.leads_ads_google || 0) + (l?.leads_ads_tiktok || 0);
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = getRoleFromUser(user);
  const today = new Date().toISOString().slice(0, 10);

  // Fetch all data in parallel
  const [tripsRes, allPaxArr, csTodayRes, dailyLeadsRes, adsTodayRes] = await Promise.all([
    supabase.from('trips').select('*').order('departure', { ascending: true, nullsFirst: false }),
    fetchAll(() => supabase.from('trip_passengers').select('trip_id, room_type, age_type, price_paid, discount_amount, status, refund_status')),
    supabase.from('cs_daily_updates').select('*').eq('tanggal', today),
    supabase.from('cs_daily_leads').select('*').eq('tanggal', today).maybeSingle(),
    supabase.from('ads_entries').select('*').eq('date', today),
  ]);

  let trips = tripsRes.data || [];
  let allPax = allPaxArr || [];

  // Role PIC: dashboard hanya menampilkan trip yang di-assign ke dia
  let dbRole = role;
  let dbName = '';
  {
    const { data: u } = await supabase.from('users').select('role, name').eq('id', user?.id).maybeSingle();
    if (u?.role === 'pic') dbRole = 'pic';
    dbName = u?.name || '';
  }
  if (dbRole === 'pic') {
    const email = (user?.email || '').toLowerCase();
    const nm = dbName.toLowerCase();
    trips = trips.filter((t) =>
      (t.pic_email && t.pic_email.toLowerCase() === email) ||
      (t.pic && nm && t.pic.toLowerCase() === nm)
    );
    const myTripIds = new Set(trips.map((t) => t.id));
    allPax = allPax.filter((p) => myTripIds.has(p.trip_id));
  }
  const csToday = csTodayRes.data || [];
  const dailyLeads = dailyLeadsRes.data;
  const adsToday = adsTodayRes.data || [];

  // Aggregate paxByTrip
  const paxByTrip = {};
  for (const p of allPax) {
    if (!paxByTrip[p.trip_id]) paxByTrip[p.trip_id] = [];
    paxByTrip[p.trip_id].push(p);
  }

  // Compute Expected Revenue
  let totalExpectedRevenue = 0;
  for (const t of trips) {
    if (t.status === 'cancelled') continue;
    const breakdown = t.price_breakdown || {};
    const pax = paxByTrip[t.id] || [];
    for (const p of pax) {
      totalExpectedRevenue += mainExpectedPerPassenger(p, breakdown);
    }
  }

  // Hero stats
  const totalTrips = trips.length;
  const openSelling = trips.filter((t) => t.status === 'open selling').length;
  const totalSeatLeft = trips.reduce((s, t) => s + (t.seat_left || 0), 0);
  const totalPax = allPax.length;

  // === LEADS HARI INI — sync ke cs_daily_leads (global) ===
  const todayOrganicLeads = sumOrganic(dailyLeads);
  const todayAdsLeadsTotal = sumAds(dailyLeads);
  const todayTotalLeads = todayOrganicLeads + todayAdsLeadsTotal;

  // === CLOSING HARI INI — aggregate dari cs_daily_updates per trip ===
  const todayClosingTotal = csToday.reduce((s, c) =>
    s + (c.from_instagram || 0) + (c.from_whatsapp || 0) + (c.from_offline || 0)
      + (c.closing_alumni || 0) + (c.closing_mitra || 0) + (c.from_website || 0)
      + (c.from_ads_meta || 0) + (c.from_ads_google || 0) + (c.from_ads_tiktok || 0)
  , 0);

  // Urgent Trip Push Selling
  const urgentPushTrips = trips.filter((t) => {
    if (t.status !== 'open selling') return false;
    if (!t.departure) return false;
    const d = daysUntil(t.departure);
    if (d == null || d < 0 || d > 60) return false;
    const seatLeft = t.seat_left ?? 0;
    return seatLeft > 0;
  });
  const urgentPushCount = urgentPushTrips.length;

  // Upcoming trips (next 30 days)
  const upcoming = trips
    .filter((t) => {
      if (!t.departure) return false;
      if (t.status === 'completed' || t.status === 'cancelled') return false;
      const d = daysUntil(t.departure);
      return d != null && d >= 0 && d <= 30;
    })
    .sort((a, b) => new Date(a.departure) - new Date(b.departure))
    .slice(0, 5);

  // Trip baru dibuat (30 hari terakhir) — urut created_at terbaru
  const _now = Date.now();
  const newTrips = [...trips]
    .filter((t) => t.created_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .filter((t) => (_now - new Date(t.created_at).getTime()) <= 30 * 86400000)
    .slice(0, 8);
  const _agoLabel = (iso) => {
    const days = Math.floor((_now - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return 'hari ini';
    if (days === 1) return 'kemarin';
    return `${days} hari lalu`;
  };

  const name = user?.user_metadata?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const visibleQuick = filterNavByRole(ALL_QUICK, role);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">{greeting()}, {name} 👋</h1>
        <p className="mt-1 text-slate-600">{(BRAND_UI[getBrandCode()] || BRAND_UI.teone).welcome}</p>
      </div>

      <ReviewPendingCard />

      {/* HERO STATS — 3 card aja */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BigStat label="✈ Total Trip" value={totalTrips} sub={`${openSelling} open selling`} color="text-brand-700" bg="bg-brand-50" href="/trips" />
        <BigStat label="🪑 Seat Tersisa" value={totalSeatLeft} sub={`${totalPax} peserta total`} color="text-amber-700" bg="bg-amber-50" href="/trips" />
        <BigStat label="💰 Expected Revenue" value={fmtRupiah(totalExpectedRevenue)} sub="Proyeksi dari breakdown × pax" color="text-green-700" bg="bg-green-50" href="/finance/cashflow" small />
      </div>

      {/* DAILY SNAPSHOT — 3 stat prioritas (sync ke cs_daily_leads) */}
      <div className="bg-gradient-to-r from-brand-50 to-blue-50 rounded-xl border border-brand-200 shadow-card p-5">
        <h2 className="text-sm font-bold text-brand-700 uppercase tracking-wider mb-3">📅 Snapshot Hari Ini ({fmtDate(today)})</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <MiniStatLink
            label="📊 Total Leads Hari Ini"
            value={todayTotalLeads}
            sub={`${todayOrganicLeads} organic + ${todayAdsLeadsTotal} ads`}
            color="text-blue-700"
            href="/cs"
          />
          <MiniStat
            label="✓ Total Closing"
            value={todayClosingTotal}
            sub="dari semua trip aktif"
            color="text-green-700"
          />
          <MiniStatLink
            label="🔥 Urgent Trip Push Selling"
            value={urgentPushCount}
            sub="open selling · departure ≤ 60 hari · seat tersisa"
            color="text-red-700"
            href="/trips"
          />
        </div>
        {dailyLeads == null && (
          <p className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            ⚠ Belum input leads hari ini di /cs. Total Leads masih 0 sampai diinput.
          </p>
        )}
      </div>

      {/* Quick actions — filtered by role */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-6">
        <h2 className="text-lg font-bold text-brand-700 mb-3">⚡ Akses Cepat</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {visibleQuick.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="bg-white rounded-xl border border-slate-200 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 overflow-hidden"
            >
              <div className={`h-1.5 bg-gradient-to-r ${q.color}`} />
              <div className="p-3 text-center">
                <div className="text-2xl mb-1">{q.icon}</div>
                <p className="font-bold text-brand-700 text-xs">{q.label}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Trip baru dibuat */}
      {newTrips.length > 0 && (
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-brand-700">🆕 Trip Baru Dibuat ({newTrips.length})</h2>
          <Link href="/trips" className="text-xs font-semibold text-brand-600 hover:underline">Kelola di Master Trip →</Link>
        </div>
        <div className="divide-y divide-slate-100">
          {newTrips.map((t) => {
            const pax = (paxByTrip[t.id] || []).length;
            return (
              <Link key={t.id} href={`/trips/${t.id}`} className="block px-5 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">🆕 {_agoLabel(t.created_at)}</span>
                      {t.status && <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">{t.status}</span>}
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-800">{t.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t.departure ? `Berangkat ${fmtDate(t.departure)}` : 'Tanggal belum diisi'} · {pax} peserta · {t.destination || '—'}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
      )}

      {/* Upcoming trips */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-bold text-brand-700">🚀 Trip Berangkat 30 Hari ke Depan ({upcoming.length})</h2>
          <Link href="/trips" className="text-xs font-semibold text-brand-600 hover:underline">Lihat semua →</Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Tidak ada trip dalam 30 hari ke depan.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {upcoming.map((t) => {
              const d = daysUntil(t.departure);
              const pax = (paxByTrip[t.id] || []).length;
              return (
                <Link key={t.id} href={`/trips/${t.id}`} className="block px-5 py-3 hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{t.kode_trip || `#${t.id}`}</span>
                        {d <= 7 && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-700 animate-pulse">⏰ {d}h</span>}
                        {d > 7 && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">{d}h lagi</span>}
                        {t.tl_name && <span className="text-[10px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-semibold">TL: {t.tl_name}</span>}
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{fmtDate(t.departure)} · {pax} peserta · {t.destination || '—'}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BigStat({ label, value, sub, color, bg, href, small = false }) {
  const inner = (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-card p-5 hover:shadow-card-hover transition-shadow ${href ? 'cursor-pointer' : ''}`}>
      <div className={`inline-block ${bg} ${color} text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded mb-2`}>
        {label}
      </div>
      <p className={`font-bold ${color} ${small ? 'text-xl' : 'text-3xl'} leading-tight`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

function MiniStat({ label, value, sub, color }) {
  return (
    <div className="bg-white/70 rounded-lg p-3">
      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function MiniStatLink({ label, value, sub, color, href }) {
  return (
    <Link href={href} className="block bg-white/70 hover:bg-white rounded-lg p-3 transition-colors">
      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </Link>
  );
}
