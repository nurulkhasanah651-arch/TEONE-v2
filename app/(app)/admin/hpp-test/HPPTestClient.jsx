'use client';

// Round 184e: Client component test setup HPP documents
// Path: app/(app)/admin/hpp-test/HPPTestClient.jsx

import { useState, useTransition } from 'react';
import { checkHPPSetup, testUploadFlow } from '@/lib/actions/hpp-test';

function StatusRow({ label, ok, hint }) {
  return (
    <div className={`flex items-start justify-between py-2 px-3 rounded ${ok ? 'bg-green-50' : 'bg-red-50'}`}>
      <div>
        <p className={`text-sm font-semibold ${ok ? 'text-green-800' : 'text-red-800'}`}>
          {ok ? '✓' : '✗'} {label}
        </p>
        {hint && <p className="text-[11px] text-slate-600 mt-0.5">{hint}</p>}
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ok ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
        {ok ? 'OK' : 'FIX'}
      </span>
    </div>
  );
}

export default function HPPTestClient({ initialStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, startTransition] = useTransition();
  const [testResult, setTestResult] = useState(null);

  function handleRefresh() {
    startTransition(async () => {
      const s = await checkHPPSetup();
      setStatus(s);
    });
  }

  function handleTestUpload() {
    setTestResult({ loading: true });
    startTransition(async () => {
      const r = await testUploadFlow();
      setTestResult(r);
      // Re-check after test
      const s = await checkHPPSetup();
      setStatus(s);
    });
  }

  const allOk = status &&
    status.column_invoice_url &&
    status.column_transfer_proof_url &&
    status.bucket_hpp_documents;

  return (
    <div className="mt-4 space-y-4">
      {/* Overall verdict */}
      <div className={`p-4 rounded-xl border-2 ${allOk ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
        <p className={`text-lg font-bold ${allOk ? 'text-green-800' : 'text-red-800'}`}>
          {allOk ? '✓ Setup OK — upload harusnya jalan' : '✗ Setup BELUM SIAP — SQL R184 perlu di-run'}
        </p>
        {!allOk && (
          <p className="text-sm text-red-700 mt-2">
            Buka Supabase Dashboard → SQL Editor → paste isi <b>SQL_COPAS_RUN_ALL.txt</b> → klik RUN.
            Setelah itu klik tombol "Refresh Check" di bawah.
          </p>
        )}
      </div>

      {/* Schema check */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">📊 Database Schema</p>
        <StatusRow
          label="Column trip_finance_items.invoice_url"
          ok={status?.column_invoice_url}
          hint={!status?.column_invoice_url && 'Run SQL untuk add column ini'}
        />
        <StatusRow
          label="Column trip_finance_items.invoice_uploaded_at"
          ok={status?.column_invoice_uploaded_at}
        />
        <StatusRow
          label="Column trip_finance_items.transfer_proof_url"
          ok={status?.column_transfer_proof_url}
          hint={!status?.column_transfer_proof_url && 'Run SQL untuk add column ini'}
        />
        <StatusRow
          label="Column trip_finance_items.transfer_proof_uploaded_at"
          ok={status?.column_transfer_proof_uploaded_at}
        />
      </div>

      {/* Storage check */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">📦 Storage Buckets</p>
        <StatusRow
          label="Bucket 'hpp-documents' (private)"
          ok={status?.bucket_hpp_documents}
          hint={!status?.bucket_hpp_documents && 'Run SQL untuk bikin bucket'}
        />
        <StatusRow
          label="Bucket 'payroll-proofs' (existing dari R174)"
          ok={status?.bucket_payroll_proofs}
        />
      </div>

      {/* Realtime check */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">📡 Realtime Sync</p>
        <StatusRow
          label="Realtime publication: trip_finance_items"
          ok={status?.realtime_trip_finance_items}
          hint={!status?.realtime_trip_finance_items && 'Tanpa ini, sync invoice ↔ bukti transfer butuh refresh manual'}
        />
      </div>

      {/* Env check */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-1">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">🔑 Environment</p>
        <StatusRow
          label="SUPABASE_SERVICE_ROLE_KEY"
          ok={status?.service_role_set}
          hint={!status?.service_role_set && 'Set di Vercel env vars — penting untuk bypass RLS saat upload'}
        />
      </div>

      {/* Data check */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">📈 Data Existing</p>
        <p className="text-sm text-slate-700">
          Total HPP items: <b>{status?.sample_item_count ?? 0}</b>
          {' · '}With invoice: <b className="text-purple-700">{status?.sample_with_invoice ?? 0}</b>
          {' · '}With bukti transfer: <b className="text-green-700">{status?.sample_with_transfer_proof ?? 0}</b>
        </p>
      </div>

      {/* Errors */}
      {status?.errors?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-xs font-bold text-red-800">⚠ Errors saat check:</p>
          <ul className="mt-1 text-xs text-red-700 space-y-0.5">
            {status.errors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleRefresh}
          disabled={pending}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
        >
          {pending ? '⏳ Checking...' : '🔄 Refresh Check'}
        </button>
        <button
          onClick={handleTestUpload}
          disabled={pending || !allOk}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
          title={!allOk ? 'Fix setup dulu' : 'Test full upload flow'}
        >
          🧪 Run Test Upload
        </button>
      </div>

      {/* Test result */}
      {testResult && !testResult.loading && (
        <div className={`rounded-xl border p-4 ${testResult.ok ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
          <p className={`text-sm font-bold ${testResult.ok ? 'text-green-800' : 'text-red-800'}`}>
            {testResult.ok ? '✓ Test upload SUKSES — sync harusnya jalan' : '✗ Test upload GAGAL — lihat log di bawah'}
          </p>
          <pre className="mt-2 text-[11px] font-mono bg-white border border-slate-200 rounded p-2 overflow-x-auto whitespace-pre-wrap">
            {(testResult.logs || []).join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}
