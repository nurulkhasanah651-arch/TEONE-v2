'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createManualInvoice, sendInvoiceWA } from '@/lib/actions/invoices';

const PRESETS = ['Visa Only', 'Asuransi Perjalanan', 'Tiket Pesawat', 'Pengurusan Dokumen', 'Lainnya'];
function fmt(n) { return Number(String(n).replace(/\D/g, '') || 0).toLocaleString('id-ID'); }

export default function ManualInvoiceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [amount, setAmount] = useState('');
  const [milestone, setMilestone] = useState('Visa Only');

  const inp = 'w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm';
  const link = result ? `${typeof window !== 'undefined' ? window.location.origin : ''}/invoice/${result.token}` : '';

  function submit(e) {
    e.preventDefault();
    setErr('');
    const fd = new FormData(e.target);
    fd.set('amount', String(amount).replace(/\D/g, ''));
    fd.set('milestone', milestone);
    start(async () => {
      const r = await createManualInvoice(fd);
      if (r?.error) { setErr(r.error); return; }
      setResult(r); router.refresh();
    });
  }
  function kirimWA() {
    if (!result?.invoice_id) return;
    start(async () => {
      const r = await sendInvoiceWA(result.invoice_id);
      if (r?.error) { setErr(r.error); return; }
      setErr(''); alert('Invoice terkirim via WhatsApp.');
    });
  }

  return (
    <div>
      <button onClick={() => { setOpen(true); setResult(null); setErr(''); }}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg">
        + Invoice Manual
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-brand-700">Buat Invoice Manual</h2>
            <p className="text-xs text-slate-500 mb-3">Untuk tagihan di luar trip — mis. Visa Only, Asuransi, pengurusan dokumen.</p>

            {result ? (
              <div className="space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">✅ Invoice <b>{result.invoice_no}</b> dibuat.</div>
                <div className="text-xs break-all bg-slate-50 border border-slate-200 rounded p-2">{link}</div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => navigator.clipboard?.writeText(link)} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">Salin Link</button>
                  <a href={link} target="_blank" rel="noreferrer" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm text-center">Buka</a>
                  <button onClick={kirimWA} disabled={pending} className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">{pending ? '...' : 'Kirim WA'}</button>
                </div>
                {err && <p className="text-sm text-red-600">⚠ {err}</p>}
                <div className="flex justify-between pt-1">
                  <button onClick={() => { setResult(null); setAmount(''); }} className="text-xs text-brand-600 font-semibold">+ Buat lagi</button>
                  <button onClick={() => setOpen(false)} className="text-xs text-slate-500">Tutup</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600">Nama<input name="customer_name" required className={inp} /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-slate-600">No HP/WA<input name="customer_phone" placeholder="08.." className={inp} /></label>
                  <label className="block text-xs font-semibold text-slate-600">Email<input name="customer_email" type="email" className={inp} /></label>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-slate-600">Keperluan</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {PRESETS.map((p) => (
                      <button type="button" key={p} onClick={() => setMilestone(p === 'Lainnya' ? '' : p)}
                        className={`text-xs px-2 py-1 rounded-full border ${milestone === p ? 'bg-brand-500 text-white border-brand-500' : 'border-slate-300 text-slate-600'}`}>{p}</button>
                    ))}
                  </div>
                  <input value={milestone} onChange={(e) => setMilestone(e.target.value)} className={inp} placeholder="mis. Visa Only" />
                </div>
                <label className="block text-xs font-semibold text-slate-600">Deskripsi (opsional)<textarea name="description" rows="2" className={inp + ' resize-none'} placeholder="Detail layanan / catatan..." /></label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-semibold text-slate-600">Jumlah (IDR)<input value={amount ? ('Rp ' + fmt(amount)) : ''} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} required className={inp} placeholder="Rp 0" inputMode="numeric" /></label>
                  <label className="block text-xs font-semibold text-slate-600">Jatuh Tempo<input name="due_date" type="date" className={inp} /></label>
                </div>
                {err && <p className="text-sm text-red-600">⚠ {err}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setOpen(false)} className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm">Batal</button>
                  <button type="submit" disabled={pending} className="flex-1 px-3 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-bold disabled:opacity-50">{pending ? 'Membuat…' : 'Buat Invoice'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
