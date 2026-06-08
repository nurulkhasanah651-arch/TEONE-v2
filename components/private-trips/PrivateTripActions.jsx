'use client';

// R224: Actions panel — status, assign, quick reply, archive
// Path: components/private-trips/PrivateTripActions.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updatePrivateTripRequest,
  addQuickReply,
  archivePrivateTripRequest,
} from '@/lib/actions/private-trip-request';

const STATUS_OPTIONS = [
  { value: 'new', label: '🆕 New' },
  { value: 'contacted', label: '📞 Contacted' },
  { value: 'quoted', label: '📋 Quoted' },
  { value: 'accepted', label: '✅ Accepted' },
  { value: 'declined', label: '❌ Declined' },
  { value: 'archived', label: '📦 Archived' },
];

export default function PrivateTripActions({ request }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [reply, setReply] = useState('');
  const [assignTo, setAssignTo] = useState(request.assigned_to || '');
  const [internalNotes, setInternalNotes] = useState(request.internal_notes || '');

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  }

  function handleStatusChange(newStatus) {
    if (newStatus === request.status) return;
    startTransition(async () => {
      const r = await updatePrivateTripRequest(request.id, { status: newStatus });
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(`✓ Status updated → ${newStatus}`);
      router.refresh();
    });
  }

  function handleAssign() {
    startTransition(async () => {
      const r = await updatePrivateTripRequest(request.id, { assigned_to: assignTo.trim() || null });
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(`✓ Assigned to ${assignTo || 'unassigned'}`);
      router.refresh();
    });
  }

  function handleSaveNotes() {
    startTransition(async () => {
      const r = await updatePrivateTripRequest(request.id, { internal_notes: internalNotes });
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg('✓ Notes saved');
      router.refresh();
    });
  }

  function handleQuickReply() {
    if (!reply.trim()) { showMsg('Reply gak boleh kosong', 'error'); return; }
    startTransition(async () => {
      const r = await addQuickReply(request.id, reply);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg('✓ Reply ditambahkan');
      setReply('');
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200">
        <h2 className="font-bold text-indigo-800">⚡ Action Panel</h2>
      </div>

      {msg && (
        <div className={`px-5 py-2 text-sm border-b ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Status quick change */}
        <div>
          <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase">📌 Update Status</label>
          <div className="flex gap-1.5 flex-wrap">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                disabled={pending}
                className={`px-3 py-1.5 text-xs font-bold rounded transition ${
                  request.status === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                } disabled:opacity-50`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Reply */}
        <div className="pt-4 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase">💬 Quick Reply / Note</label>
          <textarea autoComplete="off"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Contoh: Sudah call jam 14:00, mau dikirim itinerary draft Korea. Follow up besok."
            rows={3}
            className="w-full px-3 py-2 border-2 border-slate-200 rounded text-sm focus:border-indigo-500 outline-none"
          />
          <button
            onClick={handleQuickReply}
            disabled={pending || !reply.trim()}
            className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {pending ? '⏳' : '➕ Tambah Reply'}
          </button>
          <p className="text-[10px] text-slate-500 mt-1">
            Otomatis ganti status ke "Contacted" kalo masih NEW
          </p>
        </div>

        {/* Assign to */}
        <div className="pt-4 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase">👤 Assign to (Email / Nama)</label>
          <div className="flex gap-2">
            <input autoComplete="off"
              type="text"
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              placeholder="cs.nurul@teone.dev"
              className="flex-1 px-3 py-2 border-2 border-slate-200 rounded text-sm focus:border-indigo-500 outline-none"
            />
            <button
              onClick={handleAssign}
              disabled={pending}
              className="px-3 py-2 bg-blue-600 text-white text-sm font-bold rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        {/* Internal Notes */}
        <div className="pt-4 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase">📝 Internal Notes (Cuma Tim)</label>
          <textarea autoComplete="off"
            value={internalNotes}
            onChange={(e) => setInternalNotes(e.target.value)}
            placeholder="Customer alumni 2024, dulu pernah trip Bali. Sensitive ke harga, kasih opsi land tour aja."
            rows={3}
            className="w-full px-3 py-2 border-2 border-slate-200 rounded text-sm focus:border-indigo-500 outline-none"
          />
          <button
            onClick={handleSaveNotes}
            disabled={pending}
            className="mt-2 px-4 py-2 bg-slate-600 text-white text-sm font-bold rounded hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? '⏳' : '💾 Save Notes'}
          </button>
        </div>
      </div>
    </div>
  );
}
