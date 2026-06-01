'use client';

// Round 184: FinanceItemRow — + invoice upload saat request + download bukti transfer
// Path: components/finance/FinanceItemRow.jsx

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  deleteFinanceItem,
  requestPaymentToAccounting,
  cancelPaymentRequest,
  approvePayment,
} from '@/lib/actions/finance';
import { uploadHPPInvoice } from '@/lib/actions/hpp-documents';
// R184b: pakai standalone HPPDocumentBar component
import HPPDocumentBar from './HPPDocumentBar';

function fmtRupiah(n) {
  const v = Number(n) || 0;
  return 'Rp ' + v.toLocaleString('id-ID');
}
function fmtInput(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseInput(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9]/g, '');
}
function fmtDate(s) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return s; }
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor((d - today) / (1000 * 60 * 60 * 24));
}

// R179b: hitung "needs deposit phase?" — true kalau item butuh DP dulu
function needsDepositPhase(item) {
  if (item.skip_deposit === true) return false;
  const planned = Number(item.deposit_planned) || 0;
  if (planned <= 0) return false;
  if (item.payment_phase === 'pelunasan' && Number(item.dp_paid || 0) > 0) return false;
  return true;
}

// R180b: deriveStatus pakai payment_status sebagai SOURCE OF TRUTH
// (sebelumnya cuma cek dp_paid → kalau approve dari accounting gak set dp_paid, label salah)
function deriveStatus(item) {
  const total = Number(item.total_amount) || 0;
  const dp = Number(item.dp_paid) || 0;
  const status = String(item.payment_status || '').toLowerCase();
  const reqStatus = item.payment_request_status;
  const phase = item.payment_phase || 'deposit';
  const hasDepositPhase = needsDepositPhase(item);

  if (reqStatus === 'requested') {
    const phaseLabel = phase === 'deposit' ? 'Deposit' : 'Pelunasan';
    return { code: 'requested', label: `⏳ Request ${phaseLabel}`, color: 'bg-amber-100 text-amber-800' };
  }
  if (reqStatus === 'rejected') {
    return { code: 'rejected', label: '✕ Rejected', color: 'bg-red-100 text-red-800' };
  }
  // R180b: payment_status canonical
  if (status === 'lunas' || (dp > 0 && dp >= total && total > 0)) {
    return { code: 'lunas', label: '✅ LUNAS', color: 'bg-blue-100 text-blue-800' };
  }
  if (status.includes('dp') || status === 'partial' || dp > 0) {
    return { code: 'deposit_paid', label: '💵 Deposit Sudah Dibayar', color: 'bg-green-100 text-green-800' };
  }
  if (status === 'tidak perlu') {
    return { code: 'not_needed', label: '— Tidak Perlu', color: 'bg-slate-100 text-slate-500' };
  }
  return {
    code: 'pending',
    label: hasDepositPhase ? '❌ Deposit Belum Dibayar' : '❌ Belum Dibayar',
    color: 'bg-slate-100 text-slate-700',
  };
}

// R180b: hitung displayed "Dibayar" — kalau payment_status='lunas', force = total
function getDisplayedPaid(item, total) {
  const dp = Number(item.dp_paid) || 0;
  const status = String(item.payment_status || '').toLowerCase();
  if (status === 'lunas') return total;
  return Math.min(dp, total);
}

export default function FinanceItemRow({ item, tripId, isFinance = false }) {
  const i = item;
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqAmount, setReqAmount] = useState('');
  const [reqNote, setReqNote] = useState('');
  const [reqPhase, setReqPhase] = useState('deposit');
  // R184: invoice + transfer proof
  const invoiceFileRef = useRef(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [docMsg, setDocMsg] = useState('');

  const total = Number(i.total_amount) || 0;
  // R180b: dipakai untuk display "Dibayar" — kalau status='lunas', force = total walau dp_paid=0
  const dp = getDisplayedPaid(i, total);
  const sisa = Math.max(total - dp, 0);
  const deposit = Number(i.deposit_planned) || 0;
  const reqAmt = Number(i.payment_request_amount) || 0;
  const deadline = i.deadline_pelunasan;
  const deadlineDp = i.deadline_deposit;
  const daysToDeadline = daysUntil(deadline);
  const daysToDp = daysUntil(deadlineDp);
  const status = deriveStatus(i);
  const hasDepositPhase = needsDepositPhase(i);

  function handleDelete() {
    if (!confirm(`Hapus item "${i.category} — ${i.component}"?`)) return;
    startTransition(async () => {
      const r = await deleteFinanceItem(i.id, tripId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  async function handleRequestPayment() {
    const amt = parseInt(reqAmount) || 0;
    if (amt <= 0) { alert('Jumlah harus > 0'); return; }
    if (amt > sisa) {
      if (!confirm(`Jumlah ${fmtRupiah(amt)} > sisa ${fmtRupiah(sisa)}. Lanjut?`)) return;
    }
    startTransition(async () => {
      // R184: kirim request dulu
      const r = await requestPaymentToAccounting(i.id, tripId, reqNote, amt, reqPhase);
      if (r?.error) { alert(r.error); return; }

      // R184: upload invoice kalau ada file
      const file = invoiceFileRef.current?.files?.[0];
      if (file) {
        setUploadingInvoice(true);
        const fd = new FormData();
        fd.append('invoice_file', file);
        const upRes = await uploadHPPInvoice(i.id, fd);
        setUploadingInvoice(false);
        if (upRes?.error) {
          alert('Request terkirim, tapi upload invoice gagal: ' + upRes.error);
        }
        if (invoiceFileRef.current) invoiceFileRef.current.value = '';
      }

      setShowReqForm(false);
      setReqAmount('');
      setReqNote('');
      router.refresh();
    });
  }

  // R184b: handlers untuk doc moved ke HPPDocumentBar component

  function handleCancelRequest() {
    if (!confirm('Batalkan permintaan payment?')) return;
    startTransition(async () => {
      const r = await cancelPaymentRequest(i.id, tripId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function handleApprove() {
    const phaseLabel = (i.payment_phase || 'deposit') === 'deposit' ? 'Deposit' : 'Pelunasan';
    if (!confirm(`Approve ${phaseLabel} ${fmtRupiah(reqAmt)} untuk "${i.category} — ${i.component}"?\n\nDP akan ter-update otomatis.`)) return;
    startTransition(async () => {
      const r = await approvePayment(i.id, tripId);
      if (r?.error) alert(r.error);
      router.refresh();
    });
  }

  function openRequestDeposit() {
    setReqPhase('deposit');
    setReqAmount(String(deposit > 0 ? deposit : Math.round(total / 2)));
    setShowReqForm(true);
  }

  function openRequestPelunasan() {
    setReqPhase('pelunasan');
    // Kalau skip_deposit / belum bayar apapun → request full sisa (= total)
    setReqAmount(String(sisa));
    setShowReqForm(true);
  }

  return (
    <div className="p-3 bg-white border border-slate-200 rounded-lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs font-bold text-brand-700">{i.category}</span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-sm font-semibold text-slate-800">{i.component}</span>
            {i.vendor_name && <span className="text-[11px] text-slate-500">({i.vendor_name})</span>}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.color}`}>
              {status.label}
            </span>
            {/* R179b: badge skip_deposit kalau memang tanpa DP */}
            {i.item_type === 'hpp' && !hasDepositPhase && status.code !== 'lunas' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                💨 Tanpa DP
              </span>
            )}
          </div>

          {i.item_type === 'hpp' ? (
            <>
              <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                <div className="bg-slate-50 rounded px-2 py-1">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total</p>
                  <p className="font-bold text-slate-800">{fmtRupiah(total)}</p>
                </div>
                <div className={dp > 0 ? 'bg-green-50 rounded px-2 py-1' : 'bg-slate-50 rounded px-2 py-1'}>
                  <p className={`text-[10px] uppercase tracking-wider ${dp > 0 ? 'text-green-700' : 'text-slate-500'}`}>Dibayar</p>
                  <p className={`font-bold ${dp > 0 ? 'text-green-800' : 'text-slate-500'}`}>{fmtRupiah(dp)}</p>
                </div>
                <div className={`rounded px-2 py-1 ${sisa > 0 ? 'bg-amber-50' : 'bg-blue-50'}`}>
                  <p className={`text-[10px] uppercase tracking-wider ${sisa > 0 ? 'text-amber-700' : 'text-blue-700'}`}>Sisa</p>
                  <p className={`font-bold ${sisa > 0 ? 'text-amber-800' : 'text-blue-800'}`}>{fmtRupiah(sisa)}</p>
                </div>
              </div>

              {/* Deadline Deposit (kalau ada deposit phase) */}
              {hasDepositPhase && deadlineDp && dp === 0 && (
                <div className={`mt-2 px-2 py-1 rounded text-xs flex items-center gap-2 flex-wrap ${
                  daysToDp < 0 ? 'bg-red-50 text-red-800' :
                  daysToDp <= 3 ? 'bg-amber-50 text-amber-800' :
                  'bg-slate-50 text-slate-700'
                }`}>
                  <span className="font-bold">📅 Deadline Deposit:</span>
                  <span>{fmtDate(deadlineDp)}</span>
                  {daysToDp != null && (
                    <span className="font-bold">
                      {daysToDp < 0 ? `⚠ Lewat ${Math.abs(daysToDp)} hari!` :
                       daysToDp === 0 ? '⏰ HARI INI!' :
                       `${daysToDp} hari lagi`}
                    </span>
                  )}
                </div>
              )}

              {/* Deadline Pelunasan */}
              {deadline && sisa > 0 && (
                <div className={`mt-2 px-2 py-1 rounded text-xs flex items-center gap-2 flex-wrap ${
                  daysToDeadline < 0 ? 'bg-red-50 text-red-800' :
                  daysToDeadline <= 7 ? 'bg-amber-50 text-amber-800' :
                  'bg-slate-50 text-slate-700'
                }`}>
                  <span className="font-bold">📅 Deadline Pelunasan:</span>
                  <span>{fmtDate(deadline)}</span>
                  {daysToDeadline != null && (
                    <span className="font-bold">
                      {daysToDeadline < 0 ? `⚠ Lewat ${Math.abs(daysToDeadline)} hari!` :
                       daysToDeadline === 0 ? '⏰ HARI INI!' :
                       daysToDeadline <= 7 ? `⏰ ${daysToDeadline} hari lagi` :
                       `${daysToDeadline} hari lagi`}
                    </span>
                  )}
                </div>
              )}

              {hasDepositPhase && deposit > 0 && dp === 0 && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Rencana Deposit: <span className="font-bold">{fmtRupiah(deposit)}</span>
                  {' · '}Sisa Pelunasan: <span className="font-bold">{fmtRupiah(total - deposit)}</span>
                </p>
              )}
            </>
          ) : (
            <p className="text-sm font-bold text-green-700 mt-1">{fmtRupiah(total)}</p>
          )}

          {i.notes && <p className="text-[11px] text-slate-500 mt-1.5 italic">📝 {i.notes}</p>}

          {status.code === 'requested' && reqAmt > 0 && (
            <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
              📨 Request {i.payment_phase === 'pelunasan' ? 'Pelunasan' : 'Deposit'}: <span className="font-bold">{fmtRupiah(reqAmt)}</span>
              {i.payment_requested_note && <span className="block mt-0.5 italic">"{i.payment_requested_note}"</span>}
              {i.payment_requested_by && <span className="block mt-0.5 text-amber-600">by {i.payment_requested_by}</span>}
            </div>
          )}
        </div>

        <div className="flex gap-1 flex-wrap">
          {/* R179b: SMART BUTTON ROUTING */}
          {i.item_type === 'hpp' && status.code !== 'requested' && status.code !== 'lunas' && (
            <>
              {/* Kalau butuh DP phase & belum bayar apapun → Request Deposit */}
              {hasDepositPhase && dp === 0 && (
                <button
                  type="button"
                  onClick={openRequestDeposit}
                  disabled={pending}
                  className="px-2 py-1 text-xs font-semibold rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
                >
                  📨 Request Deposit
                </button>
              )}
              {/* Kalau skip_deposit/no_deposit & belum bayar → langsung Request Pelunasan */}
              {!hasDepositPhase && dp === 0 && (
                <button
                  type="button"
                  onClick={openRequestPelunasan}
                  disabled={pending}
                  className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 hover:bg-blue-200 text-blue-800"
                >
                  📨 Request Pelunasan
                </button>
              )}
              {/* Setelah DP dibayar & masih ada sisa → Request Pelunasan */}
              {dp > 0 && sisa > 0 && (
                <button
                  type="button"
                  onClick={openRequestPelunasan}
                  disabled={pending}
                  className="px-2 py-1 text-xs font-semibold rounded bg-blue-100 hover:bg-blue-200 text-blue-800"
                >
                  📨 Request Pelunasan ({fmtRupiah(sisa)})
                </button>
              )}
            </>
          )}

          {i.item_type === 'hpp' && status.code === 'requested' && (
            <>
              {isFinance && (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={pending}
                  className="px-2 py-1 text-xs font-semibold rounded bg-green-100 hover:bg-green-200 text-green-800"
                >
                  ✓ Approve {fmtRupiah(reqAmt)}
                </button>
              )}
              <button
                type="button"
                onClick={handleCancelRequest}
                disabled={pending}
                className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
              >
                ✕ Batal
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="px-2 py-1 text-xs font-semibold rounded bg-red-50 hover:bg-red-100 text-red-700"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Request payment form */}
      {showReqForm && (
        <div className={`mt-3 p-3 border rounded space-y-2 ${reqPhase === 'pelunasan' ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className={`text-xs font-bold uppercase tracking-wider ${reqPhase === 'pelunasan' ? 'text-blue-800' : 'text-amber-800'}`}>
            📨 Request {reqPhase === 'pelunasan' ? 'Pelunasan' : 'Deposit'} ke Finance/Owner
          </p>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Jumlah (Rp)</span>
            <input
              type="text"
              inputMode="numeric"
              value={fmtInput(reqAmount)}
              onChange={(e) => setReqAmount(parseInput(e.target.value))}
              placeholder={`Sisa: ${fmtRupiah(sisa)}`}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Catatan (Opsional)</span>
            <input
              type="text"
              value={reqNote}
              onChange={(e) => setReqNote(e.target.value)}
              placeholder="Catatan untuk Finance"
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            />
          </label>

          {/* R184: Upload invoice — opsional kalau item belum ada invoice */}
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">
              📎 Upload Invoice {i.invoice_url ? '(replace)' : '(opsional)'}
            </span>
            <input
              ref={invoiceFileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-200 file:text-slate-700"
            />
            <span className="text-[10px] text-slate-400">Format PDF/JPG/PNG, max 10MB</span>
            {i.invoice_url && (
              <span className="text-[10px] text-green-600 ml-2">✓ Invoice sudah ada — upload baru akan replace</span>
            )}
          </label>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowReqForm(false); setReqAmount(''); setReqNote(''); if (invoiceFileRef.current) invoiceFileRef.current.value = ''; }}
              className="px-3 py-1 text-xs font-semibold rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleRequestPayment}
              disabled={pending || !reqAmount}
              className={`px-3 py-1 text-xs font-semibold rounded text-white disabled:opacity-50 ${reqPhase === 'pelunasan' ? 'bg-blue-500 hover:bg-blue-600' : 'bg-amber-500 hover:bg-amber-600'}`}
            >
              {uploadingInvoice ? '⏳ Uploading...' : '📨 Kirim Request'}
            </button>
          </div>
        </div>
      )}

      {/* R184b: DOCUMENT BAR — selalu nampak buat HPP item, Finance bisa upload invoice kapan saja */}
      {i.item_type === 'hpp' && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <HPPDocumentBar item={i} canUploadInvoice={true} canUploadProof={false} compact={true} />
        </div>
      )}
    </div>
  );
}
