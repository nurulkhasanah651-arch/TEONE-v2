'use client';

// Round 130: Pre-Departure Checklist untuk TL
// Path: components/tl/PreDepartureChecklist.jsx

import { useState, useTransition } from 'react';
import { toggleChecklistItem, saveChecklistNotes } from '@/lib/actions/tlreport';

const ITEMS = [
  { key: 'briefing_done', label: '📋 Briefing TL dengan Ops sudah dilakukan' },
  { key: 'documents_complete', label: '📑 Semua dokumen peserta lengkap (visa, passport, dll)' },
  { key: 'manifest_received', label: '📋 Manifest peserta sudah diterima' },
  { key: 'roomlist_received', label: '🛏 Roomlist sudah diterima' },
  { key: 'petty_cash_received', label: '💵 Petty cash sudah diterima dari Ops' },
  { key: 'emergency_contact_confirmed', label: '☎ Kontak emergency peserta + Ops sudah dikonfirmasi' },
  { key: 'flight_ticket_confirmed', label: '✈ Tiket pesawat + boarding pass siap' },
  { key: 'group_chat_created', label: '💬 Group chat WhatsApp peserta sudah dibuat' },
  { key: 'vouchers_received', label: '🎫 Voucher hotel/tour/transport sudah diterima' },
];

function fmtDate(s) {
  if (!s) return '';
  try { return new Date(s).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

export default function PreDepartureChecklist({ tripId, checklist = {}, canEdit = true, userEmail = '' }) {
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(checklist?.pre_departure_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  const completedCount = ITEMS.filter((item) => checklist[item.key]).length;
  const progress = ITEMS.length > 0 ? Math.round((completedCount / ITEMS.length) * 100) : 0;
  const allDone = completedCount === ITEMS.length;

  function handleToggle(field, currentValue) {
    if (!canEdit) return;
    startTransition(async () => {
      const r = await toggleChecklistItem(tripId, field, !currentValue, userEmail);
      if (r?.error) alert(r.error);
    });
  }

  function handleSaveNotes() {
    if (!canEdit) return;
    setSavingNotes(true);
    startTransition(async () => {
      const r = await saveChecklistNotes(tripId, notes);
      setSavingNotes(false);
      if (r?.error) alert(r.error);
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b bg-indigo-50 border-indigo-200 flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold text-indigo-800 flex items-center gap-2">
          <span>✅</span> Pre-Departure Checklist
        </h2>
        <div className="flex items-center gap-2">
          <p className={`text-sm font-bold ${allDone ? 'text-green-700' : 'text-indigo-700'}`}>
            {completedCount}/{ITEMS.length} ({progress}%)
          </p>
          {allDone && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">
              ✓ READY TO GO
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 pt-3">
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${allDone ? 'bg-green-500' : 'bg-indigo-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="p-5 space-y-1.5">
        {ITEMS.map((item) => {
          const isChecked = !!checklist[item.key];
          const checkedAt = checklist[`${item.key}_at`];
          return (
            <button
              key={item.key}
              onClick={() => handleToggle(item.key, isChecked)}
              disabled={!canEdit || pending}
              className={`w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors text-left ${
                isChecked
                  ? 'bg-green-50 border-green-200 hover:bg-green-100'
                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
              } ${!canEdit ? 'cursor-default' : 'cursor-pointer'} disabled:opacity-50`}
            >
              <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bold flex-shrink-0 ${
                isChecked ? 'bg-green-500 text-white' : 'bg-white border-2 border-slate-300 text-slate-400'
              }`}>
                {isChecked ? '✓' : ''}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${isChecked ? 'text-green-800' : 'text-slate-700'}`}>
                  {item.label}
                </p>
                {isChecked && checkedAt && (
                  <p className="text-[10px] text-green-600 mt-0.5">✓ {fmtDate(checkedAt)}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Notes */}
      <div className="px-5 pb-5">
        <label className="block">
          <span className="text-xs font-bold text-slate-700 block mb-1">📝 Catatan Pre-Departure</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleSaveNotes}
            disabled={!canEdit || pending}
            rows={2}
            placeholder="Hal-hal khusus untuk diperhatikan sebelum berangkat..."
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg resize-none focus:ring-1 focus:ring-indigo-500 outline-none"
          />
          {savingNotes && <span className="text-[10px] text-slate-500">Menyimpan...</span>}
        </label>
      </div>
    </div>
  );
}
