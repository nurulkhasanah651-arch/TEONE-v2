// components/master-trip/TLSendWAButton.jsx
// R198: Button kirim WA Fonnte + badge status (compact, di samping Tour Leader)

'use client';

import { useState, useTransition } from 'react';
import { sendTLAssignmentWA, resetTLAssignment } from '@/lib/actions/tl-assignment';

/**
 * Props:
 *   - tripId: string (required)
 *   - tlPhone: string (current TL phone dari DB)
 *   - tlName: string
 *   - tlId: string (optional — kalau ada, server bakal lookup phone dari tour_leaders)
 *   - initialStatus, initialSentAt, initialRespondedAt
 */
export default function TLSendWAButton({
  tripId,
  tlPhone,
  tlName,
  tlId = null,
  initialStatus = 'pending',
  initialSentAt = null,
  initialRespondedAt = null,
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(initialStatus);
  const [sentAt, setSentAt] = useState(initialSentAt);
  const [respondedAt, setRespondedAt] = useState(initialRespondedAt);

  const badge = {
    pending: sentAt
      ? { label: '⏳ Menunggu Konfirmasi', color: 'bg-yellow-100 text-yellow-800 border-yellow-300' }
      : { label: '📭 Belum Dikirim', color: 'bg-gray-100 text-gray-700 border-gray-300' },
    approved: { label: '✅ TL Approved', color: 'bg-green-100 text-green-800 border-green-300' },
    rejected: { label: '❌ TL Rejected', color: 'bg-red-100 text-red-800 border-red-300' },
  }[status] || { label: '—', color: 'bg-gray-100 text-gray-700 border-gray-300' };

  // Boleh kirim kalau ada tlPhone ATAU tlId (server bakal lookup)
  const canSend = !!(tlPhone || tlId);

  const handleSend = async () => {
    setResult(null);

    if (!tripId) {
      setResult({ error: 'Trip belum tersimpan. Klik Update Trip dulu.' });
      return;
    }

    if (!canSend) {
      setResult({ error: 'Pilih TL dulu dari Master TL & save trip.' });
      return;
    }

    const fd = new FormData();
    fd.set('tripId', String(tripId));
    if (tlPhone) fd.set('tlPhone', String(tlPhone).trim());
    if (tlName) fd.set('tlName', String(tlName).trim());
    if (tlId) fd.set('tlId', String(tlId));

    startTransition(async () => {
      const res = await sendTLAssignmentWA(fd);
      setResult(res);
      if (res?.ok) {
        setStatus('pending');
        setSentAt(new Date().toISOString());
        setRespondedAt(null);
      }
    });
  };

  const handleReset = async () => {
    if (!confirm('Reset assignment TL? Link lama gak berlaku, harus kirim ulang.')) return;

    const fd = new FormData();
    fd.set('tripId', String(tripId));

    startTransition(async () => {
      const res = await resetTLAssignment(fd);
      setResult(res);
      if (res?.ok) {
        setStatus('pending');
        setSentAt(null);
        setRespondedAt(null);
      }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={isPending || !canSend}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded text-sm font-medium inline-flex items-center gap-1.5"
          title={!canSend ? 'Pilih TL dulu' : 'Kirim WA ke TL via Fonnte'}
        >
          {isPending
            ? '⏳ Mengirim...'
            : sentAt
            ? '🔄 Kirim Ulang WA'
            : '📤 Send WA Konfirmasi'}
        </button>

        <span className={`text-xs px-2 py-1 rounded-full border font-medium ${badge.color}`}>
          {badge.label}
        </span>

        {status !== 'pending' && (
          <button
            type="button"
            onClick={handleReset}
            disabled={isPending}
            className="text-xs text-gray-600 hover:text-gray-900 underline"
          >
            Reset
          </button>
        )}
      </div>

      {sentAt && (
        <p className="text-xs text-gray-500">
          📤 Sent: {new Date(sentAt).toLocaleString('id-ID')}
          {respondedAt && (
            <>
              {' • '}
              💬 Response: {new Date(respondedAt).toLocaleString('id-ID')}
            </>
          )}
        </p>
      )}

      {result?.ok && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
          ✅ {result.message || 'Berhasil'}
        </div>
      )}

      {result?.error && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          ❌ {result.error}
        </div>
      )}
    </div>
  );
}
