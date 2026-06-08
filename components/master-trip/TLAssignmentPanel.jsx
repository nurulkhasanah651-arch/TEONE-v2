// components/master-trip/TLAssignmentPanel.jsx
// R198: Panel untuk assign TL + kirim WA konfirmasi via Fonnte

'use client';

import { useState, useTransition } from 'react';
import { sendTLAssignmentWA, resetTLAssignment } from '@/lib/actions/tl-assignment';

export default function TLAssignmentPanel({ trip }) {
  const tripId = trip?.id;
  const [tlName, setTlName] = useState(trip?.tl_name || '');
  const [tlPhone, setTlPhone] = useState(trip?.tl_phone || '');
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState(null);

  const status = trip?.tl_assignment_status || 'pending';
  const sentAt = trip?.tl_assignment_sent_at;
  const respondedAt = trip?.tl_assignment_responded_at;

  const statusBadge = {
    pending: { label: '⏳ Menunggu Konfirmasi', color: 'bg-yellow-100 text-yellow-800' },
    approved: { label: '✅ Approved oleh TL', color: 'bg-green-100 text-green-800' },
    rejected: { label: '❌ Rejected oleh TL', color: 'bg-red-100 text-red-800' },
  }[status] || { label: 'Belum di-set', color: 'bg-gray-100 text-gray-700' };

  const handleSendWA = async () => {
    setResult(null);

    if (!tlPhone || tlPhone.trim().length < 10) {
      setResult({ error: 'Nomor HP TL minimal 10 digit' });
      return;
    }

    const fd = new FormData();
    fd.set('tripId', String(tripId));
    fd.set('tlPhone', tlPhone.trim());
    fd.set('tlName', tlName.trim());

    startTransition(async () => {
      const res = await sendTLAssignmentWA(fd);
      setResult(res);
    });
  };

  const handleReset = async () => {
    if (!confirm('Reset assignment TL? Status balik ke pending dan link lama gak berlaku lagi.')) return;

    const fd = new FormData();
    fd.set('tripId', String(tripId));

    startTransition(async () => {
      const res = await resetTLAssignment(fd);
      setResult(res);
    });
  };

  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">📱 Assign Tour Leader (WA Konfirmasi)</h3>
        <span className={`text-xs px-2 py-1 rounded-full ${statusBadge.color}`}>
          {statusBadge.label}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nama TL</label>
          <input autoComplete="off"
            type="text"
            value={tlName}
            onChange={(e) => setTlName(e.target.value)}
            placeholder="Mis: Budi"
            disabled={isPending}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Nomor WA TL <span className="text-red-500">*</span>
          </label>
          <input autoComplete="off"
            type="tel"
            value={tlPhone}
            onChange={(e) => setTlPhone(e.target.value)}
            placeholder="08xxxxxxxxxx atau 628xxx"
            disabled={isPending}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSendWA}
          disabled={isPending || !tlPhone}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded text-sm font-medium flex items-center gap-2"
        >
          {isPending ? '⏳ Mengirim...' : status === 'pending' && !sentAt ? '📤 Kirim WA Konfirmasi' : '🔄 Kirim Ulang WA'}
        </button>

        {status !== 'pending' && (
          <button
            onClick={handleReset}
            disabled={isPending}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium"
          >
            ↩️ Reset & Assign Ulang
          </button>
        )}
      </div>

      {sentAt && (
        <p className="text-xs text-gray-500 mt-3">
          Dikirim: {new Date(sentAt).toLocaleString('id-ID')}
          {respondedAt && (
            <>
              {' • '}
              Respon: {new Date(respondedAt).toLocaleString('id-ID')}
            </>
          )}
        </p>
      )}

      {result?.ok && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          ✅ {result.message || 'Berhasil!'}
        </div>
      )}

      {result?.error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          ❌ {result.error}
        </div>
      )}
    </div>
  );
}
