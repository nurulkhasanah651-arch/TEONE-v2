'use client';

// Round 187: WA Payment Section — Kirim invoice + bukti payment per peserta
// Path: components/finance/WAPaymentSection.jsx

import { useState, useTransition } from 'react';
import { sendInvoiceWA, sendPaymentReceivedWA, bulkSendInvoiceWA } from '@/lib/actions/wa-payment-notif';

function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

export default function WAPaymentSection({ tripId, passengers, paymentsByPassenger }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [toast, setToast] = useState(null);

  if (!passengers || passengers.length === 0) return null;

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSendInvoice = (paxId) => {
    setBusyId(paxId);
    setBusyAction('invoice');
    startTransition(async () => {
      const r = await sendInvoiceWA(paxId);
      setBusyId(null);
      setBusyAction(null);
      if (r.error) showToast(`❌ ${r.error}`, 'error');
      else showToast(`✅ Invoice terkirim ke ${r.target}`);
    });
  };

  const handleSendReceipt = (paxId) => {
    setBusyId(paxId);
    setBusyAction('receipt');
    startTransition(async () => {
      const r = await sendPaymentReceivedWA(paxId);
      setBusyId(null);
      setBusyAction(null);
      if (r.error) showToast(`❌ ${r.error}`, 'error');
      else showToast(`✅ Bukti payment ${r.lunas ? '(LUNAS)' : ''} terkirim`);
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
  );
}
