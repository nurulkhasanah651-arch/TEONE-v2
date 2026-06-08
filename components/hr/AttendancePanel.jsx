'use client';

// Absensi: tombol Masuk/Pulang + rekap kehadiran bulan
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clockIn, clockOut } from '@/lib/actions/attendance';

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const STATUS_UI = {
  hadir: { label: 'Hadir', cls: 'bg-green-100 text-green-700' },
  telat: { label: 'Telat', cls: 'bg-amber-100 text-amber-700' },
  izin:  { label: 'Izin',  cls: 'bg-blue-100 text-blue-700' },
  sakit: { label: 'Sakit', cls: 'bg-purple-100 text-purple-700' },
  alpha: { label: 'Alpha', cls: 'bg-red-100 text-red-700' },
};
function jam(iso) { return iso ? new Date(iso).toISOString().slice(11, 16) : '—'; }
function tgl(d) { const x = new Date(d + 'T00:00:00'); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; }

export default function AttendancePanel({ mine, rows, isAdmin, year, month }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);

  const att = mine?.attendance;
  const hasIn = Boolean(att?.clock_in);
  const hasOut = Boolean(att?.clock_out);

  function doClockIn() {
    setMsg(null);
    startTransition(async () => {
      const r = await clockIn();
      if (r?.error) { setMsg({ type: 'error', text: r.error }); return; }
      setMsg({ type: 'ok', text: `Check-in ${r.time}${r.late > 0 ? ` · telat ${r.late} mnt` : ' · tepat waktu'}` });
      router.refresh();
    });
  }
  function doClockOut() {
    setMsg(null);
    startTransition(async () => {
      const r = await clockOut();
      if (r?.error) { setMsg({ type: 'error', text: r.error }); return; }
      setMsg({ type: 'ok', text: `Check-out ${r.time} · kerja ${r.workHours} jam${r.overtime > 0 ? ` · lembur ${r.overtime} jam` : ''}` });
      router.refresh();
    });
  }

  function gotoMonth(delta) {
    let y = year, m = month + delta;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    router.push(`/hr/attendance?y=${y}&m=${m}`);
  }

  // ringkasan bulan
  const totalHadir = rows.filter((r) => r.status === 'hadir' || r.status === 'telat').length;
  const totalTelat = rows.filter((r) => r.status === 'telat').length;
  const totalLembur = rows.reduce((s, r) => s + Number(r.overtime_hours || 0), 0);

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`px-4 py-2 rounded text-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {msg.text}
        </div>
      )}

      {/* Kartu absen saya hari ini */}
      <div className="bg-white rounded-xl border-2 border-brand-200 overflow-hidden">
        <div className="px-5 py-3 bg-brand-50 border-b border-brand-200">
          <h2 className="font-bold text-brand-800">Absen Saya Hari Ini {mine?.employee?.name ? `· ${mine.employee.name}` : ''}</h2>
        </div>
        <div className="p-5 flex flex-wrap items-center gap-4">
          <div className="flex gap-6">
            <div><p className="text-[11px] text-slate-500 uppercase font-bold">Masuk</p><p className="text-xl font-bold text-slate-800">{jam(att?.clock_in)}</p></div>
            <div><p className="text-[11px] text-slate-500 uppercase font-bold">Pulang</p><p className="text-xl font-bold text-slate-800">{jam(att?.clock_out)}</p></div>
            {att?.status && <div><p className="text-[11px] text-slate-500 uppercase font-bold">Status</p><span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_UI[att.status]?.cls || 'bg-slate-100'}`}>{STATUS_UI[att.status]?.label || att.status}{att.late_minutes > 0 ? ` (${att.late_minutes}m)` : ''}</span></div>}
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={doClockIn} disabled={pending || hasIn}
              className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-bold rounded-lg">
              🟢 Masuk
            </button>
            <button onClick={doClockOut} disabled={pending || !hasIn || hasOut}
              className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-sm font-bold rounded-lg">
              🔴 Pulang
            </button>
          </div>
        </div>
      </div>

      {/* Rekap bulan */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
          <h2 className="font-bold text-slate-700">{isAdmin ? 'Rekap Kehadiran Tim' : 'Riwayat Absen Saya'}</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => gotoMonth(-1)} className="px-2 py-1 text-sm rounded hover:bg-slate-100">‹</button>
            <span className="text-sm font-bold text-slate-600">{MONTHS[month - 1]} {year}</span>
            <button onClick={() => gotoMonth(1)} className="px-2 py-1 text-sm rounded hover:bg-slate-100">›</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-px bg-slate-100 text-center">
          <div className="bg-white p-3"><p className="text-[11px] text-slate-500 font-bold uppercase">Hadir</p><p className="text-lg font-bold text-green-700">{totalHadir}</p></div>
          <div className="bg-white p-3"><p className="text-[11px] text-slate-500 font-bold uppercase">Telat</p><p className="text-lg font-bold text-amber-700">{totalTelat}</p></div>
          <div className="bg-white p-3"><p className="text-[11px] text-slate-500 font-bold uppercase">Jam Lembur</p><p className="text-lg font-bold text-slate-800">{totalLembur}</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2">Tanggal</th>{isAdmin && <th className="px-2 py-2">Karyawan</th>}
              <th className="px-2 py-2">Masuk</th><th className="px-2 py-2">Pulang</th><th className="px-2 py-2">Status</th><th className="px-2 py-2">Jam</th><th className="px-2 py-2">Lembur</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-slate-400">Belum ada absensi bulan ini.</td></tr>
              ) : rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium">{tgl(r.date)}</td>
                  {isAdmin && <td className="px-2 py-2">{r.employees?.full_name || '—'}</td>}
                  <td className="px-2 py-2">{jam(r.clock_in)}</td>
                  <td className="px-2 py-2">{jam(r.clock_out)}</td>
                  <td className="px-2 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_UI[r.status]?.cls || 'bg-slate-100'}`}>{STATUS_UI[r.status]?.label || r.status}{r.late_minutes > 0 ? ` ${r.late_minutes}m` : ''}</span></td>
                  <td className="px-2 py-2">{r.work_hours || '—'}</td>
                  <td className="px-2 py-2">{r.overtime_hours || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
