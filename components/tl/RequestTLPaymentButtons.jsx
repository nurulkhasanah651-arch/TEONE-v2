'use client';

// Round 177: TL Portal — buttons untuk request gaji 70%/30%
// Path: components/tl/RequestTLPaymentButtons.jsx
//
// USAGE di /tl/[tripId]/page.jsx (server component):
//   import RequestTLPaymentButtons from '@/components/tl/RequestTLPaymentButtons';
//   import { requestTLPayment, getTLPaymentsForTrip } from '@/lib/actions/tl-payments';
//   const requests = await getTLPaymentsForTrip(tripId);
//   <RequestTLPaymentButtons
//     tripId={tripId}
//     existingRequests={requests}
//     finalReportSubmitted={someBoolean}
//     requestAction={requestTLPayment}
//   />

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE = {
  requested: { label: '⏳ Diajukan', cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: '✓ Approved',   cls: 'bg-blue-100 text-blue-700' },
  paid:      { label: '✅ DIBAYAR',   cls: 'bg-green-100 text-green-700' },
  rejected:  { label: '✗ DITOLAK',    cls: 'bg-red-100 text-red-700' },
  pending:   { label: '⏳ Pending',   cls: 'bg-slate-100 text-slate-700' },
};

export default function RequestTLPaymentButtons({
  tripId,
  existingRequests = [],
  finalReportSubmitted = false,
  requestAction,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState('');
  const [openType, setOpenType] = useState(null); // 'dp_70' or 'final_30'
  const [msg, setMsg] = useState(null);

  function flash(m, isErr = false) {
    setMsg({ text: m, isErr });
    setTimeout(() => setMsg(null), 6000);
  }

  const dp70 = existingRequests.find((r) => r.payment_type === 'dp_70');
  const final30 = existingRequests.find((r) => r.payment_type === 'final_30');

  function handleOpen(type) {
    setOpenType(type);
    setNotes('');
    setMsg(null);
  }

  function handleSubmit() {
    if (!openType) return;
    startTransition(async () => {
      const r = await requestAction(tripId, openType, { notes });
      if (r?.error) {
        flash(r.error, true);
      } else {
        flash(r.message || '✓ Request terkirim ke HR');
        setOpenType(null);
        setNotes('');
        router.refresh();
      }
    });
  }

  return (
    <div className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl border border-pink-200 shadow-card p-5 space-y-3">
      <div>
        <p className="text-xs font-bold uppercase text-pink-700 tracking-wider">💰 Request Gaji TL</p>
        <p className="mt-1 text-xs text-slate-600">
          Pengajuan masuk ke HR untuk approval. Setelah disetujui, finance akan transfer ke rekening kamu.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* DP 70% */}
        <PaymentCard
          title="70% DP"
          desc="Diajukan sebelum keberangkatan trip"
          existing={dp70}
          disabled={!!dp70 && dp70.status !== 'rejected'}
          onClick={() => handleOpen('dp_70')}
        />

        {/* Final 30% */}
        <PaymentCard
          title="30% Final"
          desc={finalReportSubmitted
            ? 'Diajukan setelah Final Report di-submit'
            : '⚠ Submit Final Report dulu sebelum request'}
          existing={final30}
          disabled={(!!final30 && final30.status !== 'rejected') || !finalReportSubmitted}
          onClick={() => handleOpen('final_30')}
        />
      </div>

      {/* Form modal-like card */}
      {openType && (
        <div className="bg-white rounded-xl border border-pink-300 shadow-card p-4 space-y-3">
          <p className="text-sm font-bold text-pink-700">
            📨 Ajukan Request — {openType === 'dp_70' ? '70% DP' : '30% Final'}
          </p>
          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Catatan untuk HR (opsional)</span>
            <textarea
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Misal: butuh cepat karena bayar visa..."
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={pending}
              className="px-4 py-2 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card"
            >
              {pending ? '⏳ Mengajukan...' : '📨 Ajukan ke HR'}
            </button>
            <button
              onClick={() => setOpenType(null)}
              disabled={pending}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Flash message */}
      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.isErr ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {msg.text}
        </div>
      )}

      <p className="text-[10px] text-slate-500 italic">
        💡 Setelah HR approve, kamu akan di-WA notifikasi pembayaran. Jangan lupa cek slip!
      </p>
    </div>
  );
}

function PaymentCard({ title, desc, existing, disabled, onClick }) {
  const badge = existing ? STATUS_BADGE[existing.status] : null;
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-3">
      <p className="text-base font-bold text-slate-800">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{desc}</p>

      {existing && (
        <div className="mt-2 space-y-1">
          {badge && <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>}
          <p className="text-xs font-mono text-slate-700">{fmtIDR(existing.amount)}</p>
          {existing.status === 'requested' && existing.requested_at && (
            <p className="text-[10px] text-slate-500">Diajukan: {fmtDate(existing.requested_at)}</p>
          )}
          {existing.status === 'approved' && existing.approved_at && (
            <p className="text-[10px] text-blue-600">Disetujui: {fmtDate(existing.approved_at)} · menunggu transfer</p>
          )}
          {existing.status === 'paid' && existing.paid_at && (
            <p className="text-[10px] text-green-600">Dibayar: {fmtDate(existing.paid_at)}</p>
          )}
          {existing.status === 'rejected' && existing.reject_reason && (
            <p className="text-[10px] text-red-600">Ditolak: {existing.reject_reason}</p>
          )}
        </div>
      )}

      <button
        onClick={onClick}
        disabled={disabled}
        className={`mt-3 w-full px-3 py-2 text-xs font-bold rounded ${
          disabled
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-pink-500 hover:bg-pink-600 text-white shadow-card'
        }`}
      >
        {existing
          ? (existing.status === 'rejected' ? 'Ajukan Lagi' : 'Sudah diajukan')
          : (disabled ? 'Belum bisa' : 'Ajukan Request')}
      </button>
    </div>
  );
}
