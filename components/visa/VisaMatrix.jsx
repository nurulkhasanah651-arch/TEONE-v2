'use client';

// Round 128: Tampil badge sync visa payment + reminder biometrik
// Saat finance checklist payment 'Visa' → otomatis muncul badge "✓ Visa Lunas - Segera jadwalkan biometrik!"

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleParticipantDoc, updateParticipantDocNotes, updateParticipantVisaNotes, updateParticipantVisaStatus } from '@/lib/actions/visa';
import { fmtDate, daysUntil } from '@/lib/utils/format';
import { VISA_STATUS_OPTS, STATUS_COLOR_CLASS } from '@/lib/utils/visa-constants';

const STATUS_MAP = Object.fromEntries(VISA_STATUS_OPTS.map((s) => [s.value, s]));

function fmtRupiah(n) {
  return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID');
}

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

  async function handleStatusChange(passengerId, status) {
    startTransition(async () => {
      const result = await updateParticipantVisaStatus(passengerId, tripId, status, undefined);
      if (result?.error) alert(result.error);
      router.refresh();
    });
  }

  async function handleBiometricChange(passengerId, date) {
    startTransition(async () => {
      const result = await updateParticipantVisaStatus(passengerId, tripId, undefined, date);
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
        <p className="text-sm text-slate-500">Belum ada peserta aktif di trip ini.</p>
      </div>
    );
  }

  // Summary per doc
  const docCounts = {};
  for (const doc of template) {
    docCounts[doc] = passengers.filter((p) => Array.isArray(p.visa_docs) && p.visa_docs.find((d) => d.name === doc && d.complete)).length;
  }

  // ROUND 128: Summary visa payment status
  const totalVisaPaid = passengers.filter((p) => p.visaPayment && Number(p.visaPayment.amount) > 0).length;
  const totalBiometricScheduled = passengers.filter((p) => p.visa_biometric_date).length;

  return (
    <div className="space-y-4">
      {/* ROUND 128: Top banner — Visa payment progress */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs font-bold text-blue-800 uppercase tracking-wider">💳 Sync dengan Finance Payment Checklist</p>
            <p className="text-sm text-slate-700 mt-1">
              <b>{totalVisaPaid}</b> dari {passengers.length} peserta sudah <b>Lunas Visa</b> (auto-detect dari Finance).
              {' '}<b>{totalBiometricScheduled}</b> sudah dijadwalkan biometrik.
            </p>
          </div>
          {totalVisaPaid > totalBiometricScheduled && (
            <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-red-100 text-red-700 animate-pulse">
              ⚠ {totalVisaPaid - totalBiometricScheduled} peserta sudah lunas visa belum dijadwalkan biometrik
            </span>
          )}
        </div>
      </div>

      {/* Per-participant CARDS */}
      {passengers.map((p, idx) => {
        const c = p.customers || {};
        const docs = Array.isArray(p.visa_docs) ? p.visa_docs : [];
        const completeDocs = template.filter((doc) => docs.find((d) => d.name === doc && d.complete));
        const missingDocs = template.filter((doc) => !docs.find((d) => d.name === doc && d.complete));
        const progress = template.length > 0 ? Math.round((completeDocs.length / template.length) * 100) : 0;
        const status = p.visa_status || 'pending';
        const statusCfgItem = STATUS_MAP[status];
        const biometricDate = p.visa_biometric_date;
        const bioDays = biometricDate ? daysUntil(biometricDate) : null;
        const isExpanded = expandedRow === p.id;

        // ROUND 128: Visa payment check
        const visaPaymentAmount = Number(p.visaPayment?.amount || 0);
        const visaPaymentDate = p.visaPayment?.paid_at;
        const isVisaPaid = visaPaymentAmount > 0;
        const needsBiometricSchedule = isVisaPaid && !biometricDate;

        return (
          <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
            {/* Header */}
            <button
              onClick={() => setExpandedRow(isExpanded ? null : p.id)}
              className="w-full px-5 py-3 flex items-start justify-between gap-3 flex-wrap hover:bg-slate-50 transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                  <p className="font-bold text-brand-700">{c.name || '—'}</p>

                  {/* ROUND 128: Badge sync visa payment status */}
                  {isVisaPaid && needsBiometricSchedule && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-800 border border-orange-300 animate-pulse" title={`Visa lunas: ${fmtRupiah(visaPaymentAmount)}${visaPaymentDate ? ` (${fmtDate(visaPaymentDate)})` : ''}`}>
                      🚨 Segera jadwalkan biometrik!
                    </span>
                  )}
                  {isVisaPaid && biometricDate && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200" title={`Visa lunas: ${fmtRupiah(visaPaymentAmount)}`}>
                      ✓ Sudah lunas visa
                    </span>
                  )}
                  {!isVisaPaid && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-500" title="Belum ada payment Visa di Finance Payment Checklist">
                      💳 Visa belum lunas
                    </span>
                  )}

                  {statusCfgItem && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${STATUS_COLOR_CLASS[statusCfgItem.color]}`}>
                      {statusCfgItem.label}
                    </span>
                  )}
                  {biometricDate ? (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${bioDays != null && bioDays >= 0 && bioDays <= 7 ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-indigo-50 text-indigo-700'}`}>
                      📅 Bio dijadwalkan: {fmtDate(biometricDate)}{bioDays != null && bioDays >= 0 && ` (${bioDays}h)`}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-500" title="Biometrik belum dijadwalkan">
                      📅 Bio: belum dijadwalkan
                    </span>
                  )}
                  {missingDocs.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                      ⚠ {missingDocs.length} doc kurang
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3">
                  {c.passport_no && <span>📕 {c.passport_no}</span>}
                  {c.passport_expiry && <span>Exp: {fmtDate(c.passport_expiry)}</span>}
                  {c.phone && <span>📞 {c.phone}</span>}
                  {isVisaPaid && (
                    <span className="font-semibold text-emerald-700">
                      💳 Visa: {fmtRupiah(visaPaymentAmount)}{visaPaymentDate ? ` · ${fmtDate(visaPaymentDate)}` : ''}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${progress === 100 ? 'text-green-700' : progress > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{progress}%</p>
                <p className="text-[10px] text-slate-500">{completeDocs.length}/{template.length} docs</p>
                <p className="text-xs text-brand-600 font-semibold mt-1">{isExpanded ? '▾ Sembunyikan' : '▸ Detail'}</p>
              </div>
            </button>

            {/* Expanded section */}
            {isExpanded && (
              <div className="px-5 py-4 border-t border-slate-200 bg-amber-50/30 space-y-4">
                {/* Visa payment info card (kalau lunas) */}
                {isVisaPaid && (
                  <div className={`p-3 rounded-lg border ${needsBiometricSchedule ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider ${needsBiometricSchedule ? 'text-orange-800' : 'text-emerald-800'}`}>
                      {needsBiometricSchedule ? '🚨 Sudah Lunas Visa — Segera Jadwalkan Biometrik!' : '✓ Sudah Lunas Visa'}
                    </p>
                    <p className="text-xs text-slate-700 mt-1">
                      Pembayaran visa: <b>{fmtRupiah(visaPaymentAmount)}</b>
                      {visaPaymentDate && ` · ${fmtDate(visaPaymentDate)}`}
                      {' · '}<span className="text-slate-500">Auto-sync dari Finance Payment Checklist</span>
                    </p>
                  </div>
                )}

                {/* Status + biometric */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs font-bold text-brand-700 uppercase tracking-wider block mb-1">Status Visa</span>
                    <select
                      value={status}
                      onChange={(e) => handleStatusChange(p.id, e.target.value)}
                      disabled={pending}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm bg-white focus:ring-1 focus:ring-brand-500 outline-none"
                    >
                      {VISA_STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold text-brand-700 uppercase tracking-wider block mb-1">
                      Tanggal Biometrik {needsBiometricSchedule && <span className="text-orange-700">⚠</span>}
                    </span>
                    <input autoComplete="off"
                      type="date"
                      defaultValue={biometricDate || ''}
                      onBlur={(e) => handleBiometricChange(p.id, e.target.value)}
                      disabled={pending}
                      className={`w-full px-3 py-1.5 border rounded text-sm bg-white focus:ring-1 focus:ring-brand-500 outline-none ${needsBiometricSchedule ? 'border-orange-400 ring-1 ring-orange-200' : 'border-slate-300'}`}
                    />
                  </label>
                </div>

                {/* Doc checklist */}
                <div>
                  <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Dokumen ({completeDocs.length}/{template.length} lengkap)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {template.map((doc) => {
                      const docData = docs.find((d) => d.name === doc);
                      const isPaid = docData?.complete;
                      const editKey = `${p.id}_${doc}`;
                      const isEditingThis = editingNote === editKey;
                      return (
                        <div key={doc} className={`flex items-center gap-2 p-2 rounded ${isPaid ? 'bg-green-50' : 'bg-white'} border ${isPaid ? 'border-green-200' : 'border-slate-200'}`}>
                          <button
                            onClick={() => handleToggle(p.id, doc, docs)}
                            disabled={pending}
                            className={`w-6 h-6 rounded font-bold text-xs flex-shrink-0 transition-colors ${
                              isPaid ? 'bg-green-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
                            }`}
                          >
                            {isPaid ? '✓' : '○'}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold ${isPaid ? 'text-green-700' : 'text-slate-700'}`}>{doc}</p>
                            {isEditingThis ? (
                              <input autoComplete="off"
                                type="text"
                                defaultValue={docData?.notes || ''}
                                autoFocus
                                onBlur={(e) => handleNoteSave(p.id, doc, e.target.value, docs)}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingNote(null); }}
                                placeholder="Catatan dokumen ini..."
                                className="w-full mt-0.5 px-1.5 py-0.5 border border-brand-500 rounded text-[11px]"
                              />
                            ) : (
                              <p
                                onClick={() => setEditingNote(editKey)}
                                className="text-[10px] text-slate-500 cursor-pointer hover:text-brand-600 truncate"
                                title="Klik untuk edit catatan"
                              >
                                {docData?.notes || (isPaid ? '✓ Lengkap' : <span className="italic">+ Catatan kekurangan</span>)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {missingDocs.length > 0 && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-bold text-amber-800 mb-1">⚠ Dokumen yang Belum Lengkap ({missingDocs.length}):</p>
                    <p className="text-xs text-amber-700">{missingDocs.join(', ')}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-1">Catatan Visa untuk Peserta Ini</p>
                  <textarea autoComplete="off"
                    defaultValue={p.visa_personal_notes || ''}
                    onBlur={(e) => handlePersonalNoteSave(p.id, e.target.value)}
                    rows="2"
                    placeholder="Contoh: Passport mau expired, perlu renewal sebelum biometrik..."
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white resize-none focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Group summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">📊 Summary Group</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
          <div className="p-2 bg-emerald-50 rounded text-center">
            <p className="text-[10px] text-emerald-700 font-semibold">💳 Visa Lunas</p>
            <p className="text-sm font-bold text-emerald-700">{totalVisaPaid}/{passengers.length}</p>
          </div>
          <div className="p-2 bg-indigo-50 rounded text-center">
            <p className="text-[10px] text-indigo-700 font-semibold">📅 Biometrik Set</p>
            <p className="text-sm font-bold text-indigo-700">{totalBiometricScheduled}/{passengers.length}</p>
          </div>
          {template.map((doc) => (
            <div key={doc} className="p-2 bg-slate-50 rounded text-center">
              <p className="text-[10px] text-slate-600 font-semibold truncate" title={doc}>{doc}</p>
              <p className={`text-sm font-bold ${docCounts[doc] === passengers.length ? 'text-green-700' : 'text-amber-700'}`}>
                {docCounts[doc]}/{passengers.length}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
