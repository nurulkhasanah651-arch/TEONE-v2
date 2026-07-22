// CRM — daftar customer + stats + filter. Data dari tabel customers (brand-aware).
import { createClient } from '@/lib/supabase/server';
import CRMClient from '@/components/crm/CRMClient';
import CRMFollowup from '@/components/crm/CRMFollowup';
import { getCurrentBrand } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export default async function CRMPage() {
  const supabase = createClient();
  // Supabase membatasi 1000 baris per request → ambil bertahap (paginasi) supaya
  // SEMUA customer termuat (mis. hasil import data lama yg total_spent-nya 0).
  const cols = 'id, name, phone, whatsapp, email, city, gender, birthday, referral_source, tags, is_blacklisted, total_trips, total_spent, first_trip_at, last_trip_at, status, created_at';
  let customers = [];
  for (let from = 0; from < 40000; from += 1000) {
    const { data, error } = await supabase
      .from('customers')
      .select(cols)
      .order('total_spent', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + 999);
    if (error || !data || !data.length) break;
    customers = customers.concat(data);
    if (data.length < 1000) break;
  }

  const { data: openTripsRaw } = await supabase
    .from('trips')
    .select('id, name, kode_trip, departure, harga_jual, price, status')
    .order('departure', { ascending: true });
  const openTrips = (openTripsRaw || []).filter((t) =>
    !t.status || /open|prepare|selling/i.test(t.status)
  );
  let brandName = 'kami';
  try { const b = await getCurrentBrand(); brandName = b?.name || 'kami'; } catch {}

  const list = customers || [];
  const now = new Date();
  const thisMonth = now.getMonth() + 1;

  const stats = {
    total: list.length,
    lead: list.filter((c) => c.status === 'lead').length,
    baru: list.filter((c) => c.status === 'new').length,
    repeat: list.filter((c) => c.status === 'repeat').length,
    vip: list.filter((c) => c.status === 'vip').length,
    blacklist: list.filter((c) => c.is_blacklisted).length,
    totalRevenue: list.reduce((s, c) => s + (Number(c.total_spent) || 0), 0),
    birthdayThisMonth: list.filter((c) => {
      if (!c.birthday) return false;
      try { return (new Date(c.birthday).getMonth() + 1) === thisMonth; } catch { return false; }
    }).length,
  };

  const sources = [...new Set(list.map((c) => c.referral_source).filter(Boolean))].sort();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-brand-700">👥 CRM Customer</h1>
        <p className="mt-1 text-slate-600">Kelola database customer — lead, repeat, VIP, riwayat & follow-up.</p>
      </div>
      <div className="mb-4">
        <CRMFollowup brandName={brandName} sources={sources} openTrips={openTrips} />
      </div>
      <CRMClient customers={list} stats={stats} />
    </div>
  );
}
