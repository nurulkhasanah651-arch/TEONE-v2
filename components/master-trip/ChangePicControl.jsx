'use client';

// Ganti PIC master trip — bisa dipakai owner/manager/accounting/cs/pic (pic: trip sendiri).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeTripPic } from '@/app/(app)/trips/actions';

export default function ChangePicControl({ tripId, currentPic = '', currentEmail = '', employees = [] }) {
  const router = useRouter();
  const [email, setEmail] = useState(currentEmail || '');
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState('');

  function save() {
    setMsg('');
    const emp = employees.find((e) => (e.email || '') === email);
    const picName = emp ? (emp.full_name || emp.email) : (currentPic || '');
    startTransition(async () => {
      const r = await changeTripPic(tripId, picName, email || null);
      if (r?.error) { setMsg('❌ ' + r.error); return; }
      setMsg('✅ PIC berhasil diganti ke ' + (picName || '—'));
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-card p-4">
      <p className="text-sm font-bold text-indigo-700 mb-1">Ganti PIC Trip</p>
      <p className="text-xs text-slate-500 mb-2">PIC saat ini: <b>{currentPic || '—'}</b>{currentEmail ? ` (${currentEmail})` : ''}</p>
      <div className="flex gap-2 flex-wrap items-center">
        <select value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 min-w-[200px] text-sm px-2 py-1.5 border border-slate-300 rounded">
          <option value="">— Pilih PIC —</option>
          {employees.map((e) => <option key={e.id || e.email} value={e.email}>{e.full_name || e.email}{e.role ? ` · ${e.role}` : ''}</option>)}
        </select>
        <button onClick={save} disabled={pending || !email} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded disabled:opacity-50">{pending ? 'Menyimpan…' : 'Ganti PIC'}</button>
      </div>
      {msg && <p className="text-xs mt-2 text-slate-700">{msg}</p>}
    </div>
  );
}
