// Master Tour Leader — list + add/edit inline

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import TLMasterTable from '@/components/tl-master/TLMasterTable';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try {
    const res = await promise;
    return res.data || fallback;
  } catch {
    return fallback;
  }
}

export default async function TLMasterPage() {
  const supabase = createClient();
  const tourLeaders = await safeQuery(
    supabase.from('tour_leaders').select('*').order('active', { ascending: false }).order('name')
  );

  // Defensive: detect if migration ran
  const hasMigration = tourLeaders.length === 0
    ? null
    : true;

  // Probe: if select fails with table not found, hasMigration=false
  let migrationFailed = false;
  try {
    const probe = await supabase.from('tour_leaders').select('id').limit(1);
    if (probe.error && /relation .* does not exist/i.test(probe.error.message)) {
      migrationFailed = true;
    }
  } catch {
    migrationFailed = true;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-700">Master Tour Leader</h1>
        <p className="mt-1 text-slate-600">Database TL inhouse & freelance. TL akan match email + no HP saat login Portal TL.</p>
      </div>

      {migrationFailed && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <h3 className="font-bold text-amber-800 mb-2">⚠ SQL Migration Round 36 Belum Dijalankan</h3>
          <p className="text-sm text-amber-700">Jalankan SQL di <code>00_SQL_MIGRATION.txt</code> Round 36 di Supabase SQL Editor untuk aktifkan fitur ini.</p>
        </div>
      )}

      <TLMasterTable tourLeaders={tourLeaders} />
    </div>
  );
}
