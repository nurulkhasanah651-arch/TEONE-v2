// Diagnostik Windsor (owner-only). Jalankan tarikan Meta Ads sekali, simpan hasil/error ke app_settings.
// Buka /api/diag/windsor saat login sebagai owner.
import { NextResponse } from 'next/server';
import { createClient as createServer } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { fetchMetaAdsAll, META_AD_ACCOUNTS } from '@/lib/windsor';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
  const { data: u } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (u?.role !== 'owner') return NextResponse.json({ error: 'owner_only' }, { status: 403 });

  const out = {
    checked_at: new Date().toISOString(),
    has_windsor_key: !!process.env.WINDSOR_API_KEY,
    accounts: META_AD_ACCOUNTS,
  };
  try {
    const rows = await fetchMetaAdsAll(META_AD_ACCOUNTS, 'last_7d');
    out.ok = true;
    out.rows = rows.length;
    out.dates = [...new Set(rows.map((r) => r.date))].sort();
    out.sample = rows.slice(0, 2);
  } catch (e) {
    out.ok = false;
    out.error = e?.message || 'err';
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      const svc = createSvc(url, key, { auth: { persistSession: false } });
      await svc.from('app_settings').upsert(
        { key: 'windsor_diag', value: JSON.stringify(out), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    }
  } catch {}
  return NextResponse.json(out);
}
