'use client';

// Round 93: Form upload bukti transfer (public, di /invoice/[token])

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { uploadPaymentProof } from '@/lib/actions/invoices';

function fmtRupiah(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseRupiah(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9]/g, '');
}

export default function PaymentProofForm({ token, expectedAmount }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState(String(expectedAmount || ''));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofFileName, setProofFileName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleFileUpload(file) {
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${token}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('payment-proofs').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (error) {
        setUploadError('Upload gagal: ' + error.message);
        setUploading(false);
        return;
      }
      const { data: pub } = supabase.storage.from('payment-proofs').getPublicUrl(path);
      setProofUrl(pub.publicUrl);
      setProofFileName(file.name);
    } catch (e) {
      setUploadError('Upload error: ' + (e?.message || 'unknown'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!amount) { alert('Isi jumlah dulu'); return; }
    if (!proofUrl) { alert('Upload bukti transfer dulu'); return; }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('amount', amount);
      fd.set('payment_date', paymentDate);
      fd.set('payment_method', paymentMethod);
      fd.set('note', note);
      fd.set('proof_url', proofUrl);
      fd.set('proof_file_name', proofFileName);

      const r = await uploadPaymentProof(token, fd);
      if (r?.error) {
        alert('Error: ' + r.error);
        return;
      }
      setSuccess(true);
      setShowForm(false);
      router.refresh();
    });
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
        <p className="font-bold text-green-800">✓ Bukti pembayaran terkirim</p>
        <p className="text-xs text-green-700 mt-1">Tim kami akan verifikasi dalam 1×24 jam. Notifikasi via WhatsApp.</p>
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg shadow"
      >
        💵 Saya Sudah Bayar — Upload Bukti Transfer
      </button>
    );
  }

  return (
    <div className="border border-green-300 rounded-lg p-4 bg-green-50/40 space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm font-bold text-green-800">Upload Bukti Transfer</p>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Batal
        </button>
      </div>

      <div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 block mb-1">Jumlah yang Ditransfer (Rp)</span>
          <input autoComplete="off"
            type="text"
            inputMode="numeric"
            value={fmtRupiah(amount)}
            onChange={(e) => setAmount(parseRupiah(e.target.value))}
            placeholder="0"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 block mb-1">Tanggal Transfer</span>
          <input autoComplete="off"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 block mb-1">Metode</span>
          <select
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          >
            <option value="transfer">Transfer Bank</option>
            <option value="qris">QRIS</option>
            <option value="cash">Cash / Tunai</option>
            <option value="other">Lainnya</option>
          </select>
        </label>
      </div>

      <div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 block mb-1">Bukti Transfer (foto/screenshot)</span>
          <input autoComplete="off"
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => handleFileUpload(e.target.files?.[0])}
            disabled={uploading}
            className="w-full text-sm border border-slate-300 rounded p-2 bg-white"
          />
          {uploading && <p className="text-xs text-blue-700 mt-1">⏳ Uploading...</p>}
          {uploadError && <p className="text-xs text-red-700 mt-1">{uploadError}</p>}
          {proofUrl && <p className="text-xs text-green-700 mt-1">✓ {proofFileName}</p>}
          <p className="text-[10px] text-slate-500 mt-1">Max 10MB. Foto JPG/PNG atau PDF.</p>
        </label>
      </div>

      <div>
        <label className="block">
          <span className="text-xs font-semibold text-slate-700 block mb-1">Catatan (Opsional)</span>
          <input autoComplete="off"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Misal: transfer dari rekening atas nama..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={pending || uploading || !amount || !proofUrl}
        className="w-full py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold text-sm rounded-lg"
      >
        {pending ? 'Mengirim...' : '📨 Kirim Bukti Pembayaran'}
      </button>
    </div>
  );
}
