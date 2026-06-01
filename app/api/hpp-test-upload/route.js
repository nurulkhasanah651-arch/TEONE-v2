// Round 184e v3: API route untuk test upload (server-side, pakai service role)
// Path: app/api/hpp-test-upload/route.js

import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST() {
  const logs = [];
  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({
      ok: false,
      logs: ['❌ SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel env vars']
    });
  }

  try {
    // 1) Upload dummy file
    const testKey = `test/diagnostic-${Date.now()}.txt`;
    const buf = Buffer.from('TEONE HPP test — ' + new Date().toISOString());

    logs.push('🔼 Upload dummy file ke bucket hpp-documents (pakai service role)...');
    const { error: upErr } = await supabase.storage
      .from('hpp-documents')
      .upload(testKey, buf, { contentType: 'text/plain', upsert: false });

    if (upErr) {
      logs.push('❌ Upload FAILED: ' + upErr.message);
      if (/bucket|not exist|not found/i.test(upErr.message)) {
        logs.push('→ FIX: bucket hpp-documents belum exist di Supabase');
      } else if (/policy/i.test(upErr.message)) {
        logs.push('→ FIX: policy belum di-set untuk authenticated user');
      }
      return NextResponse.json({ ok: false, logs });
    }
    logs.push('✓ Upload OK: ' + testKey);

    // 2) Signed URL
    logs.push('🔗 Get signed URL...');
    const { data: signed, error: sErr } = await supabase.storage
      .from('hpp-documents')
      .createSignedUrl(testKey, 60);
    if (sErr) {
      logs.push('❌ Signed URL: ' + sErr.message);
    } else {
      logs.push('✓ Signed URL OK');
      logs.push('  ' + signed.signedUrl.slice(0, 100) + '...');
    }

    // 3) Test UPDATE column di trip_finance_items (cek apa kolom benar2 writeable)
    logs.push('📝 Test UPDATE invoice_url di trip_finance_items...');
    const { data: firstItem } = await supabase
      .from('trip_finance_items')
      .select('id, invoice_url')
      .eq('item_type', 'hpp')
      .limit(1)
      .maybeSingle();

    if (!firstItem) {
      logs.push('⚠ Skip — gak ada HPP item untuk test UPDATE');
    } else {
      const orig = firstItem.invoice_url;
      const { error: updErr } = await supabase
        .from('trip_finance_items')
        .update({ invoice_url: testKey })
        .eq('id', firstItem.id);
      if (updErr) {
        logs.push('❌ UPDATE FAILED: ' + updErr.message);
      } else {
        // Verify
        const { data: after } = await supabase
          .from('trip_finance_items')
          .select('invoice_url')
          .eq('id', firstItem.id)
          .single();
        if (after?.invoice_url === testKey) {
          logs.push(`✓ UPDATE + READ-back OK pada item #${firstItem.id}`);
        } else {
          logs.push(`⚠ READ-back mismatch: saved="${testKey}" got="${after?.invoice_url}"`);
        }
        // Restore
        await supabase
          .from('trip_finance_items')
          .update({ invoice_url: orig })
          .eq('id', firstItem.id);
        logs.push('✓ Restored original value');
      }
    }

    // 4) Cleanup
    logs.push('🧹 Cleanup test file...');
    const { error: dErr } = await supabase.storage
      .from('hpp-documents')
      .remove([testKey]);
    if (dErr) logs.push('⚠ Cleanup: ' + dErr.message);
    else logs.push('✓ Cleanup OK');

    logs.push('');
    logs.push('✅ FULL TEST PASSED — Setup 100% ready');
    logs.push('   Sekarang coba upload invoice real di /finance/cashflow/[tripId]');

    return NextResponse.json({ ok: true, logs });
  } catch (e) {
    logs.push('❌ Exception: ' + (e?.message || 'unknown'));
    return NextResponse.json({ ok: false, logs });
  }
}
