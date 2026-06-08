'use client';

// Round 114: Button + Modal untuk transfer peserta ke trip lain
// File: components/trips/TransferPassengerButton.jsx

import { useState, useTransition } from 'react';
import { transferPassenger } from '@/lib/actions/transfers';

export default function TransferPassengerButton({ passenger, allTrips = [] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [targetTripId, setTargetTripId] = useState('');
  const [reason, setReason] = useState('');
  const [transferFamily, setTransferFamily] = useState(false);
  const [cancelUnpaidInvoices, setCancelUnpaidInvoices] = useState(true);
  const [forfeitAmount, setForfeitAmount] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // Filter trips: exclude trip yang sama dengan passenger sekarang
  const targetOptions = allTrips.filter((t) => t.id !== passenger.trip_id);

  const hasFamily = !!passenger.family_group_id;

  // Kalau peserta udah transferred, tampilin badge bukan button
  if (passenger.transfer_status === 'transferred') {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-xs">
        <span>📤</span>
        <span className="text-amber-800 font-semibold">Sudah pindah trip</span>
      </div>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!targetTripId) {
      setError('Pilih trip tujuan dulu');
      return;
    }
    if (!confirm(`Yakin pindah ${passenger.name} ke trip lain?\n\nData peserta, payment history, dan invoices akan ikut pindah.\nProses ini bisa di-undo nanti.`)) {
      return;
    }

    startTransition(async () => {
      const r = await transferPassenger({
        passengerId: passenger.id,
        targetTripId,
        reason: reason.trim(),
        transferFamily,
        cancelUnpaidInvoices,
        forfeitAmount: Number(String(forfeitAmount).replace(/[^0-9]/g, '')) || 0,
      });
      if (r?.error) {
        setError(r.error);
      } else {
        setResult(r);
      }
    });
  }

  if (result?.ok) {
    return (
      <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
          <div className="text-center mb-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-100 flex items-center justify-center text-3xl">
              ✓
            </div>
            <h2 className="text-lg font-bold text-green-700">Transfer Berhasil!</h2>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm space-y-1">
            <p><span className="text-slate-600">Total dipindah:</span> <span className="font-bold">{result.summary.success} dari {result.summary.total}</span></p>
            <p><span className="text-slate-600">Trip tujuan:</span> <span className="font-bold">{result.summary.targetTrip}</span></p>
            {result.summary.errors > 0 && (
              <p className="text-amber-700">⚠ {result.summary.errors} gagal — cek detail</p>
            )}
          </div>
          {result.results && result.results.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-slate-500 cursor-pointer">Detail</summary>
              <ul className="text-xs mt-2 space-y-1">
                {result.results.map((r, i) => (
                  <li key={i} className={r.ok ? 'text-green-700' : 'text-red-700'}>
                    {r.ok ? '✓' : '✗'} {r.oldName || r.oldId}
                    {r.error && <span className="text-red-600"> — {r.error}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            onClick={() => { setOpen(false); setResult(null); window.location.reload(); }}
            className="mt-5 w-full py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg"
          >
            Tutup & Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(''); }}
        className="text-xs px-2 py-1 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold"
        title="Pindahkan peserta ke trip lain"
      >
        📤 Pindah Trip
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !pending && setOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-brand-700 mb-1">📤 Pindahkan Peserta</h2>
            <p className="text-xs text-slate-500 mb-4">
              Peserta: <span className="font-semibold text-slate-800">{passenger.name}</span>
              {passenger.room_type && <span> · {passenger.room_type}</span>}
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Trip Tujuan *</label>
                <select
                  value={targetTripId}
                  onChange={(e) => setTargetTripId(e.target.value)}
                  required
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg"
                  disabled={pending}
                >
                  <option value="">— Pilih trip tujuan —</option>
                  {targetOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.kode_trip ? `${t.kode_trip} · ` : ''}{t.name}{t.departure ? ` (${t.departure})` : ''}
                    </option>
                  ))}
                </select>
                {targetOptions.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">⚠ Tidak ada trip lain di sistem</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Alasan Pindah (opsional)</label>
                <textarea autoComplete="off"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Peserta minta pindah karena jadwal bentrok"
                  rows={2}
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg resize-none"
                  disabled={pending}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Biaya Dihanguskan (opsional)</label>
                <input autoComplete="off" type="text" inputMode="numeric"
                  value={forfeitAmount}
                  onChange={(e) => {
                    const n = e.target.value.replace(/[^0-9]/g, '');
                    setForfeitAmount(n ? Number(n).toLocaleString('id-ID') : '');
                  }}
                  placeholder="0"
                  className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  disabled={pending}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Sebagian biaya yang <strong>tidak ikut pindah</strong> (denda). Nilai ini ditahan sebagai income trip lama, sisanya jadi kredit di trip baru.
                </p>
              </div>

              {hasFamily && (
                <label className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
                  <input autoComplete="off"
                    type="checkbox"
                    checked={transferFamily}
                    onChange={(e) => setTransferFamily(e.target.checked)}
                    disabled={pending}
                    className="mt-0.5"
                  />
                  <div>
                    <p className="text-xs font-bold text-blue-900">Pindahin seluruh family bareng</p>
                    <p className="text-[11px] text-blue-700">Peserta ini gabung dalam family. Centang kalau mau semua anggota family ikut pindah juga.</p>
                  </div>
                </label>
              )}

              <label className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
                <input autoComplete="off"
                  type="checkbox"
                  checked={cancelUnpaidInvoices}
                  onChange={(e) => setCancelUnpaidInvoices(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-xs font-bold text-amber-900">Cancel invoices yang belum dibayar</p>
                  <p className="text-[11px] text-amber-700">Invoice status 'sent' atau 'draft' akan di-cancel. Invoice yang sudah 'paid' tetap (cuma di-link ke trip baru).</p>
                </div>
              </label>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded p-3 text-xs text-red-700">⚠ {error}</div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pending || !targetTripId}
                  className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg disabled:opacity-50"
                >
                  {pending ? 'Memindahkan...' : '📤 Pindahkan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
