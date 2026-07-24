'use client';

// Panel reset password karyawan (OWNER only). Owner set password sementara utk karyawan
// yang lupa (email tidak aktif). Panggil resetEmployeePassword (Admin API service role).
// Path: components/hr/ResetPasswordPanel.jsx

import { useState, useTransition } from 'react';
import { resetEmployeePassword } from '@/lib/actions/hr';

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function ResetPasswordPanel({ employeeId, email }) {
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null); // { type, text }
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (pw.trim().length < 8) { setMsg({ type: 'err', text: 'Password minimal 8 karakter.' }); return; }
    if (!confirm('Reset password login karyawan ini? Password lama langsung tidak berlaku.')) return;
    start(async () => {
      const r = await resetEmployeePassword(employeeId, pw.trim());
      if (r?.error) { setMsg({ type: 'err', text: r.error }); return; }
      setMsg({ type: 'ok', text: `Password untuk ${r.email} berhasil direset. Kirimkan password ini ke karyawan — dia bisa langsung login & ganti sendiri lewat menu Ganti Password.` });
    });
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <h2 className="text-lg font-bold text-slate-800">🔑 Reset Password Login</h2>
      <p className="mt-1 text-sm text-slate-600">
        Set password sementara untuk karyawan yang lupa password{email ? <> (akun: <span className="font-medium">{email}</span>)</> : ''}.
        Password lama langsung tidak berlaku.
      </p>

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={pw}
          onChange={(e) => { setPw(e.target.value); setCopied(false); }}
          placeholder="Password baru (min 8 karakter)"
          className="flex-1 min-w-[220px] px-3 py-2 border border-slate-300 rounded text-sm font-mono"
        />
        <button
          type="button"
          onClick={() => { setPw(genPassword()); setCopied(false); setMsg(null); }}
          className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
        >
          🎲 Buatkan
        </button>
        {pw && (
          <button
            type="button"
            onClick={() => { navigator.clipboard?.writeText(pw); setCopied(true); }}
            className="px-3 py-2 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
          >
            {copied ? '✓ Tersalin' : '📋 Salin'}
          </button>
        )}
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 rounded bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          {pending ? 'Mereset…' : 'Reset Password'}
        </button>
      </form>

      {msg && (
        <div className={`mt-3 text-sm rounded px-3 py-2 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
