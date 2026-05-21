'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleParticipantDoc, updateParticipantDocNotes, updateParticipantVisaNotes } from '@/lib/actions/visa';

export default function VisaMatrix({ tripId, template = [], passengers = [] }) {
  const [pending, startTransition] = useTransition();
  const [expandedRow, setExpandedRow] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const router = useRouter();

  function handleToggle(passengerId, docName, currentDocs) {
    startTransition(async () => {
      const result = await toggleParticipantDoc(passengerId, tripId, docName, currentDocs);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  }

  async function handleNoteSave(passengerId, docName, notes, currentDocs) {
    startTransition(async () => {
      const result = await updateParticipantDocNotes(passengerId, tripId, docName, notes, currentDocs);
      if (result?.error) alert(result.error);
      setEditingNote(null);
      router.refresh();
    });
  }

  async function handlePersonalNoteSave(passengerId, notes) {
    startTransition(async () => {
      const result = await updateParticipantVisaNotes(passengerId, tripId, notes);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  if (template.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-8 text-center">
        <p className="text-4xl mb-3">📋</p>
        <p className="text-lg font-bold text-slate-700">Set template dokumen dulu</p>
        <p className="text-sm text-slate-500 mt-1">Di atas, klik "Pakai Template Default" atau tambah dokumen manual.</p>
      </div>
    );
  }

  if (passengers.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-8 text-center">
        <p className="text-4xl mb-3">👥</p>
        <p className="text-sm text-slate-500">Belum ada peserta di trip ini.</p>
      </div>
    );
  }

  // Summary per doc
  const docCounts = {};
  for (const doc of template) {
    docCounts[doc] = passengers.filter((p) => (p.visa_docs || []).find((d) => d.name === doc && d.complete)).length;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <h3 className="font-bold text-brand-700">Checklist Dokumen per Peserta</h3>
        <p className="text-xs text-slate-500 mt-0.5">Klik cell untuk tandai lengkap. Klik nama peserta untuk catatan per dokumen.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 bg-slate-50 z-10">Peserta</th>
              {template.map((doc) => (
                <th key={doc} className="px-2 py-2 text-center text-[10px] font-bold text-slate-600 uppercase tracking-wider" style={{ minWidth: '80px' }}>
                  <p title={doc}>{doc.length > 16 ? doc.substring(0, 14) + '…' : doc}</p>
                </th>
              ))}
              <th className="px-3 py-2 text-right text-xs font-bold text-slate-600 uppercase tracking-wider">Progress</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {passengers.map((p, idx) => {
              const c = p.customers || {};
              const docs = p.visa_docs || [];
              const completeCount = template.filter((doc) => docs.find((d) => d.name === doc && d.complete)).length;
              const progress = template.length > 0 ? Math.round((completeCount / template.length) * 100) : 0;
              const isExpanded = expandedRow === p.id;

              return (
                <>
                  <tr key={p.id} className={`hover:bg-slate-50 ${isExpanded ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-2 sticky left-0 bg-white hover:bg-slate-50 z-10">
                      <button onClick={() => setExpandedRow(isExpanded ? null : p.id)} className="text-left w-full hover:bg-slate-100 -ml-1 px-1 py-0.5 rounded">
                        <p className="font-semibold text-brand-700 text-sm">{isExpanded ? '▾' : '▸'} {c.name || '—'}</p>
                        <p className="text-[10px] text-slate-500">#{idx + 1}{c.passport_no && ` · 📕 ${c.passport_no}`}</p>
                      </button>
                    </td>
                    {template.map((doc) => {
                      const docData = docs.find((d) => d.name === doc);
                      const isPaid = docData?.complete;
                      return (
                        <td key={doc} className="px-1 py-2 text-center">
                          <button
                            onClick={() => handleToggle(p.id, doc, docs)}
                            disabled={pending}
                            className={`w-9 h-7 rounded font-bold text-sm transition-colors disabled:opacity-50 ${
                              isPaid ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
                            }`}
                            title={docData?.notes || (isPaid ? 'Lengkap' : 'Belum')}
                          >
                            {isPaid ? '✓' : '○'}
                          </button>
                          {docData?.notes && <span className="text-[9px] block">📝</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right">
                      <p className={`font-bold ${progress === 100 ? 'text-green-700' : 'text-amber-700'}`}>{progress}%</p>
                      <p className="text-[10px] text-slate-500">{completeCount}/{template.length}</p>
                    </td>
                  </tr>

                  {/* Expanded row: notes per doc + personal */}
                  {isExpanded && (
                    <tr className="bg-amber-50/30">
                      <td colSpan={template.length + 2} className="px-5 py-3">
                        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Detail — {c.name}</p>

                        {/* Personal visa notes */}
                        <div className="mb-3">
                          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">Catatan Visa untuk Peserta Ini</label>
                          <textarea
                            defaultValue={p.visa_personal_notes || ''}
                            onBlur={(e) => handlePersonalNoteSave(p.id, e.target.value)}
                            rows="2"
                            placeholder="Contoh: Passport mau expired, perlu renewal sebelum biometrik..."
                            className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white resize-none"
                          />
                        </div>

                        {/* Per-doc notes */}
                        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">Catatan per Dokumen</p>
                        <div className="space-y-1.5">
                          {template.map((doc) => {
                            const docData = docs.find((d) => d.name === doc);
                            const editKey = `${p.id}_${doc}`;
                            const isEditing = editingNote === editKey;
                            return (
                              <div key={doc} className="flex items-center gap-2 text-xs">
                                <span className={`w-2 h-2 rounded-full ${docData?.complete ? 'bg-green-500' : 'bg-slate-300'}`} />
                                <span className="font-semibold text-slate-700 min-w-32">{doc}</span>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    defaultValue={docData?.notes || ''}
                                    autoFocus
                                    onBlur={(e) => handleNoteSave(p.id, doc, e.target.value, docs)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingNote(null); }}
                                    className="flex-1 px-2 py-0.5 border border-brand-500 rounded text-xs"
                                  />
                                ) : (
                                  <span
                                    onClick={() => setEditingNote(editKey)}
                                    className="flex-1 text-slate-600 cursor-pointer hover:text-brand-600 hover:underline truncate"
                                    title="Klik untuk edit"
                                  >
                                    {docData?.notes || <span className="italic text-slate-400">+ tambah catatan</span>}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-50 border-t-2 border-slate-200">
            <tr>
              <td className="px-3 py-2 text-left text-xs font-bold text-slate-700 sticky left-0 bg-slate-50">
                Total Lengkap
              </td>
              {template.map((doc) => (
                <td key={doc} className="px-1 py-2 text-center">
                  <p className={`text-xs font-bold ${docCounts[doc] === passengers.length ? 'text-green-700' : docCounts[doc] === 0 ? 'text-slate-500' : 'text-amber-700'}`}>
                    {docCounts[doc]}/{passengers.length}
                  </p>
                </td>
              ))}
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
