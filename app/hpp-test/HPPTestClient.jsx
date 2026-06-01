'use client';

// Round 184e v3: Client untuk test page — Refresh + Test Upload
// Path: app/hpp-test/HPPTestClient.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export default function HPPTestClient({ initialStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [testLog, setTestLog] = useState(null);
  const [testRunning, setTestRunning] = useState(false);

  const status = initialStatus;

  function handleRefresh() {
    startTransition(async () => {
      router.refresh();
    });
  }

  async function runTestUpload() {
    setTestRunning(true);
    setTestLog('🔼 Calling test upload...');

    try {
      const res = await fetch('/api/hpp-test-upload', { method: 'POST' });
      const data = await res.json();
      setTestLog((data.logs || []).join('\n'));
    } catch (e) {
      setTestLog('❌ Error: ' + (e?.message || 'unknown'));
    }
    setTestRunning(false);
    router.refresh();
  }

  const allColsOk = status.column_invoice_url && status.column_invoice_uploaded_at &&
                    status.column_transfer_proof_url && status.column_transfer_proof_uploaded_at;
  const allOk = allColsOk && status.bucket_hpp_documents;

  return (
    <div style={{ marginTop: 16 }}>
      {/* Verdict */}
      <div style={{
        padding: 16, borderRadius: 12,
        background: allOk ? '#dcfce7' : '#fee2e2',
        border: allOk ? '2px solid #16a34a' : '2px solid #dc2626',
      }}>
        <h2 style={{ margin: 0, color: allOk ? '#166534' : '#991b1b' }}>
          {allOk ? '✓ SETUP OK — Try upload di Finance!' : '✗ Ada yg perlu di-fix'}
        </h2>
        {!status.has_service_role && (
          <p style={{ marginTop: 8, color: '#991b1b' }}>
            ⚠ SUPABASE_SERVICE_ROLE_KEY belum di-set di Vercel env vars — upload pasti gagal.
          </p>
        )}
      </div>

      {/* Schema */}
      <Section title="📊 Database Schema">
        <Row label="trip_finance_items.invoice_url" ok={status.column_invoice_url} />
        <Row label="trip_finance_items.invoice_uploaded_at" ok={status.column_invoice_uploaded_at} />
        <Row label="trip_finance_items.transfer_proof_url" ok={status.column_transfer_proof_url} />
        <Row label="trip_finance_items.transfer_proof_uploaded_at" ok={status.column_transfer_proof_uploaded_at} />
      </Section>

      {/* Buckets — cek server-side accurate */}
      <Section title="📦 Storage Buckets (server check)">
        <Row label="Bucket 'hpp-documents'" ok={status.bucket_hpp_documents} />
        <Row label="Bucket 'payroll-proofs'" ok={status.bucket_payroll_proofs} />
      </Section>

      {/* Realtime */}
      <Section title="📡 Realtime Sync">
        <Row
          label="Realtime publication: trip_finance_items"
          ok={status.realtime_trip_finance_items}
          hint={
            status.realtime_trip_finance_items === false
              ? 'Tanpa ini, invoice/bukti gak auto-update di tab lain. Run SQL ALTER PUBLICATION supabase_realtime ADD TABLE trip_finance_items;'
              : status.realtime_trip_finance_items === null
                ? '(gak bisa di-cek dari client, mungkin udah aktif)'
                : null
          }
        />
      </Section>

      {/* Env */}
      <Section title="🔑 Environment">
        <Row label="SUPABASE_SERVICE_ROLE_KEY" ok={status.has_service_role} />
      </Section>

      {/* Data */}
      <Section title="📈 Data Existing">
        <p style={{ margin: 0, fontSize: 14, color: '#334155' }}>
          Total HPP items: <b>{status.sample_count}</b>
          {' · '}With invoice: <b style={{ color: '#7c3aed' }}>{status.sample_with_invoice}</b>
          {' · '}With bukti: <b style={{ color: '#16a34a' }}>{status.sample_with_proof}</b>
        </p>
      </Section>

      {status.errors?.length > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: '#991b1b' }}>⚠ Errors:</p>
          <ul style={{ marginTop: 4, color: '#991b1b' }}>
            {status.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={handleRefresh} disabled={pending}
          style={{ padding: '8px 16px', background: '#334155', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
          {pending ? '⏳' : '🔄'} Refresh Check
        </button>
        <button onClick={runTestUpload} disabled={testRunning || !allOk}
          style={{
            padding: '8px 16px',
            background: !allOk ? '#cbd5e1' : '#7c3aed',
            color: 'white', border: 'none', borderRadius: 8, fontWeight: 600,
            cursor: !allOk ? 'not-allowed' : 'pointer'
          }}>
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
    <div style={{ marginTop: 12, padding: 16, background: 'white', borderRadius: 12, border: '1px solid #e2e8f0' }}>
      <p style={{ margin: 0, fontSize: 11, fontWeight: 'bold', color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>{title}</p>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

function Row({ label, ok, hint }) {
  const isUnknown = ok === null || ok === undefined;
  return (
    <div style={{
      padding: '6px 10px', borderRadius: 6, marginBottom: 4,
      background: isUnknown ? '#fef9c3' : (ok ? '#f0fdf4' : '#fef2f2'),
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: isUnknown ? '#854d0e' : (ok ? '#166534' : '#991b1b') }}>
          {isUnknown ? '?' : (ok ? '✓' : '✗')} {label}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 'bold', padding: '2px 6px', borderRadius: 4,
          background: isUnknown ? '#fef08a' : (ok ? '#bbf7d0' : '#fecaca'),
          color: isUnknown ? '#854d0e' : (ok ? '#166534' : '#991b1b')
        }}>
          {isUnknown ? '?' : (ok ? 'OK' : 'FIX')}
        </span>
      </div>
      {hint && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b' }}>{hint}</p>}
    </div>
  );
}
