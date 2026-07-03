'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendTLAssignment, resetTLAssignment } from '@/lib/actions/tl-assign';
import { fmtDate } from '@/lib/utils/format';

export default function TLAssignButton({ trip }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const router = useRouter();

  const status = trip.tl_assignment_status;
  const sentAt = trip.tl_assignment_sent_at;
  const decidedAt = trip.tl_assignment_decided_at;
  const rejectNote = trip.tl_assignment_reject_note;

  async function handleSend() {
    if (!trip.tl_id) {
      alert('Trip belum ada TL terpilih. Set TL di Edit Trip dulu (pilih dari Master TL).');
      return;
    }
    setError('');
    startTransition(async () => {
      const r = await sendTLAssignment(trip.id);
      if (r?.error) {
        setError(r.error);
        return;
      }
      alert(`✓ Notif WA terkirim ke ${r.tlName} (${r.phone})\n\nDikirim via token: ${r.sentVia || '-'}`);
      router.refresh();
    });
  }

  async function handleReset() {
    if (!confirm('Reset assignment? Bisa kirim ulang setelah ini.')) return;
    setError('');
    startTransition(async () => {
      const r = await resetTLAssignment(trip.id);
      if (r?.error) { setError(r.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-bold text-brand-700 uppercase tracking-wider">📱 Penugasan WhatsApp TL</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {trip.tl_name ? <>TL: <strong>{trip.tl_name}</strong></> : <em>Belum ada TL — set di Edit Trip dulu</em>}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Status detail */}
      {status === 'pending' && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded text-xs">
          <p className="font-bold text-blue-800">⏳ Menunggu respons TL</p>
          <p className="text-blue-700 mt-1">Dikirim: {fmtDate(sentAt)}. Cek WA TL kalau belum dibales.</p>
        </div>
      )}

      {status === 'approved' && (
        <div className="p-3 bg-green-50 border border-green-200 rounded text-xs">
          <p className="font-bold text-green-800">✅ TL approved penugasan ini</p>
          <p className="text-green-700 mt-1">Diputuskan: {fmtDate(decidedAt)}. Trip muncul di Portal TL.</p>
        </div>
      )}

      {status === 'rejected' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded text-xs">
          <p className="font-bold text-red-800">❌ TL REJECT — Cari pengganti!</p>
          <p className="text-red-700 mt-1">Diputuskan: {fmtDate(decidedAt)}</p>
          {rejectNote && <p className="text-red-700 mt-1 italic">"{rejectNote}"</p>}
          <p className="text-red-700 mt-1">Edit trip → pilih TL baru → reset assignment & kirim ulang.</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex gap-2 flex-wrap">
        {(!status || status === 'rejected') && (
          <button
            onClick={handleSend}
            disabled={pending || !trip.tl_id}
            className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded disabled:opacity-50"
          >
            {pending ? 'Mengirim...' : '📱 Send WA Penugasan'}
          </button>
        )}
        {status === 'pending' && (
          <>
            <button onClick={handleSend} disabled={pending} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded disabled:opacity-50">
              {pending ? 'Mengirim...' : '🔁 Kirim Ulang'}
            </button>
            <button onClick={handleReset} disabled={pending} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded">
              Reset
            </button>
          </>
        )}
        {status === 'approved' && (
          <button onClick={handleReset} disabled={pending} className="px-3 py-1.5 text-xs text-slate-500 hover:text-red-600">
            Reset assignment (kalau perlu)
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    pending:  { label: '⏳ PENDING', color: 'bg-blue-100 text-blue-800' },
    approved: { label: '✅ APPROVED', color: 'bg-green-100 text-green-800' },
    rejected: { label: '❌ REJECTED', color: 'bg-red-100 text-red-800 animate-pulse' },
  };
  if (!status) return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">Belum kirim</span>;
  const c = cfg[status] || cfg.pending;
  return <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${c.color}`}>{c.label}</span>;
}
