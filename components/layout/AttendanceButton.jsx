'use client';

// Tombol absensi ringkas di header — check-in/out + lihat status hari ini (data sendiri saja)
// Path: components/layout/AttendanceButton.jsx

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getMyAttendanceToday, clockIn, clockOut } from '@/lib/actions/attendance';

function hhmm(iso) {
  if (!iso) return '--:--';
  // simpan dalam WIB-shifted ISO, ambil jam:menit
  return String(iso).slice(11, 16);
}

export default function AttendanceButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [data, setData] = useState(null); // { attendance, today }
  const boxRef = useRef(null);

  async function load() {
    setLoading(true);
    const r = await getMyAttendanceToday();
    if (r?.ok) setData(r);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    function onClick(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const att = data?.attendance;
  const checkedIn = !!att?.clock_in;
  const checkedOut = !!att?.clock_out;

  async function doIn() {
    setBusy(true); setMsg('');
    const r = await clockIn();
    setBusy(false);
    if (r?.error) { setMsg(r.error); return; }
    setMsg(`Check-in ${r.time}${r.late > 0 ? ` (telat ${r.late} mnt)` : ''}`);
    await load(); router.refresh();
  }
  async function doOut() {
    setBusy(true); setMsg('');
    const r = await clockOut();
    setBusy(false);
    if (r?.error) { setMsg(r.error); return; }
    setMsg(`Check-out ${r.time}`);
    await load(); router.refresh();
  }

  // warna titik status
  const dot = !checkedIn ? 'bg-slate-300' : checkedOut ? 'bg-slate-400' : 'bg-green-500';
  const pillLabel = loading ? '…' : !checkedIn ? 'Absen' : checkedOut ? 'Selesai' : hhmm(att.clock_in);

  return (
    <div className="relative" ref={boxRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Absensi"
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-600"
      >
        <span className="text-base leading-none">🕐</span>
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="text-xs font-semibold hidden sm:inline">{pillLabel}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-lg shadow-lg z-30 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Absensi Hari Ini</p>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg bg-slate-50 p-2 text-center">
              <p className="text-[10px] text-slate-500">Masuk</p>
              <p className="text-sm font-bold text-slate-700">{checkedIn ? hhmm(att.clock_in) : '--:--'}</p>
              {att?.late_minutes > 0 && <p className="text-[9px] text-amber-600">telat {att.late_minutes}m</p>}
            </div>
            <div className="rounded-lg bg-slate-50 p-2 text-center">
              <p className="text-[10px] text-slate-500">Keluar</p>
              <p className="text-sm font-bold text-slate-700">{checkedOut ? hhmm(att.clock_out) : '--:--'}</p>
              {att?.overtime_hours > 0 && <p className="text-[9px] text-blue-600">lembur {att.overtime_hours}j</p>}
            </div>
          </div>

          {!checkedIn && (
            <button onClick={doIn} disabled={busy}
              className="w-full py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-60">
              {busy ? '...' : '🟢 Check In'}
            </button>
          )}
          {checkedIn && !checkedOut && (
            <button onClick={doOut} disabled={busy}
              className="w-full py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold disabled:opacity-60">
              {busy ? '...' : '🔴 Check Out'}
            </button>
          )}
          {checkedIn && checkedOut && (
            <p className="text-center text-xs text-slate-500 py-1">✓ Absensi hari ini selesai</p>
          )}

          {msg && <p className="mt-2 text-[11px] text-center text-brand-700">{msg}</p>}
          <p className="mt-2 text-[10px] text-slate-400 text-center">Jam kerja 09:00–17:00</p>
        </div>
      )}
    </div>
  );
}
