'use client';

// Round 92: Upload CSV mutasi BCA → parse → import ke DB

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parseBcaCSV } from '@/lib/utils/bca-parser';
import { importBankMutations, autoMatchAll } from '@/lib/actions/reconcile';

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

export default function BankUploadForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      setCsvText(text);
      try {
        const r = parseBcaCSV(text);
        if (!r.ok) {
          setError(r.error || 'Parse error');
          setParsed(null);
          return;
        }
        setParsed(r);
      } catch (e) {
        setError('Parse exception: ' + e.message);
        setParsed(null);
      }
    };
    reader.readAsText(file);
  }

  function handleImport() {
    if (!parsed?.rows?.length) return;
    setError('');
    setResult(null);
    startTransition(async () => {
      const r = await importBankMutations(parsed.rows, 'BCA');
      if (r?.error) {
        setError(r.error);
        return;
      }
      setResult(r);
      // Auto-match setelah import
      await autoMatchAll();
      router.refresh();
    });
  }

  function handleAutoMatch() {
    startTransition(async () => {
      const r = await autoMatchAll();
      if (r?.error) {
        setError(r.error);
        return;
      }
      setResult({ ...result, autoMatched: r.matched, autoTotal: r.total });
      router.refresh();
    });
  }

  const totalCR = parsed?.rows?.filter((r) => r.type === 'cr').reduce((s, r) => s + r.amount, 0) || 0;
  const totalDB = parsed?.rows?.filter((r) => r.type === 'db').reduce((s, r) => s + r.amount, 0) || 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-4">
      <div>
        <h2 className="text-lg font-bold text-brand-700">📤 Upload CSV Mutasi BCA</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Download mutasi dari KlikBCA/myBCA dalam format CSV, lalu upload di sini.
        </p>
      </div>

      <input autoComplete="off"
        type="file"
        accept=".csv,.txt,text/csv"
        onChange={handleFileChange}
        className="w-full text-sm border border-slate-300 rounded-lg p-2"
      />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {parsed?.ok && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total Baris" value={parsed.rows.length} color="text-brand-700" />
            <Stat label="Uang Masuk (CR)" value={fmtRupiah(totalCR)} color="text-green-700" small />
            <Stat label="Uang Keluar (DB)" value={fmtRupiah(totalDB)} color="text-red-700" small />
          </div>

          {parsed.errors?.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              ⚠ {parsed.errors.length} baris di-skip karena error. Cek format CSV.
            </div>
          )}

          <div className="overflow-x-auto max-h-64 border border-slate-200 rounded">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-[10px] font-bold text-slate-600 uppercase">
                  <th className="px-2 py-1.5">Tanggal</th>
                  <th className="px-2 py-1.5">Keterangan</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5 text-center">Tipe</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 50).map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-2 py-1">{r.tanggal}</td>
                    <td className="px-2 py-1 truncate max-w-xs">{r.keterangan}</td>
                    <td className={`px-2 py-1 text-right font-semibold ${r.type === 'cr' ? 'text-green-700' : 'text-red-700'}`}>
                      {fmtRupiah(r.amount)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.type === 'cr' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {r.type === 'cr' ? 'CR' : 'DB'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.rows.length > 50 && (
              <p className="p-2 text-center text-[10px] text-slate-500">
                Preview 50 baris. Import akan masukin semua {parsed.rows.length} baris.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={handleImport}
            disabled={pending}
            className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
          >
            {pending ? 'Importing...' : `Import ${parsed.rows.length} Mutasi + Auto-Match`}
          </button>
        </div>
      )}

      {result?.ok && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800 space-y-1">
          <p className="font-bold">✓ Import sukses</p>
          <p className="text-xs">
            Inserted: {result.inserted} · Skipped (duplikat): {result.skipped}
            {result.autoMatched != null && (
              <> · Auto-matched: <span className="font-bold">{result.autoMatched}</span> / {result.autoTotal}</>
            )}
          </p>
          {result.errors?.length > 0 && (
            <p className="text-xs text-red-700">⚠ {result.errors.length} error: {result.errors.slice(0, 3).join(' | ')}</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleAutoMatch}
        disabled={pending}
        className="w-full py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-xs font-semibold rounded"
      >
        🔄 Run Auto-Match Lagi (untuk mutasi unmatched)
      </button>
    </div>
  );
}

function Stat({ label, value, color, small = false }) {
  return (
    <div className="bg-slate-50 rounded p-2 border border-slate-200">
      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`mt-0.5 font-bold ${color} ${small ? 'text-sm' : 'text-lg'}`}>{value}</p>
    </div>
  );
}
