'use client';

// Tombol melayang "Lapor" — muncul di semua halaman untuk SEMUA user yang login
// (staf, tour leader, mitra). Kirim bug/error/request fitur → masuk tab IT.
// Path: components/it/BugReportLauncher.jsx

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { submitItReport } from '@/lib/actions/it-reports';

const TYPES = [
  { key: 'bug', label: '🐞 Bug / masalah', hint: 'Ada yang error / tidak jalan' },
  { key: 'error', label: '⚠️ Error muncul', hint: 'Muncul pesan error di layar' },
  { key: 'feature', label: '💡 Request fitur', hint: 'Usulan fitur / perbaikan' },
];

export default function BugReportLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('bug');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  function reset() { setType('bug'); setMessage(''); setDone(false); setMsg(''); }
  function close() { setOpen(false); setTimeout(reset, 200); }

  function submit(e) {
    e?.preventDefault();
    if (!message.trim()) { setMsg('⚠ Isi dulu laporannya ya'); return; }
    setMsg('');
    start(async () => {
      const r = await submitItReport({ type, message, pagePath: pathname });
      if (r?.error) { setMsg('⚠ ' + r.error); return; }
      setDone(true);
    });
  }

  return (
    <>
      {/* Tombol melayang */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Lapor bug / error / request fitur"
        className="fixed z-40 bottom-4 right-4 flex items-center gap-2 px-4 py-2.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold shadow-lg shadow-brand-900/20 transition-colors"
      >
        <span className="text-base leading-none">🛟</span>
        <span className="hidden sm:inline">Lapor</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/40" onClick={close}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-brand-50">
              <h2 className="font-bold text-brand-700">🛟 Lapor ke Tim IT</h2>
              <button onClick={close} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
            </div>

            {done ? (
              <div className="p-8 text-center">
                <p className="text-4xl mb-2">✅</p>
                <p className="font-bold text-slate-800">Laporan terkirim!</p>
                <p className="text-sm text-slate-500 mt-1">Terima kasih. Tim IT akan menindaklanjuti.</p>
                <div className="mt-4 flex justify-center gap-2">
                  <button onClick={reset} className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">Lapor lagi</button>
                  <button onClick={close} className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-600 hover:bg-brand-700 text-white">Tutup</button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="p-5 space-y-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Jenis laporan</label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {TYPES.map((t) => (
                      <button key={t.key} type="button" onClick={() => setType(t.key)}
                        className={`text-left px-3 py-2 rounded-lg border text-sm transition ${type === t.key ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <span className="font-semibold text-slate-800">{t.label}</span>
                        <span className="block text-[11px] text-slate-500">{t.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Ceritakan detailnya</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    maxLength={5000}
                    placeholder="Contoh: pas klik tombol simpan di halaman Finance, muncul error merah. / Minta tolong tambah kolom tanggal di ..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Halaman ini ({pathname}) & akun kamu otomatis ikut terkirim — tak perlu ditulis.</p>
                </div>

                {msg && <p className="text-xs text-rose-600">{msg}</p>}

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={close} className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700">Batal</button>
                  <button type="submit" disabled={pending} className="px-4 py-2 text-sm font-bold rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60">
                    {pending ? 'Mengirim…' : 'Kirim Laporan'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
