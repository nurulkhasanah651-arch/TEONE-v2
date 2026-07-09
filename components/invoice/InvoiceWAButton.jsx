'use client';

// Tombol Kirim WA dengan PREVIEW dulu (invoice / tanda terima) — finance cek sebelum kirim.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { previewInvoiceWA, sendInvoiceWA } from '@/lib/actions/invoices';
import WaManualModal from '@/components/wa/WaManualModal';

function linkify(text) {
  return String(text || '').split(/(https?:\/\/[^\s]+)/g).map((p, i) =>
    /^https?:\/\//.test(p)
      ? <a key={i} href={p} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">{p}</a>
      : p
  );
}

export default function InvoiceWAButton({ invoiceId, isPaid = false, className = '', label }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState(null); // {message, phone, customerName, invoiceNo, noPhone, isPaid}
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [waManual, setWaManual] = useState(null);

  // Modal WA manual ditutup manual oleh user; refresh ditunda ke onClose supaya
  // re-render pohon server tidak membuang state modal.
  function closeWaManual() {
    setWaManual(null);
    router.refresh();
  }

  const btnLabel = label || (isPaid ? '📤 Kirim Tanda Terima' : '📤 Kirim WA');

  async function openPreview() {
    setLoading(true); setErr('');
    const r = await previewInvoiceWA(invoiceId);
    setLoading(false);
    if (r?.error) { setErr(r.error); return; }
    setPreview(r);
  }
  function confirmSend() {
    setErr('');
    startTransition(async () => {
      const r = await sendInvoiceWA(invoiceId);
      if (r?.error) { setErr(r.error); return; }
      setPreview(null);
      if (r.wa_manual) {
        setWaManual({ message: r.wa_message, phone: r.wa_phone, name: r.customer_name });
        return; // refresh saat modal ditutup
      }
      router.refresh();
    });
  }

  return (
    <>
      <WaManualModal data={waManual} onClose={closeWaManual} title="Kirim invoice manual" />
      <button type="button" onClick={openPreview} disabled={loading || pending}
        className={className || 'px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg'}>
        {loading ? 'Memuat…' : btnLabel}
      </button>
      {err && !preview && <p className="text-xs text-red-700 mt-1">⚠ {err}</p>}

      {preview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !pending && setPreview(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b bg-gradient-to-r from-green-600 to-emerald-700 text-white flex items-center justify-between">
              <p className="font-bold">👀 Preview {preview.isPaid ? 'Tanda Terima' : 'Invoice'} — cek sebelum kirim</p>
              <button onClick={() => !pending && setPreview(null)} className="text-white/80 hover:text-white text-xl">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>👤 <b>{preview.customerName || '-'}</b></span>
                <span>🧾 {preview.invoiceNo}</span>
                <span>📞 {preview.phone || <span className="text-red-600 font-semibold">belum ada no HP</span>}</span>
              </div>
              {preview.noPhone && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">⚠ Peserta belum punya no HP — tidak bisa dikirim. Lengkapi dulu di Master Trip.</p>}
              <div className="bg-[#e5ddd5] rounded-lg p-3">
                <div className="bg-[#dcf8c6] rounded-lg p-3 text-[13px] text-slate-800 whitespace-pre-wrap leading-snug shadow-sm">{linkify(preview.message)}</div>
              </div>
              {err && <p className="text-xs text-red-700">⚠ {err}</p>}
            </div>
            <div className="px-5 py-3 border-t flex justify-end gap-2 bg-slate-50">
              <button onClick={() => setPreview(null)} disabled={pending} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50">Batal</button>
              <button onClick={confirmSend} disabled={pending || preview.noPhone} className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-bold disabled:opacity-50">{pending ? 'Mengirim…' : '✓ Konfirmasi & Kirim'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
