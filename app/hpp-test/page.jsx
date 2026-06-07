// Round 184e v3: Test page — pakai server-side check (service role) biar akurat
// Path: app/hpp-test/page.jsx
// REPLACE file yg lama

import HPPTestClient from './HPPTestClient';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function HPPTestPage() {
  const result = {
    has_service_role: !!brandServiceRoleKey(),
    column_invoice_url: false,
    column_invoice_uploaded_at: false,
    column_transfer_proof_url: false,
    column_transfer_proof_uploaded_at: false,
    bucket_hpp_documents: false,
    bucket_payroll_proofs: false,
    realtime_trip_finance_items: false,
    sample_count: 0,
    sample_with_invoice: 0,
    sample_with_proof: 0,
    errors: [],
  };

  const supabase = getServiceClient() || createClient();

  // 1) Check columns via select one row
  try {
    const { data } = await supabase.from('trip_finance_items').select('*').limit(1).maybeSingle();
    if (data) {
      result.column_invoice_url = 'invoice_url' in data;
      result.column_invoice_uploaded_at = 'invoice_uploaded_at' in data;
      result.column_transfer_proof_url = 'transfer_proof_url' in data;
      result.column_transfer_proof_uploaded_at = 'transfer_proof_uploaded_at' in data;
    }
  } catch (e) { result.errors.push('schema: ' + (e?.message || 'unknown')); }

  // 2) Check buckets via SERVER-side (service role) — anon client gak boleh listBuckets
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) result.errors.push('listBuckets: ' + error.message);
    if (buckets) {
      result.bucket_hpp_documents = buckets.some((b) => b.id === 'hpp-documents');
      result.bucket_payroll_proofs = buckets.some((b) => b.id === 'payroll-proofs');
    }
  } catch (e) { result.errors.push('buckets: ' + (e?.message || 'unknown')); }

  // 3) Realtime check — query pg_publication_tables
  try {
    const { data } = await supabase
      .from('pg_publication_tables')
      .select('tablename')
      .eq('pubname', 'supabase_realtime')
      .eq('tablename', 'trip_finance_items');
    result.realtime_trip_finance_items = (data || []).length > 0;
  } catch {
    // pg_publication_tables might not be accessible via PostgREST, that's OK
    result.realtime_trip_finance_items = null; // unknown
  }

  // 4) Sample data
  try {
    const { data } = await supabase
      .from('trip_finance_items')
      .select('id, invoice_url, transfer_proof_url')
      .eq('item_type', 'hpp')
      .limit(50);
    if (data) {
      result.sample_count = data.length;
      result.sample_with_invoice = data.filter((i) => i.invoice_url).length;
      result.sample_with_proof = data.filter((i) => i.transfer_proof_url).length;
    }
  } catch (e) { result.errors.push('samples: ' + (e?.message || 'unknown')); }

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ color: '#4f46e5' }}>🧪 HPP Documents Setup Test</h1>
      <p style={{ color: '#64748b' }}>Server-side check pakai service role (akurat 100%)</p>

      <HPPTestClient initialStatus={result} />
    </div>
  );
}
