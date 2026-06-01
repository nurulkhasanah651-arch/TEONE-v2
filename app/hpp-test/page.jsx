// Round 184e v2: Halaman test setup HPP — SINGLE FILE, no route group
// Path: app/hpp-test/page.jsx
// URL: https://your-domain/hpp-test
//
// Cara create di GitHub:
// 1. Klik "Add file" → "Create new file"
// 2. Di kolom filename, ketik PERSIS: app/hpp-test/page.jsx
//    (GitHub auto-bikin folder app/hpp-test/)
// 3. Paste isi file ini ke editor
// 4. Klik "Commit"

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

function getServiceClient() {
  // Service role gak boleh di client — pakai anon dulu untuk test
  return null;
}

export default function HPPTestPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testLog, setTestLog] = useState(null);
  const [testRunning, setTestRunning] = useState(false);

  async function check() {
    setLoading(true);
    const supabase = createClient();
    const result = {
      column_invoice_url: false,
      column_invoice_uploaded_at: false,
      column_transfer_proof_url: false,
      column_transfer_proof_uploaded_at: false,
      bucket_hpp_documents: false,
      bucket_payroll_proofs: false,
      sample_count: 0,
      sample_with_invoice: 0,
      sample_with_proof: 0,
      errors: [],
    };

    // 1) Check columns by fetching one row
    try {
      const { data, error } = await supabase
        .from('trip_finance_items')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) result.errors.push('Read item: ' + error.message);
      if (data) {
        result.column_invoice_url = 'invoice_url' in data;
        result.column_invoice_uploaded_at = 'invoice_uploaded_at' in data;
        result.column_transfer_proof_url = 'transfer_proof_url' in data;
        result.column_transfer_proof_uploaded_at = 'transfer_proof_uploaded_at' in data;
      }
    } catch (e) {
      result.errors.push('Check schema: ' + (e?.message || 'unknown'));
    }

    // 2) Check buckets
    try {
      const { data: buckets, error } = await supabase.storage.listBuckets();
      if (error) result.errors.push('List buckets: ' + error.message);
      if (buckets) {
        result.bucket_hpp_documents = buckets.some((b) => b.id === 'hpp-documents');
        result.bucket_payroll_proofs = buckets.some((b) => b.id === 'payroll-proofs');
      }
    } catch (e) {
      result.errors.push('Check buckets: ' + (e?.message || 'unknown'));
    }

    // 3) Sample data
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
    } catch (e) {
      result.errors.push('Sample data: ' + (e?.message || 'unknown'));
    }

    setStatus(result);
    setLoading(false);
  }

  useEffect(() => { check(); }, []);

  async function runTestUpload() {
    setTestRunning(true);
    const supabase = createClient();
    const logs = [];

    try {
      // 1) Upload test file
      const testKey = `test/diagnostic-${Date.now()}.txt`;
      const blob = new Blob(['TEONE HPP test — ' + new Date().toISOString()], { type: 'text/plain' });

      logs.push('🔼 Upload dummy file ke bucket hpp-documents...');
      const { error: upErr } = await supabase.storage
        .from('hpp-documents')
        .upload(testKey, blob, { contentType: 'text/plain', upsert: false });
      if (upErr) {
        logs.push('❌ FAILED: ' + upErr.message);
        if (/bucket|not exist|not found|policy/i.test(upErr.message)) {
          logs.push('→ FIX: Run SQL_COPAS_RUN_ALL.txt di Supabase SQL Editor');
        }
        setTestLog(logs.join('\n'));
        setTestRunning(false);
        return;
      }
      logs.push('✓ Upload OK: ' + testKey);

      // 2) Get signed URL
      logs.push('🔗 Get signed URL...');
      const { data: signed, error: sErr } = await supabase.storage
        .from('hpp-documents')
        .createSignedUrl(testKey, 60);
      if (sErr) logs.push('❌ Signed URL: ' + sErr.message);
      else logs.push('✓ Signed URL OK: ' + signed.signedUrl.slice(0, 80) + '...');

      // 3) Cleanup
      logs.push('🧹 Cleanup...');
      const { error: dErr } = await supabase.storage
        .from('hpp-documents')
        .remove([testKey]);
      if (dErr) logs.push('⚠ Cleanup: ' + dErr.message);
      else logs.push('✓ Cleanup OK');

      logs.push('\n✅ FULL TEST PASSED — upload bukti & invoice harusnya jalan');
    } catch (e) {
      logs.push('❌ Exception: ' + (e?.message || 'unknown'));
    }

    setTestLog(logs.join('\n'));
    setTestRunning(false);
    check();
  }

  if (loading || !status) {
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui' }}>
        <h1>🧪 HPP Test — Loading...</h1>
      </div>
    );
  }

  const allColsOk = status.column_invoice_url && status.column_invoice_uploaded_at &&
                    status.column_transfer_proof_url && status.column_transfer_proof_uploaded_at;
  const allOk = allColsOk && status.bucket_hpp_documents;

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ color: '#4f46e5' }}>🧪 HPP Documents Setup Test</h1>
      <p style={{ color: '#64748b' }}>Cek apa SQL R184 udah jalan & upload bisa kerja</p>

      <div style={{
        marginTop: 16, padding: 16, borderRadius: 12,
        background: allOk ? '#dcfce7' : '#fee2e2',
        border: allOk ? '2px solid #16a34a' : '2px solid #dc2626',
      }}>
        <h2 style={{ margin: 0, color: allOk ? '#166534' : '#991b1b' }}>
          {allOk ? '✓ SETUP OK' : '✗ SETUP BELUM SIAP'}
        </h2>
        {!allOk && (
          <p style={{ marginTop: 8, color: '#991b1b' }}>
            ❗ Buka Supabase Dashboard → SQL Editor → paste SQL_COPAS_RUN_ALL.txt → klik RUN.
            Setelah selesai, klik "Refresh Check" di bawah.
          </p>
        )}
      </div>

      <Section title="📊 Database Schema">
        <Row label="trip_finance_items.invoice_url" ok={status.column_invoice_url} />
        <Row label="trip_finance_items.invoice_uploaded_at" ok={status.column_invoice_uploaded_at} />
        <Row label="trip_finance_items.transfer_proof_url" ok={status.column_transfer_proof_url} />
        <Row label="trip_finance_items.transfer_proof_uploaded_at" ok={status.column_transfer_proof_uploaded_at} />
      </Section>

      <Section title="📦 Storage Buckets">
        <Row label="Bucket 'hpp-documents'" ok={status.bucket_hpp_documents} />
        <Row label="Bucket 'payroll-proofs' (existing)" ok={status.bucket_payroll_proofs} />
      </Section>

      <Section title="📈 Data Existing">
        <p style={{ margin: 0 }}>
          Total HPP items: <b>{status.sample_count}</b>
          {' · '}With invoice: <b style={{ color: '#7c3aed' }}>{status.sample_with_invoice}</b>
          {' · '}With bukti: <b style={{ color: '#16a34a' }}>{status.sample_with_proof}</b>
        </p>
      </Section>

      {status.errors.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca' }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: '#991b1b' }}>⚠ Errors:</p>
          <ul style={{ marginTop: 4, color: '#991b1b' }}>
            {status.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          onClick={check}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
        >
          🔄 Refresh Check
        </button>
        <button
          onClick={runTestUpload}
          disabled={testRunning || !allOk}
          style={{
            padding: '8px 16px',
            background: !allOk ? '#cbd5e1' : '#7c3aed',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            cursor: !allOk ? 'not-allowed' : 'pointer'
          }}
        >
          {testRunning ? '⏳ Testing...' : '🧪 Run Test Upload'}
        </button>
      </div>

      {testLog && (
        <pre style={{
          marginTop: 16, padding: 12, background: '#0f172a', color: '#e2e8f0',
          borderRadius: 8, fontSize: 12, lineHeight: 1.6, overflowX: 'auto',
          whiteSpace: 'pre-wrap'
        }}>
          {testLog}
        </pre>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 16, padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</p>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function Row({ label, ok }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '6px 10px',
      borderRadius: 6, background: ok ? '#f0fdf4' : '#fef2f2', marginBottom: 4
    }}>
      <span style={{ fontSize: 13, color: ok ? '#166534' : '#991b1b' }}>
        {ok ? '✓' : '✗'} {label}
      </span>
      <span style={{
        fontSize: 10, fontWeight: 'bold', padding: '2px 6px', borderRadius: 4,
        background: ok ? '#bbf7d0' : '#fecaca', color: ok ? '#166534' : '#991b1b'
      }}>
        {ok ? 'OK' : 'FIX'}
      </span>
    </div>
  );
}
