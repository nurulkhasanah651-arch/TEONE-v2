'use client';

// Round 187: WA Payment Section — Kirim invoice + bukti payment per peserta
// Path: components/finance/WAPaymentSection.jsx

import { useState, useTransition } from 'react';
import { sendInvoiceWA, sendPaymentReceivedWA, bulkSendInvoiceWA } from '@/lib/actions/wa-payment-notif';
import WaManualModal from '@/components/wa/WaManualModal';

function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function linkify(text) {
  return String(text || '').split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">{p}</a>
      : p
  );
}

export default function WAPaymentSection({ tripId, passengers, paymentsByPassenger }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [waManual, setWaManual] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [toast, setToast] = useState(null);
  const [preview, setPreview] = useState(null); // {paxId, kind, message, phone, customerName}

  if (!passengers || passengers.length === 0) return null;

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSendInvoice = (paxId) => {
    setBusyId(paxId);
    setBusyAction('invoice');
    startTransition(async () => {
      const r = await sendInvoiceWA(paxId, true); // preview only
      setBusyId(null);
      setBusyAction(null);
      if (r.error) showToast(`❌ ${r.error}`, 'error');
      else setPreview({ paxId, kind: 'invoice', message: r.message, phone: r.phone, customerName: r.customerName });
    });
  };

  const handleSendReceipt = (paxId) => {
    setBusyId(paxId);
    setBusyAction('receipt');
    startTransition(async () => {
      const r = await sendPaymentReceivedWA(paxId, true); // preview only
      setBusyId(null);
      setBusyAction(null);
      if (r.error) showToast(`❌ ${r.error}`, 'error');
      else setPreview({ paxId, kind: 'receipt', message: r.message, phone: r.phone, customerName: r.customerName });
    });
  };

  const confirmSend = () => {
    if (!preview) return;
    const { paxId, kind } = preview;
    setBusyId(paxId);
    setBusyAction(kind);
    startTransition(async () => {
      const r = kind === 'invoice' ? await sendInvoiceWA(paxId) : await sendPaymentReceivedWA(paxId);
      setBusyId(null);
      setBusyAction(null);
      setPreview(null);
      if (r.error) showToast(`❌ ${r.error}`, 'error');
      else if (r.wa_manual) setWaManual({ message: r.wa_message, phone: r.wa_phone, name: r.customer_name });
      else showToast(kind === 'invoice' ? `✅ Invoice terkirim ke ${r.target}` : `✅ Bukti payment ${r.lunas ? '(LUNAS)' : ''} terkirim`);
    });
  };

  const handleBulkSendInvoice = () => {
    if (!confirm('Kirim invoice via WA ke SEMUA peserta yang belum lunas?')) return;
    setBusyId('bulk');
    setBusyAction('bulk');
    startTransition(async () => {
      const r = await bulkSendInvoiceWA(tripId);
      setBusyId(null);
      setBusyAction(null);
      if (r.error) showToast(`❌ ${r.error}`, 'error');
      else showToast(`✅ ${r.message}`);
    });
  };

  // Stats
  const summary = passengers.map((p) => {
    const pays = paymentsByPassenger?.[p.id] || [];
    const totalBayar = pays.reduce((s, x) => s + (x.amount || 0), 0);
    const sisa = (p.price_paid || 0) - totalBayar;
    return { ...p, totalBayar, sisa, isLunas: sisa <= 0, hasPaid: pays.length > 0 };
  });
  const belumLunas = summary.filter(s => !s.isLunas).length;
  const lunas = summary.filter(s => s.isLunas).length;

  return (
    <>
    <WaManualModal data={waManual} onClose={() => setWaManual(null)} title="Kirim WA manual" />
    <div className="bg-white rounded-xl border-2 border-green-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-green-50 border-green-200 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-green-800 flex items-center gap-2">
            <span>📱</span> Kirim Notif Pembayaran via WA
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {passengers.length} peserta · {lunas} lunas · {belumLunas} masih ada sisa
          </p>
        </div>
        <button
          onClick={handleBulkSendInvoice}
          disabled={pending || belumLunas === 0}
          className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          {busyAction === 'bulk' ? '⏳ Mengirim...' : `📨 Kirim Invoice ke ${belumLunas} Peserta`}
        </button>
      </div>

      {toast && (
        <div className={`px-5 py-2 text-sm border-b ${toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          {toast.msg}
        </div>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !pending && setPreview(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b bg-gradient-to-r from-green-600 to-emerald-700 text-white flex items-center justify-between">
              <p className="font-bold">👀 Preview {preview.kind === 'receipt' ? 'Bukti Pembayaran' : 'Invoice'} — cek sebelum kirim</p>
              <button onClick={() => !pending && setPreview(null)} className="text-white/80 hover:text-white text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>👤 <b>{preview.customerName || '-'}</b></span>
                <span>📞 {preview.phone || <span className="text-red-600 font-semibold">belum ada no HP</span>}</span>
              </div>
              <div className="bg-[#e5ddd5] rounded-lg p-3">
                <div className="bg-[#dcf8c6] rounded-lg p-3 text-[13px] text-slate-800 whitespace-pre-wrap leading-snug shadow-sm">{linkify(preview.message)}</div>
              </div>
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2 bg-slate-50">
              <button onClick={() => setPreview(null)} disabled={pending} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50">Batal</button>
              <button onClick={confirmSend} disabled={pending || !preview.phone} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:opacity-50">{pending ? 'Mengirim…' : '✓ Konfirmasi & Kirim'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Peserta</th>
              <th className="px-3 py-2 text-left">No. WA</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Dibayar</th>
              <th className="px-3 py-2 text-right">Sisa</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-center">Aksi WA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {summary.map((p) => {
              const phone = p.customers?.whatsapp || p.customers?.phone || '-';
              const isBusy = pending && busyId === p.id;
              return (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-700">
                    {p.customers?.name || `Pax #${p.id}`}
                    {p.room_type && <div className="text-[10px] text-slate-400">{p.room_type}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{phone}</td>
                  <td className="px-3 py-2 text-right text-xs">{fmtRp(p.price_paid || 0)}</td>
                  <td className="px-3 py-2 text-right text-xs text-blue-700 font-semibold">{fmtRp(p.totalBayar)}</td>
                  <td className={`px-3 py-2 text-right text-xs font-bold ${p.sisa > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    {fmtRp(Math.max(0, p.sisa))}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {p.isLunas ? (
                      <span className="px-2 py-0.5 rounded bg-green-100 text-green-800 text-[10px] font-bold">LUNAS</span>
                    ) : p.hasPaid ? (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">CICILAN</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">BELUM</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => handleSendInvoice(p.id)}
                        disabled={pending || phone === '-'}
                        title={phone === '-' ? 'Peserta belum punya nomor HP' : 'Kirim link invoice via WA'}
                        className="px-2 py-1 rounded bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {isBusy && busyAction === 'invoice' ? '⏳' : '📋'} Invoice
                      </button>
                      <button
                        onClick={() => handleSendReceipt(p.id)}
                        disabled={pending || phone === '-' || !p.hasPaid}
                        title={
                          phone === '-' ? 'Peserta belum punya nomor HP'
                          : !p.hasPaid ? 'Belum ada pembayaran'
                          : 'Kirim bukti payment received via WA'
                        }
                        className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        {isBusy && busyAction === 'receipt' ? '⏳' : '✅'} Bukti
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-2 bg-slate-50 border-t text-[11px] text-slate-500">
        💡 <b>📋 Invoice</b> = kirim link invoice publik · <b>✅ Bukti</b> = kirim konfirmasi pembayaran diterima + detail riwayat
      </div>
    </div>
    </>
  );
}
