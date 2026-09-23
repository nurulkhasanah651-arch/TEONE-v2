'use client';

// Tombol admin: buatkan / kirim ulang akses akun peserta.
// Buat akun kalau belum ada, generate link atur-password, kirim via WhatsApp,
// dan tampilkan link supaya bisa di-copy manual. Password diatur peserta sendiri.
// Path: components/trips/PesertaAccessButton.jsx

import { useState } from 'react';
import { sendPesertaAccessLink } from '@/lib/actions/peserta-auth';

export default function PesertaAccessButton({ customerId, name = '', phone = '', email = '', hasAccount = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [emailInput, setEmailInput] = useState(email || '');
  const [needEmail, setNeedEmail] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  if (!customerId) return null;

  async function send() {
    setBusy(true); setErr(''); setCopied(false);
    try {
      const r = await sendPesertaAccessLink({ customerId, email: emailInput.trim(), channel: 'wa' });
      if (r?.needEmail || r?.error === 'need_email') {
        setNeedEmail(true);
        setErr(r?.error === 'need_email' ? 'Peserta ini belum punya email. Isi email dulu untuk buat akun.' : (r?.error || ''));
        setBusy(false);
        return;
      }
      if (r?.error) { setErr(r.error); setBusy(false); return; }
      setResult(r);
      setNeedEmail(false);
    } catch (e) {
      setErr('Terjadi kesalahan. Coba lagi.');
    }
    setBusy(false);
  }

  function copyLink() {
    if (!result?.link) return;
    try {
      navigator.clipboard.writeText(result.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  function close() {
    setOpen(false); setErr(''); setResult(null); setNeedEmail(false); setCopied(false);
    setEmailInput(email || '');
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded bg-sky-100 hover:bg-sky-200 text-sky-800 font-bold"
        title="Buatkan / kirim ulang akses login akun peserta"
      >
        🔑 {hasAccount ? 'Reset Password' : 'Akses Akun'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-lg">🔑 Akses Akun Peserta</h3>
                <p className="text-sm text-slate-500 mt-0.5">{name || 'Peserta'}{phone ? ` · ${phone}` : ''}</p>
              </div>
              <button onClick={close} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {!result ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-600">
                  Sistem akan membuatkan akun (kalau belum ada) dan mengirim <b>link atur password</b> ke WhatsApp peserta.
                  Peserta klik link lalu buat password sendiri.
                </p>

                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Email akun {needEmail && <span className="text-red-500">*</span>}</span>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="email@peserta.com"
                    className="w-full mt-1 px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-100 outline-none"
                  />
                  <span className="text-[11px] text-slate-400 block mt-1">
                    {email ? 'Email sudah terdaftar — bisa diganti kalau perlu.' : 'Peserta belum punya email. Wajib diisi untuk membuat akun (boleh email keluarga).'}
                  </span>
                </label>

                {!phone && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-800">
                    ⚠ Peserta ini tidak punya No HP, jadi link tidak bisa dikirim via WA. Link tetap akan ditampilkan untuk kamu copy manual.
                  </div>
                )}

                {err && <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-sm text-red-700">⚠ {err}</div>}

                <button
                  onClick={send}
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold"
                >
                  {busy ? 'Memproses…' : (phone ? '📲 Buat & Kirim Link via WA' : '🔗 Buat Link')}
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
                  {result.waSent
                    ? <>✓ Link atur password sudah dikirim ke WhatsApp <b>{result.phone}</b>.</>
                    : <>✓ Akun siap. {result.phone ? 'Pengiriman WA gagal — ' : 'Peserta tanpa No HP — '}silakan copy link di bawah dan kirim manual.</>}
                  {result.created ? <div className="text-[11px] mt-1 opacity-80">Akun baru dibuat untuk email {result.email}.</div>
                    : <div className="text-[11px] mt-1 opacity-80">Akun sudah ada ({result.email}) — link reset password dikirim.</div>}
                  {result.waErr ? <div className="text-[11px] mt-1 text-amber-700">Catatan WA: {result.waErr}</div> : null}
                </div>

                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Link atur password (bisa di-copy)</span>
                  <div className="flex gap-2 mt-1">
                    <input readOnly value={result.link} className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs bg-slate-50 outline-none" />
                    <button onClick={copyLink} className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap">
                      {copied ? '✓ Tersalin' : 'Copy'}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-1">Login peserta: email <b>{result.email}</b>. Link berlaku terbatas.</span>
                </label>

                <button onClick={close} className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-600 font-semibold hover:bg-slate-50">
                  Selesai
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
