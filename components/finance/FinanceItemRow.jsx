'use client';

// Round 184 + R215l: FinanceItemRow + INLINE EDIT MODE
// R215l: TAMBAH tombol ✏ Edit → inline edit semua field (Component, Vendor, Category, Qty, Basic Fare,
//        Total Amount, Payment Status, DP Paid, Notes)
// R215l: Request DP default = EMPTY (sesuai request user)
// EXISTING: Request Deposit/Pelunasan, Approve, Cancel, Delete, HPPDocumentBar → TETAP UTUH
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
// R215l — Edit action
import { updateFinanceItem } from '@/lib/actions/finance-item-edit';
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

function needsDepositPhase(item) {
  if (item.skip_deposit === true) return false;
  const planned = Number(item.deposit_planned) || 0;
  if (planned <= 0) return false;
  if (item.payment_phase === 'pelunasan' && Number(item.dp_paid || 0) > 0) return false;
  return true;
}

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
  const invoiceFileRef = useRef(null);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);

  // R215l — Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    component: '',
    vendor_name: '',
    category: '',
    qty: '',
    basic_fare: '',
    total_amount: '',
    payment_status: '',
    dp_paid: '',
    notes: '',
  });
  const [editMsg, setEditMsg] = useState(null);
  const [autoCalcTotal, setAutoCalcTotal] = useState(true);

  const total = Number(i.total_amount) || 0;
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
      const r = await requestPaymentToAccounting(i.id, tripId, reqNote, amt, reqPhase);
      if (r?.error) { alert(r.error); return; }

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
    // R215l — empty default per user request (input manual)
    setReqAmount('');
    setShowReqForm(true);
  }

  function openRequestPelunasan() {
    setReqPhase('pelunasan');
    setReqAmount(String(sisa));
    setShowReqForm(true);
  }

  // R215l — Edit mode handlers
  function openEdit() {
    setEditForm({
      component: i.component || '',
      vendor_name: i.vendor_name || '',
      category: i.category || '',
      qty: i.qty != null ? String(i.qty) : '',
      basic_fare: i.basic_fare != null ? String(i.basic_fare) : '',
      total_amount: i.total_amount != null ? String(i.total_amount) : '',
      payment_status: i.payment_status || 'belum lunas',
      dp_paid: i.dp_paid != null ? String(i.dp_paid) : '0',
      notes: i.notes || '',
    });
    setEditMsg(null);
    setAutoCalcTotal(true);
    setEditMode(true);
  }

  function closeEdit() {
    setEditMode(false);
    setEditMsg(null);
  }

  function handleEditChange(field, value) {
    setEditForm((f) => {
      const next = { ...f, [field]: value };
      // R215l — Auto-recalc total kalau qty/basic_fare berubah & autoCalcTotal aktif
      if (autoCalcTotal && (field === 'qty' || field === 'basic_fare')) {
        const qty = Number(field === 'qty' ? value : f.qty) || 0;
        const fare = Number(field === 'basic_fare' ? value : f.basic_fare) || 0;
        next.total_amount = String(qty * fare);
      }
      // R215l — Kalau user manual edit total → disable auto-calc
      if (field === 'total_amount') {
        setAutoCalcTotal(false);
      }
      return next;
    });
  }

  function handleSaveEdit() {
    const updates = {
      component: editForm.component.trim(),
      vendor_name: editForm.vendor_name.trim() || null,
      category: editForm.category.trim() || 'Lainnya',
      qty: Number(editForm.qty) || 0,
      basic_fare: Number(editForm.basic_fare) || 0,
      total_amount: Number(editForm.total_amount) || 0,
      payment_status: editForm.payment_status,
      dp_paid: Number(editForm.dp_paid) || 0,
      notes: editForm.notes.trim(),
    };

    if (!updates.component) {
      setEditMsg({ type: 'error', text: 'Component wajib diisi' });
      return;
    }

    startTransition(async () => {
      const r = await updateFinanceItem(i.id, tripId, updates);
      if (r?.error) {
        setEditMsg({ type: 'error', text: r.error });
        return;
      }
      setEditMsg({ type: 'success', text: '✓ Saved' + (r.warning ? ' · ' + r.warning : '') });
      setTimeout(() => {
        setEditMode(false);
        router.refresh();
      }, 800);
    });
  }

  // R215l — EDIT MODE (kalau aktif, render form)
  if (editMode) {
    return (
      <div className="p-3 bg-blue-50 border-2 border-blue-400 rounded-lg space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">
            ✏ EDIT MODE — Item #{i.id}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={pending}
              className="px-3 py-1 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              {pending ? '⏳ Saving...' : '💾 Save'}
            </button>
            <button
              type="button"
              onClick={closeEdit}
              disabled={pending}
              className="px-3 py-1 text-xs font-semibold rounded bg-slate-200 hover:bg-slate-300 text-slate-700"
            >
              ✕ Cancel
            </button>
          </div>
        </div>

        {editMsg && (
          <div className={`p-2 rounded text-xs ${
            editMsg.type === 'error' ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
          }`}>
            {editMsg.text}
          </div>
        )}

        {/* Basic info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-0.5">Component *</label>
            <input
              type="text"
              value={editForm.component}
              onChange={(e) => handleEditChange('component', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-0.5">Vendor</label>
            <input
              type="text"
              value={editForm.vendor_name}
              onChange={(e) => handleEditChange('vendor_name', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-0.5">Category</label>
            <input
              type="text"
              value={editForm.category}
              onChange={(e) => handleEditChange('category', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-0.5">
              Payment Status
            </label>
            <select
              value={editForm.payment_status}
              onChange={(e) => handleEditChange('payment_status', e.target.value)}
              className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white"
            >
              <option value="belum lunas">❌ Belum Lunas</option>
              <option value="dp">💵 DP / Partial</option>
              <option value="lunas">✅ Lunas</option>
              <option value="tidak perlu">— Tidak Perlu</option>
            </select>
          </div>
        </div>

        {/* Quantities */}
        <div className="p-2 bg-white border border-slate-200 rounded">
          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1">Quantities & Pricing</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Qty</label>
              <input
                type="number"
                value={editForm.qty}
                onChange={(e) => handleEditChange('qty', e.target.value)}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Basic Fare (per unit)</label>
              <input
                type="text"
                inputMode="numeric"
                value={fmtInput(editForm.basic_fare)}
                onChange={(e) => handleEditChange('basic_fare', parseInput(e.target.value))}
                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">
                Total Amount {autoCalcTotal && <span className="text-amber-600">(auto)</span>}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={fmtInput(editForm.total_amount)}
                onChange={(e) => handleEditChange('total_amount', parseInput(e.target.value))}
                className={`w-full px-2 py-1.5 border rounded text-sm font-mono font-bold ${autoCalcTotal ? 'border-amber-200 bg-amber-50' : 'border-blue-300 bg-blue-50'}`}
              />
              {!autoCalcTotal && (
                <button
                  type="button"
                  onClick={() => {
                    setAutoCalcTotal(true);
                    const qty = Number(editForm.qty) || 0;
                    const fare = Number(editForm.basic_fare) || 0;
                    handleEditChange('total_amount', String(qty * fare));
                  }}
                  className="text-[10px] text-blue-600 hover:underline mt-0.5"
                >
                  ↻ Re-enable auto-calc
                </button>
              )}
            </div>
          </div>
        </div>

        {/* DP Paid */}
        <div>
          <label className="text-[10px] font-bold text-slate-600 uppercase block mb-0.5">
            DP Paid (yg sudah dibayar)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={fmtInput(editForm.dp_paid)}
            onChange={(e) => handleEditChange('dp_paid', parseInput(e.target.value))}
            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-mono"
          />
          <p className="text-[10px] text-slate-500 mt-0.5">
            Catatan: Set DP Paid = Total Amount + status='lunas' kalau item udah lunas
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="text-[10px] font-bold text-slate-600 uppercase block mb-0.5">Notes</label>
          <textarea
            value={editForm.notes}
            onChange={(e) => handleEditChange('notes', e.target.value)}
            rows="2"
            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
          />
        </div>
      </div>
    );
  }

  // R215l — DISPLAY MODE (existing — gak diubah)
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
            {i.item_type === 'hpp' && !hasDepositPhase && status.code !== 'lunas' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                💨 Tanpa DP
              </span>
            )}
            {i.is_hotel === true && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                🏨 Hotel
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
          {/* R215l — EDIT button (selalu available kecuali waktu request pending) */}
          {status.code !== 'requested' && (
            <button
              type="button"
              onClick={openEdit}
              disabled={pending}
              className="px-2 py-1 text-xs font-semibold rounded bg-purple-100 hover:bg-purple-200 text-purple-800"
              title="Edit item (component, vendor, qty, harga, status, dll)"
            >
              ✏ Edit
            </button>
          )}

          {i.item_type === 'hpp' && status.code !== 'requested' && status.code !== 'lunas' && (
            <>
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
              {/* R215l — Always allow Request DP juga (kalau status pending) */}
              {!hasDepositPhase && dp === 0 && status.code === 'pending' && (
                <button
                  type="button"
                  onClick={openRequestDeposit}
                  disabled={pending}
                  className="px-2 py-1 text-xs font-semibold rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
                  title="Request DP (manual)"
                >
                  💰 Request DP
                </button>
              )}
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
            <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">
              Jumlah (Rp) {reqPhase === 'deposit' && <span className="text-amber-700">(input manual)</span>}
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={fmtInput(reqAmount)}
              onChange={(e) => setReqAmount(parseInput(e.target.value))}
              placeholder={reqPhase === 'deposit' ? `Input nominal DP (sisa: ${fmtRupiah(sisa)})` : `Sisa: ${fmtRupiah(sisa)}`}
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

      {i.item_type === 'hpp' && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <HPPDocumentBar item={i} canUploadInvoice={true} canUploadProof={true} compact={true} />
        </div>
      )}
    </div>
  );
}
