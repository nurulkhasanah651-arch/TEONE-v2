'use client';

// Box "Transfer Bank Manual" di halaman /order/[id].
// Tampil: nominal, rekening (BCA) + tombol salin no rek, lalu form upload bukti transfer.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { compressImage } from '@/lib/utils/compress-image';
import { submitManualTransfer } from '@/lib/actions/shop-manual-transfer';

function fmtRp(n) { return 'Rp ' + Number(n || 0).toLocaleString('id-ID'); }

export default function ManualTransferBox({ bookingId, amount = 0, bank = {} }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copiedNo, setCopiedNo] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [proofName, setProofName] = useState('');
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [done, setDone] = useState(false);

  // Daftar rekening (bisa lebih dari satu). Fallback ke kolom tunggal utk kompat lama.
  const accounts = (Array.isArray(bank.accounts) && bank.accounts.length)
    ? bank.accounts
    : (bank.bank_account_no ? [{ bank_name: bank.bank_name, account_no: bank.bank_account_no, account_name: bank.bank_account_name }] : []);

  async function copyRek(no) {
    try {
      await navigator.clipboard.writeText(String(no).replace(/\s/g, ''));
      setCopiedNo(no);
      setTimeout(() => setCopiedNo(''), 1800);
    } catch {
      alert('Nomor rekening: ' + no);
    }
  }

  async function handleFile(rawFile) {
    if (!rawFile) return;
    const file = await compressImage(rawFile);
    if (!file) return;
    setUploadError('');
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `order/${bookingId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('payment-proofs').upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) { setUploadError('Upload gagal: ' + error.message); return; }
      const { data: pub } = supabase.storage.from('payment-proofs').getPublicUrl(path);
      setProofUrl(pub.publicUrl);
      setProofName(file.name);
    } catch (e) {
      setUploadError('Upload error: ' + (e?.message || 'unknown'));
    } finally { setUploading(false); }
  }

  function submit() {
    if (!proofUrl) { alert('Upload bukti transfer dulu ya'); return; }
    startTransition(async () => {
      const fd = new FormData();
      fd.set('proof_url', proofUrl);
      fd.set('proof_file_name', proofName);
      fd.set('note', note);
      const r = await submitManualTransfer(bookingId, fd);
      if (r?.error) { alert('Error: ' + r.error); return; }
      setDone(true);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
        <p className="text-2xl mb-1">⏳</p>
        <p className="font-bold text-amber-800">Bukti transfer terkirim</p>
        <p className="text-xs text-amber-700 mt-1">Tim finance akan memverifikasi dalam 1×24 jam. Status & konfirmasi dikirim via WhatsApp 🙏</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-extrabold text-slate-800">🏦 Transfer Bank Manual</p>
      {/* Nominal */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs text-slate-500">Nominal yang ditransfer</p>
        <p className="text-2xl font-extrabold text-slate-900">{fmtRp(amount)}</p>
        <p className="text-[11px] text-slate-500 mt-1">Mohon transfer sesuai nominal di atas agar mudah diverifikasi.</p>
      </div>

      {/* Rekening (bisa lebih dari satu — pilih salah satu) */}
      <div className="border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Transfer ke rekening{accounts.length > 1 ? ' (pilih salah satu)' : ''}</p>
        {accounts.length === 0 && <p className="text-sm text-slate-400">—</p>}
        {accounts.map((a, i) => {
          const no = a.account_no || '';
          return (
            <div key={i} className={`flex items-center gap-2 ${i > 0 ? 'pt-3 border-t border-slate-100' : ''}`}>
              <div className="w-14 h-8 shrink-0 rounded bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center text-center leading-tight px-0.5">{a.bank_name || 'BCA'}</div>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-extrabold tracking-wider text-slate-900 leading-tight">{no || '—'}</p>
                <p className="text-xs text-slate-600">a.n. {a.account_name || '—'}</p>
              </div>
              <button type="button" onClick={() => copyRek(no)}
                className={`shrink-0 px-3 py-2 rounded-lg text-xs font-bold border ${copiedNo === no && no ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                {copiedNo === no && no ? '✓ Tersalin' : '📋 Salin'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Upload bukti */}
      <div className="border border-emerald-300 rounded-xl p-4 bg-emerald-50/40 space-y-3">
        <p className="text-sm font-bold text-emerald-800">Upload Bukti Transfer</p>
        <input autoComplete="off" type="file" accept="image/*,.pdf"
          onChange={(e) => handleFile(e.target.files?.[0])} disabled={uploading}
          className="w-full text-sm border border-slate-300 rounded p-2 bg-white" />
        {uploading && <p className="text-xs text-blue-700">⏳ Uploading...</p>}
        {uploadError && <p className="text-xs text-red-700">{uploadError}</p>}
        {proofUrl && <p className="text-xs text-emerald-700">✓ {proofName}</p>}
        <input autoComplete="off" type="text" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Catatan (opsional): transfer a.n. ..."
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white" />
        <button type="button" onClick={submit} disabled={pending || uploading || !proofUrl}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm">
          {pending ? 'Mengirim...' : '📨 Kirim Bukti Transfer'}
        </button>
        <p className="text-[10px] text-center text-slate-500">Max 10MB. Foto JPG/PNG atau PDF.</p>
      </div>
    </div>
  );
}
