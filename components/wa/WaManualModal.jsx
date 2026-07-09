'use client';

// Modal template WA untuk PIC yang nomornya belum tersambung (employees.wa_manual).
// Dipakai di semua alur approval pembayaran & generate invoice.
import { useState, useEffect } from 'react';

export default function WaManualModal({ data, onClose, title = 'Kirim WA manual' }) {
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Tutup HANYA lewat tombol (atau Esc). Modal tidak boleh hilang sendiri —
  // isinya template yang harus disalin PIC.
  useEffect(() => {
    if (!data) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, onClose]);

  if (!data) return null;

  const phone = data.phone || '';
  const message = data.message || '';
  const waLink = phone
    ? `https://wa.me/${String(phone).replace(/[^0-9]/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(message)}`
    : null;

  async function copy(text, setter) {
    try { await navigator.clipboard.writeText(text); setter(true); }
    catch { setter(false); alert('Gagal menyalin — blok teksnya lalu Ctrl+C'); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-lg w-full shadow-xl">
        <div className="px-5 py-3 border-b border-slate-200 flex items-start justify-between gap-3">
          <h3 className="font-bold text-brand-700">✅ {title}</h3>
          <button type="button" onClick={onClose} aria-label="Tutup"
            className="shrink-0 text-slate-400 hover:text-slate-700 text-xl leading-none">×</button>
        </div>
        <div className="px-5 pt-2">
          <p className="text-xs text-slate-500">
            Nomor WA PIC trip ini belum tersambung, jadi pesan tidak dikirim otomatis.
            Salin nomor & pesan di bawah, lalu kirim manual ke peserta.
            <span className="block mt-1 font-semibold text-amber-700">
              Jendela ini tidak akan tertutup sendiri — klik “Selesai &amp; tutup” kalau sudah dikirim.
            </span>
          </p>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Nomor peserta</p>
              <p className="font-mono text-sm font-bold text-slate-800 truncate">{phone || '— belum ada nomor —'}</p>
              {data.name && <p className="text-xs text-slate-500 truncate">{data.name}</p>}
            </div>
            {phone && (
              <button type="button" onClick={() => copy(phone, setCopiedPhone)}
                className="shrink-0 px-2.5 py-1 text-[11px] font-bold rounded bg-slate-200 hover:bg-slate-300 text-slate-800">
                {copiedPhone ? '✓ Tersalin' : '📋 Salin nomor'}
              </button>
            )}
          </div>

          <textarea readOnly value={message} rows={12}
            className="w-full text-xs font-mono border border-slate-300 rounded-lg p-3 bg-slate-50"
            onFocus={(e) => e.target.select()} />

          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => copy(message, setCopiedMsg)}
              className="px-3 py-1.5 text-xs font-bold rounded bg-brand-600 hover:bg-brand-700 text-white">
              {copiedMsg ? '✓ Tersalin' : '📋 Salin pesan'}
            </button>
            {waLink && (
              <a href={waLink} target="_blank" rel="noreferrer"
                className="px-3 py-1.5 text-xs font-bold rounded bg-green-600 hover:bg-green-700 text-white">
                💬 Buka WhatsApp
              </a>
            )}
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 text-xs font-bold rounded bg-slate-800 hover:bg-slate-900 text-white ml-auto">
              Selesai &amp; tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
