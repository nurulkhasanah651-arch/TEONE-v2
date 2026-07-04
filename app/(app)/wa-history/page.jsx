// History WA — semua pesan WhatsApp keluar + status pengiriman (sent/delivered/read/failed).
export const dynamic = 'force-dynamic';

import { createClient } from '@/lib/supabase/server';
import { getRoleFromUser } from '@/lib/utils/roles';
import WaHistoryView from '@/components/wa/WaHistoryView';

const ALLOWED = ['owner', 'manager', 'ops', 'accounting', 'cs', 'pic'];

function normPhone(p) {
  let s = String(p || '').replace(/\D/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  if (s.startsWith('8')) s = '62' + s;
  return s;
}

export default async function WaHistoryPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let role = getRoleFromUser(user);
  try { const { data: u } = await supabase.from('users').select('role').eq('id', user?.id).maybeSingle(); if (u?.role) role = u.role; } catch {}
  if (!ALLOWED.includes(role)) {
    return <div className="max-w-2xl mx-auto p-6 text-sm text-slate-500">Halaman ini khusus tim internal.</div>;
  }

  const { data: rows } = await supabase.from('wa_log')
    .select('id, created_at, target_phone, context, kind, trip_id, message, status, state, reason, fonnte_id, sender')
    .order('created_at', { ascending: false }).limit(300);
  const logs = rows || [];

  // Nama kontak (best-effort) dari customers berdasarkan nomor
  const nameByPhone = {};
  try {
    const phones = [...new Set(logs.map((l) => normPhone(l.target_phone)).filter(Boolean))];
    if (phones.length) {
      const { data: custs } = await supabase.from('customers').select('name, phone').limit(2000);
      const cmap = {};
      for (const c of (custs || [])) { const np = normPhone(c.phone); if (np) cmap[np] = c.name; }
      for (const ph of phones) if (cmap[ph]) nameByPhone[ph] = cmap[ph];
    }
  } catch {}

  const enriched = logs.map((l) => ({ ...l, contact_name: nameByPhone[normPhone(l.target_phone)] || null }));
  return <WaHistoryView rows={enriched} />;
}
