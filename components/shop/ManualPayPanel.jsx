'use client';
import { useState } from 'react';
import { uploadStorefrontImage } from '@/lib/actions/shop-admin';

function fmtRp(n){return 'Rp '+Number(n||0).toLocaleString('id-ID');}

export default function ManualPayPanel({ booking, bank, accounts, waNumber, milestoneType, total }) {
  const [bukti, setBukti] = useState('');
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState('');

  // Daftar rekening (bisa >1) dari DB brand; fallback ke shape lama {nama,norek,an}.
  const bankList = (Array.isArray(accounts) && accounts.length)
    ? accounts
    : (bank?.norek ? [{ bank_name: bank.nama, account_no: bank.norek, account_name: bank.an }] : []);

  async function upload(file) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.set('file', file); fd.set('tripId', String(booking.trip_id));
    const r = await uploadStorefrontImage(fd);
    setUploading(false);
    if (r?.url) setBukti(r.url);
  }
  function copy(v) { try { navigator.clipboard.writeText(v); setCopied(v); setTimeout(()=>setCopied(''),1500); } catch {} }

  const waText = encodeURIComponent(
    `Halo, saya mau konfirmasi pembayaran TRANSFER:\nOrder: ${booking.order_code}\nTermin: ${milestoneType}\nNominal: ${fmtRp(total)}\nAtas nama: ${booking.lead_name || ''}` +
    (bukti ? `\nBukti: ${bukti}` : '\n(bukti transfer saya kirim di chat ini)')
  );

  return (
    <div className="border border-slate-200 rounded-2xl p-4 space-y-3">
      <p className="font-bold text-slate-800">🏦 Transfer Manual</p>
      <div className="bg-slate-50 rounded-xl p-3 text-sm space-y-2">
        {bankList.length > 1 && <p className="text-[11px] font-semibold text-slate-500">Pilih salah satu rekening:</p>}
        {bankList.map((a, i) => (
          <div key={i} className={i > 0 ? 'pt-2 border-t border-slate-200' : ''}>
            <div className="flex items-center justify-between"><span className="text-slate-500">Bank</span><span className="font-bold">{a.bank_name || '-'}</span></div>
            <div className="flex items-center justify-between mt-1 gap-2"><span className="text-slate-500">No. Rekening</span>
              <span className="flex items-center gap-2">
                <span className="font-bold tracking-wider text-slate-900">{a.account_no || '-'}</span>
                <button type="button" onClick={()=>copy(a.account_no||'')}
                  className={`shrink-0 px-2 py-1 rounded-lg text-[11px] font-bold border ${copied===a.account_no ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                  {copied===a.account_no ? '✓ Tersalin' : '📋 Salin'}
                </button>
              </span></div>
            <div className="flex items-center justify-between mt-1"><span className="text-slate-500">a.n.</span><span className="font-semibold text-right">{a.account_name || '-'}</span></div>
          </div>
        ))}
        <div className="flex items-center justify-between mt-1 pt-1 border-t border-slate-200"><span className="text-slate-500">Nominal transfer</span><span className="font-extrabold text-slate-900">{fmtRp(total)}</span></div>
      </div>
      <div>
        <label className="inline-block px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer">
          {uploading ? 'Mengunggah…' : (bukti ? '✓ Ganti bukti' : '📷 Upload bukti transfer')}
          <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e)=>{upload(e.target.files?.[0]); e.target.value='';}} />
        </label>
        {bukti && <a href={bukti} target="_blank" rel="noreferrer" className="ml-2 text-xs text-emerald-600 underline">lihat bukti</a>}
      </div>
      <a href={`https://wa.me/${waNumber}?text=${waText}`} target="_blank" rel="noreferrer"
        className="block text-center w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold">
        Konfirmasi via WhatsApp
      </a>
      <p className="text-[11px] text-center text-slate-400">Transfer manual tanpa biaya admin. Pembayaran dicatat admin setelah verifikasi.</p>
    </div>
  );
}
