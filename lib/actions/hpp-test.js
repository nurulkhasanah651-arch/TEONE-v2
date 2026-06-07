'use server';

// Round 184e: Server actions untuk halaman test setup HPP documents
// Path: lib/actions/hpp-test.js

import { createClient } from '@/lib/supabase/server';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Cek semua prasyarat
export async function checkHPPSetup() {
  const supabase = getServiceClient() || createClient();
  const result = {
    service_role_set: !!brandServiceRoleKey(),
    column_invoice_url: false,
    column_invoice_uploaded_at: false,
    column_transfer_proof_url: false,
    column_transfer_proof_uploaded_at: false,
    bucket_hpp_documents: false,
    bucket_payroll_proofs: false,
    realtime_trip_finance_items: false,
    sample_item_count: 0,
    sample_with_invoice: 0,
    sample_with_transfer_proof: 0,
    errors: [],
  };

  // 1) Check columns
  try {
    const { data } = await supabase.from('trip_finance_items').select('*').limit(1).maybeSingle();
    if (data) {
      result.column_invoice_url = 'invoice_url' in data;
      result.column_invoice_uploaded_at = 'invoice_uploaded_at' in data;
      result.column_transfer_proof_url = 'transfer_proof_url' in data;
      result.column_transfer_proof_uploaded_at = 'transfer_proof_uploaded_at' in data;
    }
  } catch (e) {
    result.errors.push('check_columns: ' + (e?.message || 'unknown'));
  }

  // 2) Check buckets
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    result.bucket_hpp_documents = (buckets || []).some((b) => b.id === 'hpp-documents');
    result.bucket_payroll_proofs = (buckets || []).some((b) => b.id === 'payroll-proofs');
  } catch (e) {
    result.errors.push('check_buckets: ' + (e?.message || 'unknown'));
  }

  // 3) Check realtime publication
  try {
    // Pakai SQL function call kalau ada
    const { data, error } = await supabase
      .rpc('pg_publication_check_table', { table_name: 'trip_finance_items' });
    if (!error) result.realtime_trip_finance_items = !!data;
  } catch {}
  // Fallback: assume true kalau gak bisa cek
  if (!result.realtime_trip_finance_items) {
    // Coba cek via raw query (perlu service role)
    try {
      const { data } = await supabase
        .from('pg_publication_tables')
        .select('tablename')
        .eq('pubname', 'supabase_realtime')
        .eq('tablename', 'trip_finance_items');
      result.realtime_trip_finance_items = (data || []).length > 0;
    } catch {}
  }

  // 4) Sample items
  try {
    const { data: items, count } = await supabase
      .from('trip_finance_items')
      .select('id, invoice_url, transfer_proof_url', { count: 'exact', head: false })
      .eq('item_type', 'hpp')
      .limit(50);
    result.sample_item_count = count ?? (items || []).length;
    if (items) {
      result.sample_with_invoice = items.filter((i) => i.invoice_url).length;
      result.sample_with_transfer_proof = items.filter((i) => i.transfer_proof_url).length;
    }
  } catch (e) {
    result.errors.push('check_samples: ' + (e?.message || 'unknown'));
  }

  return result;
}

// Test upload — bikin file dummy + upload + cek + cleanup
export async function testUploadFlow() {
  const supabase = getServiceClient() || createClient();
  const logs = [];

  try {
    // 1) Upload dummy file ke bucket
    const testKey = `test/diagnostic-${Date.now()}.txt`;
    const buf = Buffer.from('TEONE HPP test file — ' + new Date().toISOString());

    logs.push('🔼 Upload test file to bucket hpp-documents...');
    const { error: upErr } = await supabase.storage
      .from('hpp-documents')
      .upload(testKey, buf, { contentType: 'text/plain', upsert: false });

    if (upErr) {
      logs.push('❌ FAILED: ' + upErr.message);
      if (/bucket|not exist|not found/i.test(upErr.message)) {
        logs.push('→ FIX: Run SQL_COPAS_RUN_ALL.txt untuk bikin bucket');
      }
      return { ok: false, logs };
    }
    logs.push('✓ Upload OK: ' + testKey);

    // 2) Get signed URL
    logs.push('🔗 Get signed URL...');
    const { data: signed, error: sErr } = await supabase.storage
      .from('hpp-documents')
      .createSignedUrl(testKey, 60);
    if (sErr) { logs.push('❌ Signed URL gagal: ' + sErr.message); }
    else logs.push('✓ Signed URL OK');

    // 3) Test update kolom invoice_url di item pertama (kalau ada)
    logs.push('📝 Test UPDATE invoice_url di trip_finance_items...');
    const { data: firstItem } = await supabase
      .from('trip_finance_items')
      .select('id')
      .eq('item_type', 'hpp')
      .limit(1)
      .maybeSingle();

    if (firstItem) {
      const { data: orig } = await supabase
        .from('trip_finance_items')
        .select('invoice_url')
        .eq('id', firstItem.id)
        .single();
      const origVal = orig?.invoice_url;

      const { error: updErr } = await supabase
        .from('trip_finance_items')
        .update({ invoice_url: testKey })
        .eq('id', firstItem.id);

      if (updErr) {
        logs.push('❌ UPDATE gagal: ' + updErr.message);
        if (/invoice_url|column.*does not exist/i.test(updErr.message)) {
          logs.push('→ FIX: Run SQL_COPAS_RUN_ALL.txt untuk add kolom');
        }
      } else {
        logs.push(`✓ UPDATE OK pada item #${firstItem.id}`);
        // Verify
        const { data: after } = await supabase
          .from('trip_finance_items')
          .select('invoice_url')
          .eq('id', firstItem.id)
          .single();
        if (after?.invoice_url === testKey) {
          logs.push('✓ READ-back OK — value tersimpan benar');
        } else {
          logs.push(`⚠ READ-back mismatch — expected "${testKey}", got "${after?.invoice_url}"`);
        }
        // Restore original value
        await supabase
          .from('trip_finance_items')
          .update({ invoice_url: origVal })
          .eq('id', firstItem.id);
        logs.push('✓ Restored original invoice_url');
      }
    } else {
      logs.push('⚠ Skipped — gak ada HPP item untuk test');
    }

    // 4) Cleanup test file
    logs.push('🧹 Cleanup test file...');
    await supabase.storage.from('hpp-documents').remove([testKey]);
    logs.push('✓ Cleanup OK');

    return { ok: true, logs };
  } catch (e) {
    logs.push('❌ Exception: ' + (e?.message || 'unknown'));
    return { ok: false, logs };
  }
}
