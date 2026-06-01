'use client';

// Round 178b: PayrollPeriodActions — + auto-send WA on Mark All Paid + manual Send All Slips
// Path: components/hr/PayrollPeriodActions.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  finalizePeriod,
  markAllEntriesPaid,
  deletePeriod,
  sendAllPayrollSlipsViaWA,
} from '@/lib/actions/payroll';

export default function PayrollPeriodActions({ period, entriesCount }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState(null);

  function flash(r) {
    setResult(r);
    if (!r?.error) router.refresh();
    setTimeout(() => setResult(null), 12000);
  }

  function handleFinalize() {
    if (!confirm(`Finalize periode ${period.period_label}? Setelah finalize, slip masih bisa di-edit tapi statusnya jadi LOCKED.`)) return;
    startTransition(async () => {
      const r = await finalizePeriod(period.id);
      flash(r);
    });
  }

  function handleMarkAllPaid() {
    if (!confirm(
      `Mark SEMUA ${entriesCount} slip gaji sebagai PAID?\n\n` +
      `Yang otomatis terjadi:\n` +
      `✓ Status semua entry → PAID\n` +
      `✓ Periode → PAID\n` +
      `✓ Auto-sync ke cash out accounting\n` +
      `✓ Auto-kirim slip via WhatsApp ke semua karyawan`
    )) return;
    startTransition(async () => {
      const r = await markAllEntriesPaid(period.id);
      flash(r);
    });
  }

  function handleMarkAllPaidNoWA() {
    if (!confirm(`Mark All Paid TANPA kirim WA?`)) return;
    startTransition(async () => {
      const r = await markAllEntriesPaid(period.id, { skipWA: true });
      flash(r);
    });
  }

  function handleSendAllSlips() {
    if (!confirm(`Kirim ulang slip gaji ke semua karyawan via WhatsApp?\n\n(Status entries gak diubah)`)) return;
    startTransition(async () => {
      const r = await sendAllPayrollSlipsViaWA(period.id);
      flash(r);
    });
  }

  function handleDelete() {
    if (!confirm(`HAPUS periode ${period.period_label}? Semua slip gaji + accounting entries akan hilang permanen. Tidak bisa di-undo.`)) return;
    startTransition(async () => {
      const r = await deletePeriod(period.id);
      if (r?.error) flash(r);
      else router.push('/hr/payroll');
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {period.status === 'draft' && (
          <button
            type="button"
            onClick={handleFinalize}
            disabled={pending}
            className="px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-semibold rounded disabled:opacity-50"
          >
            🔒 Finalize
          </button>
        )}

        {period.status !== 'paid' && (
          <>
            <button
              type="button"
              onClick={handleMarkAllPaid}
              disabled={pending}
              className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-bold rounded disabled:opacity-50"
              title="Mark All Paid + auto kirim slip via WA"
            >
              💸 Mark All Paid + Kirim WA
            </button>
            <button
              type="button"
              onClick={handleMarkAllPaidNoWA}
              disabled={pending}
              className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded disabled:opacity-50"
              title="Mark All Paid tanpa kirim WA"
            >
              (tanpa WA)
            </button>
          </>
        )}

        {period.status === 'paid' && (
          <button
            type="button"
            onClick={handleSendAllSlips}
            disabled={pending}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded disabled:opacity-50"
            title="Kirim ulang slip semua karyawan via WhatsApp"
          >
            📱 Kirim Ulang Semua Slip via WA
          </button>
        )}

        <button
          type="button"
          onClick={handleDelete}
          disabled={pending}
          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded disabled:opacity-50"
        >
          🗑 Hapus Periode
        </button>
      </div>

      {pending && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 text-xs text-blue-800">
          ⏳ Processing — kalau Mark All Paid + WA, mungkin perlu beberapa detik karena kirim slip satu-per-satu...
        </div>
      )}

      {result && (
        <div className={`rounded-lg p-3 text-xs ${result.error ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {result.error ? (
            <p className="font-bold">⚠ {result.error}</p>
          ) : (
            <>
              <p className="font-bold">{result.message || '✓ Selesai'}</p>
              {result.total_entries != null && (
                <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <StatBox label="Total Entry" value={result.total_entries} />
                  {result.cash_out_synced != null && <StatBox label="Cash Out Synced" value={result.cash_out_synced} color="text-blue-700" />}
                  {result.wa_sent != null && <StatBox label="Slip Terkirim" value={result.wa_sent} color="text-green-700" />}
                  {result.wa_no_phone > 0 && <StatBox label="No Phone (skip)" value={result.wa_no_phone} color="text-amber-700" />}
                  {result.wa_zero_pay > 0 && <StatBox label="Zero Pay (skip)" value={result.wa_zero_pay} color="text-slate-600" />}
                  {result.wa_failed > 0 && <StatBox label="WA Gagal" value={result.wa_failed} color="text-red-700" />}
                </div>
              )}
              {result.wa_errors?.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-red-600 font-semibold">⚠ {result.wa_errors.length} WA error</summary>
                  <ul className="mt-1 pl-4 space-y-0.5 text-red-700">
                    {result.wa_errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color = 'text-slate-700' }) {
  return (
    <div className="bg-white border border-slate-200 rounded px-2 py-1">
      <p className="text-[9px] uppercase font-bold text-slate-500">{label}</p>
      <p className={`text-base font-bold ${color}`}>{value || 0}</p>
    </div>
  );
}
