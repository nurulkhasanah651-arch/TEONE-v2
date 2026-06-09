// CRM — daftar customer + stats + filter. Data dari tabel customers (brand-aware).
import { createClient } from '@/lib/supabase/server';
import CRMClient from '@/components/crm/CRMClient';

export const dynamic = 'force-dynamic';

export default async function CRMPage() {
  const supabase = createClient();
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, phone, whatsapp, email, city, gender, birthday, referral_source, tags, is_blacklisted, total_trips, total_spent, first_trip_at, last_trip_at, status, created_at')
    .order('total_spent', { ascending: false })
    .limit(5000);

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

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-brand-700">👥 CRM Customer</h1>
        <p className="mt-1 text-slate-600">Kelola database customer — lead, repeat, VIP, riwayat & follow-up.</p>
      </div>
      <CRMClient customers={list} stats={stats} />
    </div>
  );
}
