'use client';
// Sel kolom "Peserta Dibawa" di Master TL: tampilkan jumlah, klik -> modal daftar
// peserta + link bukti foto (untuk dicek tim internal).
import { useState } from 'react';

function fmtD(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; }
}

export default function ReferralProofCell({ total = 0, month = 0, items = [] }) {
  const [open, setOpen] = useState(false);
  if (!total) return <span className="text-slate-300 text-xs">-</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex flex-col items-center hover:opacity-80">
        <span className="text-xs font-bold text-emerald-700 underline decoration-dotted">{total}</span>
        {month > 0 && <span className="text-[10px] text-emerald-600">{month} bln ini</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col text-left" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm">Peserta Dibawa ({total})</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none px-1">x</button>
            </div>
            <ul className="divide-y divide-slate-100 overflow-y-auto">
              {items.map((r, i) => (
                <li key={i} className="px-4 py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold text-slate-800">{r.participant_name}</span>
                    {r.trip_label && <span className="text-slate-500"> - {r.trip_label}</span>}
                    <span className="block text-[10px] text-slate-400">{fmtD(r.created_at)}</span>
                  </span>
                  {r.proof_url
                    ? <a href={r.proof_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline shrink-0">Lihat bukti</a>
                    : <span className="text-[10px] text-slate-300 shrink-0">tanpa bukti</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
