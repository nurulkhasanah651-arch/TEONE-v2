'use client';

// Round 177 v3: Ops-only — + input nominal fee langsung di form
// Path: components/tl/RequestTLPaymentButtons.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

function fmtIDR(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }
function fmtIDRNum(n) { return Number(n || 0).toLocaleString('id-ID'); }
function parseIDR(s) { return s == null ? '' : String(s).replace(/[^0-9]/g, ''); }
function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE = {
  requested: { label: '⏳ Diajukan',  cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: '✓ Approved',    cls: 'bg-blue-100 text-blue-700' },
  paid:      { label: '✅ DIBAYAR',    cls: 'bg-green-100 text-green-700' },
  rejected:  { label: '✗ DITOLAK',     cls: 'bg-red-100 text-red-700' },
  pending:   { label: '⏳ Pending',    cls: 'bg-slate-100 text-slate-700' },
};

export default function RequestTLPaymentButtons({
  tripId,
  tlName,
  existingRequests = [],
  finalReportSubmitted = false,
  requestAction,
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState('');
  const [totalFee, setTotalFee] = useState('');     // R177v3: total fee trip (basis 70/30)
  const [customAmount, setCustomAmount] = useState(''); // R177v3: nominal termin ini
  const [openType, setOpenType] = useState(null);
  const [msg, setMsg] = useState(null);

  function flash(m, isErr = false) {
    setMsg({ text: m, isErr });
    setTimeout(() => setMsg(null), 7000);
  }

  const dp70 = existingRequests.find((r) => r.payment_type === 'dp_70');
  const final30 = existingRequests.find((r) => r.payment_type === 'final_30');

  function handleOpen(type) {
    setOpenType(type);
    setNotes('');
    setTotalFee('');
    setCustomAmount('');
    setMsg(null);
  }

  // Auto-calc preview saat user isi totalFee
  const totalFeeNum = Number(totalFee || 0);
  const autoCalc = totalFeeNum > 0
    ? (openType === 'dp_70' ? Math.round(totalFeeNum * 0.7) : totalFeeNum - Math.round(totalFeeNum * 0.7))
    : 0;
  const customAmtNum = Number(customAmount || 0);
  const finalNominal = customAmtNum > 0 ? customAmtNum : autoCalc;

  function handleSubmit() {
    if (!openType) return;
    if (!totalFee && !customAmount) {
      flash('Isi minimal salah satu: "Total Fee Trip" atau "Nominal Termin"', true);
      return;
    }
    startTransition(async () => {
      const r = await requestAction(tripId, openType, {
        notes,
        customAmount: customAmount || null,
        customTotalFee: totalFee || null,
      });
      if (r?.error) {
        flash(r.error, true);
      } else {
        flash(r.message || '✓ Request terkirim ke HR');
        if (r.warning) setTimeout(() => flash(r.warning, true), 4500);
        setOpenType(null);
        setNotes('');
        setTotalFee('');
        setCustomAmount('');
        router.refresh();
      }
    });
  }

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl border border-indigo-200 shadow-card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase text-indigo-700 tracking-wider">💼 Ajukan Gaji TL (Ops Only)</p>
          <p className="mt-1 text-xs text-slate-600">
            Pengajuan akan masuk queue HR untuk approval.
            {tlName && <> TL: <b className="text-indigo-700">{tlName}</b></>}
          </p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">INTERNAL OPS</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PaymentCard
          title="70% DP"
          desc="Diajukan sebelum keberangkatan"
          existing={dp70}
          disabled={!!dp70 && dp70.status !== 'rejected'}
          onClick={() => handleOpen('dp_70')}
        />
        <PaymentCard
          title="30% Final"
          desc={finalReportSubmitted
            ? 'Diajukan setelah Final Report submitted'
            : '⚠ Submit Final Report dulu'}
          existing={final30}
          disabled={(!!final30 && final30.status !== 'rejected') || !finalReportSubmitted}
          onClick={() => handleOpen('final_30')}
        />
      </div>

      {openType && (
        <div className="bg-white rounded-xl border-2 border-indigo-300 shadow-card p-4 space-y-3">
          <p className="text-sm font-bold text-indigo-700">
            📨 Ajukan Request — {openType === 'dp_70' ? '70% DP' : '30% Final'} untuk {tlName || 'TL'}
          </p>

          {/* R177v3: NOMINAL INPUT */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                Total Fee Trip (Rp) <span className="text-slate-400 font-normal">— basis 70/30 split</span>
              </span>
              <input autoComplete="off"
                type="text"
                inputMode="numeric"
                value={fmtIDRNum(totalFee)}
                onChange={(e) => setTotalFee(parseIDR(e.target.value))}
                placeholder="contoh: 10.000.000"
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
              {totalFeeNum > 0 && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Auto-calc {openType === 'dp_70' ? '70%' : '30%'}: <b>{fmtIDR(autoCalc)}</b>
                </p>
              )}
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-700">
                ATAU Nominal Termin (Rp) <span className="text-slate-400 font-normal">— override</span>
              </span>
              <input autoComplete="off"
                type="text"
                inputMode="numeric"
                value={fmtIDRNum(customAmount)}
                onChange={(e) => setCustomAmount(parseIDR(e.target.value))}
                placeholder="kalau gak pakai 70/30 default"
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1 italic">
                Isi nominal langsung kalau bukan 70/30 standar
              </p>
            </label>
          </div>

          {/* Preview */}
          {finalNominal > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <p className="text-xs text-slate-600">Nominal yg akan diajukan:</p>
              <p className="text-2xl font-bold text-indigo-700 font-mono">{fmtIDR(finalNominal)}</p>
            </div>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-slate-700">Catatan untuk HR (opsional)</span>
            <textarea autoComplete="off"
              rows="2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Misal: trip H-7, fee perlu cair untuk visa..."
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </label>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={pending || finalNominal <= 0}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-card"
            >
              {pending ? '⏳ Mengajukan...' : `📨 Ajukan ${finalNominal > 0 ? fmtIDR(finalNominal) : ''} ke HR`}
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

      {msg && (
        <div className={`rounded-lg p-3 text-sm ${msg.isErr ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {msg.text}
        </div>
      )}

      <p className="text-[10px] text-slate-500 italic">
        💡 Cuma <b>Ops · Manager · Finance · Owner</b> yg bisa ajukan. TL & CS gak punya akses ke menu ini.
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
            <p className="text-[10px] text-slate-500">
              Diajukan: {fmtDate(existing.requested_at)}
              {existing.requested_by && <> oleh {existing.requested_by}</>}
            </p>
          )}
          {existing.status === 'approved' && existing.approved_at && (
            <p className="text-[10px] text-blue-600">
              Approved: {fmtDate(existing.approved_at)}
              {existing.approved_by && <> · {existing.approved_by}</>}
            </p>
          )}
          {existing.status === 'paid' && existing.paid_at && (
            <p className="text-[10px] text-green-600">Dibayar: {fmtDate(existing.paid_at)}</p>
          )}
          {existing.status === 'rejected' && existing.reject_reason && (
            <p className="text-[10px] text-red-600">Reject: {existing.reject_reason}</p>
          )}
        </div>
      )}

      <button
        onClick={onClick}
        disabled={disabled}
        className={`mt-3 w-full px-3 py-2 text-xs font-bold rounded ${
          disabled
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-card'
        }`}
      >
        {existing
          ? (existing.status === 'rejected' ? 'Ajukan Lagi' : 'Sudah diajukan')
          : (disabled ? 'Belum bisa' : 'Ajukan Request')}
      </button>
    </div>
  );
}
