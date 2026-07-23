'use client';

// Ganti password sendiri — semua karyawan (login email+password) bisa ganti password
// login mereka sendiri, tanpa perlu owner. Pakai Supabase auth.updateUser({ password }).
// Path: app/(app)/ganti-password/page.jsx

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function GantiPasswordPage() {
  const supabase = createClient();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) { setMsg({ type: 'err', text: 'Password minimal 8 karakter.' }); return; }
    if (pw !== pw2) { setMsg({ type: 'err', text: 'Konfirmasi password tidak sama.' }); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) { setMsg({ type: 'err', text: error.message || 'Gagal ganti password.' }); return; }
    setPw(''); setPw2('');
    setMsg({ type: 'ok', text: 'Password berhasil diganti. Password baru langsung berlaku untuk login berikutnya.' });
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-brand-700">🔑 Ganti Password</h1>
        <p className="mt-1 text-sm text-slate-600">Ubah password login akunmu sendiri. Tidak perlu minta owner.</p>
      </div>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Password Baru</label>
          <input
            type={show ? 'text' : 'password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Minimal 8 karakter"
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Ulangi Password Baru</label>
          <input
            type={show ? 'text' : 'password'}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Ketik ulang password baru"
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Tampilkan password
        </label>

        {msg && (
          <div className={`text-sm rounded px-3 py-2 ${msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            {msg.text}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Menyimpan…' : 'Simpan Password Baru'}
        </button>
      </form>

      <p className="mt-3 text-xs text-slate-400">
        Catatan: fitur ini untuk staf yang login pakai email &amp; password. Tour Leader/Mitra yang login via Google mengatur password lewat akun Google-nya.
      </p>
    </div>
  );
}
