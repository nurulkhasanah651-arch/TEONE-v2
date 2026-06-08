'use client';

// R216c: Import Excel ke Trip + Family preview
// Path: components/trips/ImportExcelPanel.jsx

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { previewExcelImport, confirmExcelImport } from '@/lib/actions/import-excel-trip';

function fmtMoney(n) {
  if (!n) return '-';
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

const STATUS_BADGE = {
  new_customer: { label: '🆕 Baru', color: 'bg-emerald-100 text-emerald-800' },
  existing_customer: { label: '👤 Sudah Ada', color: 'bg-blue-100 text-blue-800' },
  skip: { label: '⊝ Skip', color: 'bg-slate-100 text-slate-600' },
};

const FAMILY_BADGE = {
  head: { label: '👑 Head', color: 'bg-purple-100 text-purple-800' },
  member: { label: '👨‍👩‍👧 Member', color: 'bg-indigo-100 text-indigo-700' },
  solo: { label: '🧍 Solo', color: 'bg-slate-50 text-slate-600' },
};

export default function ImportExcelPanel({ tripId, trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const fileInputRef = useRef(null);

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 8000);
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.xlsx?$/i.test(f.name)) {
      showMsg('File harus .xlsx atau .xls', 'error');
      return;
    }
    setFile(f);
    setPreview(null);
    setImportResult(null);
  }

  function handlePreview() {
    if (!file) { showMsg('Pilih file dulu', 'error'); return; }
    setImportResult(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append('file', file);
      const r = await previewExcelImport(tripId, formData);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      setPreview(r);
      showMsg(`✓ Preview: ${r.stats.total} baris (${r.stats.new_customer} baru, ${r.stats.existing_customer} sudah ada, ${r.stats.skip} skip) · ${r.stats.families} family + ${r.stats.solo_travelers} solo`);
    });
  }

  function handleConfirm() {
    if (!preview) return;
    const importable = preview.rows.filter((r) => r.match_status !== 'skip');
    if (importable.length === 0) {
      showMsg('Semua baris di-skip — gak ada yg di-import', 'error');
      return;
    }
    if (!confirm(
`Import ${importable.length} peserta ke trip ${preview.trip.kode_trip}?

• ${preview.stats.new_customer} customer baru akan dibuat
• ${preview.stats.existing_customer} customer existing akan masuk ke trip
• ${preview.stats.skip} di-skip (sudah di trip ini)
• ${preview.stats.families} family group akan dibuat
• ${preview.stats.solo_travelers} solo traveler
• Payment total: ${fmtMoney(preview.stats.total_payment)}`
    )) return;

    startTransition(async () => {
      const r = await confirmExcelImport(tripId, preview.rows);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      setImportResult(r);
      setPreview(null);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (r.errors?.length > 0) {
        showMsg(`⚠ Imported with ${r.errors.length} error — ${r.inserted_pax} peserta, ${r.inserted_families} family, ${r.inserted_payments} payment`, 'error');
      } else {
        showMsg(`✓ Imported: ${r.inserted_pax} peserta, ${r.inserted_families} family, ${r.inserted_payments} payment, ${r.inserted_customers} customer baru`);
      }
      router.refresh();
    });
  }

  function handleReset() {
    setFile(null);
    setPreview(null);
    setImportResult(null);
    setMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="bg-white rounded-xl border-2 border-indigo-300 shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-200 text-left flex items-center justify-between gap-2"
      >
        <div>
          <h2 className="font-bold text-indigo-800 flex items-center gap-2">
            <span>📥</span> Import Peserta dari Excel (Master Trip Travelops)
          </h2>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Upload xlsx → preview → confirm. Auto-create customer, peserta, payment, family group. Klik untuk {open ? 'tutup' : 'buka'}
          </p>
        </div>
        <span className="text-indigo-700 font-bold text-lg">{open ? '−' : '+'}</span>
      </button>

      {!open ? null : (
        <>
          {msg && (
            <div className={`px-5 py-3 text-sm border-b flex items-start justify-between gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-800 border-red-200 font-medium' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              <span className="flex-1 whitespace-pre-wrap">{msg.text}</span>
              {msg.type === 'error' && (
                <button type="button" onClick={() => setMsg(null)} className="text-xs px-2 py-0.5 bg-white border border-red-300 rounded">✕</button>
              )}
            </div>
          )}

          <div className="p-5 space-y-4">
            {!preview && !importResult && (
              <div className="space-y-3">
                <div className="bg-indigo-50 border border-indigo-200 rounded p-3 text-xs text-indigo-800 space-y-1">
                  <p className="font-bold">📋 Format yg di-support:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li>File <b>xlsx</b> dengan sheet <b>"Client Data"</b></li>
                    <li>Header di row 11, data mulai row 12</li>
                    <li>29 kolom: No, Kode Booking, First Name, Surname, ..., DP, P1, P2</li>
                  </ul>
                  <p className="font-bold mt-2">👨‍👩‍👧 Auto Family Detection:</p>
                  <ul className="list-disc list-inside space-y-0.5 ml-1">
                    <li><b>"(2 PAX)", "(6 PAX)"</b> dst di nama → bikin family group, peserta berikutnya jadi member</li>
                    <li><b>"(2 PAX + 1 CNB)"</b> → family 3 orang (incl child)</li>
                    <li><b>"(1 PAX)"</b> atau no marker → solo traveler</li>
                  </ul>
                  <p className="text-[10px] mt-2 italic">
                    ℹ Match peserta existing pakai combo: passport → phone → nama. Peserta yg udah di trip ini akan di-skip.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Pilih file Excel:</label>
                  <input autoComplete="off"
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileChange}
                    className="w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:bg-indigo-100 file:text-indigo-700 file:font-semibold hover:file:bg-indigo-200"
                  />
                  {file && (
                    <p className="text-[11px] text-slate-600 mt-1">
                      📄 {file.name} · {(file.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handlePreview}
                  disabled={pending || !file}
                  className="w-full px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {pending ? '⏳ Parsing...' : '🔍 Preview Import'}
                </button>
              </div>
            )}

            {preview && !importResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-slate-100 rounded text-center">
                    <p className="text-[10px] font-bold text-slate-600">Total</p>
                    <p className="font-bold text-slate-800 text-lg">{preview.stats.total}</p>
                  </div>
                  <div className="p-2 bg-emerald-100 rounded text-center">
                    <p className="text-[10px] font-bold text-emerald-700">🆕 Baru</p>
                    <p className="font-bold text-emerald-800 text-lg">{preview.stats.new_customer}</p>
                  </div>
                  <div className="p-2 bg-blue-100 rounded text-center">
                    <p className="text-[10px] font-bold text-blue-700">👤 Sudah Ada</p>
                    <p className="font-bold text-blue-800 text-lg">{preview.stats.existing_customer}</p>
                  </div>
                  <div className="p-2 bg-slate-100 rounded text-center">
                    <p className="text-[10px] font-bold text-slate-600">⊝ Skip</p>
                    <p className="font-bold text-slate-700 text-lg">{preview.stats.skip}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                  <div className="p-2 bg-purple-100 rounded text-center">
                    <p className="text-[10px] font-bold text-purple-700">👑 Family Groups</p>
                    <p className="font-bold text-purple-800 text-lg">{preview.stats.families}</p>
                  </div>
                  <div className="p-2 bg-indigo-100 rounded text-center">
                    <p className="text-[10px] font-bold text-indigo-700">👨‍👩‍👧 Members</p>
                    <p className="font-bold text-indigo-800 text-lg">{preview.stats.family_members}</p>
                  </div>
                  <div className="p-2 bg-slate-100 rounded text-center">
                    <p className="text-[10px] font-bold text-slate-600">🧍 Solo</p>
                    <p className="font-bold text-slate-700 text-lg">{preview.stats.solo_travelers}</p>
                  </div>
                </div>

                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 text-center">
                  💰 Total payment akan di-import: <b>{fmtMoney(preview.stats.total_payment)}</b>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Status</th>
                        <th className="px-2 py-1.5 text-left">Family</th>
                        <th className="px-2 py-1.5 text-left">Nama</th>
                        <th className="px-2 py-1.5 text-left">Phone</th>
                        <th className="px-2 py-1.5 text-left">Passport</th>
                        <th className="px-2 py-1.5 text-left">Room</th>
                        <th className="px-2 py-1.5 text-right">DP</th>
                        <th className="px-2 py-1.5 text-right">P1</th>
                        <th className="px-2 py-1.5 text-right">P2</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {preview.rows.map((r, i) => {
                        const sBadge = STATUS_BADGE[r.match_status] || STATUS_BADGE.skip;
                        const fBadge = FAMILY_BADGE[r.family_role] || FAMILY_BADGE.solo;
                        return (
                          <tr key={i} className={r.match_status === 'skip' ? 'opacity-50' : ''}>
                            <td className="px-2 py-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${sBadge.color}`}>{sBadge.label}</span>
                              {r.match_via && <span className="text-[9px] text-slate-500 block">via {r.match_via}</span>}
                            </td>
                            <td className="px-2 py-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${fBadge.color}`}>{fBadge.label}</span>
                              {r.family_role === 'head' && (
                                <span className="text-[9px] text-purple-600 block">{r.family_total_pax} PAX</span>
                              )}
                              {r.family_role === 'member' && r.family_head_name && (
                                <span className="text-[9px] text-indigo-600 block">→ {r.family_head_name}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 font-semibold">{r.full_name}</td>
                            <td className="px-2 py-1.5 text-slate-600">{r.phone || '-'}</td>
                            <td className="px-2 py-1.5 font-mono text-[10px]">{r.passport_no || '-'}</td>
                            <td className="px-2 py-1.5 text-[10px]">{r.room_type}{r.room_code ? ` (${r.room_code})` : ''}</td>
                            <td className="px-2 py-1.5 text-right text-[10px]">{r.dp ? fmtMoney(r.dp) : '-'}</td>
                            <td className="px-2 py-1.5 text-right text-[10px]">{r.p1 ? fmtMoney(r.p1) : '-'}</td>
                            <td className="px-2 py-1.5 text-right text-[10px]">{r.p2 ? fmtMoney(r.p2) : '-'}</td>
                            <td className="px-2 py-1.5 text-right text-[10px] font-bold">{fmtMoney(r.total_payment)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={pending}
                    className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {pending ? '⏳ Importing...' : `✓ Confirm Import (${preview.stats.new_customer + preview.stats.existing_customer} peserta + ${preview.stats.families} family)`}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={pending}
                    className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 disabled:opacity-50"
                  >
                    ✕ Cancel
                  </button>
                </div>
              </div>
            )}

            {importResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                  <div className="p-2 bg-emerald-100 rounded text-center">
                    <p className="text-[10px] font-bold text-emerald-700">🆕 Customer</p>
                    <p className="font-bold text-emerald-800 text-lg">{importResult.inserted_customers}</p>
                  </div>
                  <div className="p-2 bg-blue-100 rounded text-center">
                    <p className="text-[10px] font-bold text-blue-700">👥 Peserta</p>
                    <p className="font-bold text-blue-800 text-lg">{importResult.inserted_pax}</p>
                  </div>
                  <div className="p-2 bg-purple-100 rounded text-center">
                    <p className="text-[10px] font-bold text-purple-700">👨‍👩‍👧 Family</p>
                    <p className="font-bold text-purple-800 text-lg">{importResult.inserted_families}</p>
                  </div>
                  <div className="p-2 bg-amber-100 rounded text-center">
                    <p className="text-[10px] font-bold text-amber-700">💰 Payment</p>
                    <p className="font-bold text-amber-800 text-lg">{importResult.inserted_payments}</p>
                  </div>
                  <div className="p-2 bg-slate-100 rounded text-center">
                    <p className="text-[10px] font-bold text-slate-600">⊝ Skip</p>
                    <p className="font-bold text-slate-700 text-lg">{importResult.skipped}</p>
                  </div>
                </div>

                {importResult.errors?.length > 0 && (
                  <details open className="bg-red-50 border border-red-200 rounded p-3">
                    <summary className="cursor-pointer font-bold text-red-800">⚠ {importResult.errors.length} error / warning</summary>
                    <ul className="mt-2 ml-4 list-disc text-[11px] text-red-700">
                      {importResult.errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
                    </ul>
                  </details>
                )}

                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full px-4 py-2.5 rounded-lg bg-indigo-100 text-indigo-700 font-bold hover:bg-indigo-200"
                >
                  📥 Import file lain
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
