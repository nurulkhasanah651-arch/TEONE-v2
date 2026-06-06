'use client';

// R215m + R215n: Visa Workflow Panel
// R215n FIX: jam biometrik PER PESERTA (input di sini, di-sync ke trip_passengers.visa_biometric_time)
// Path: components/visa/VisaWorkflowPanel.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updatePassengerVisaCost,
  updatePassengerBiometricTime,
  requestVisaCostToFinance,
  sendVisaWA,
  uploadVisaResult,
  generateUploadToken,
} from '@/lib/actions/visa-workflow';
import { getTemplateOptions } from '@/lib/utils/visa-templates';

function fmtRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

function fmtTime(t) {
  if (!t) return '—';
  return String(t).slice(0, 5);
}

const TEMPLATE_OPTIONS = getTemplateOptions();

export default function VisaWorkflowPanel({ trip, passengers = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkTemplate, setBulkTemplate] = useState('doc_collection');
  const [bulkFamilyAware, setBulkFamilyAware] = useState(true);
  const [bulkCustomDokKurang, setBulkCustomDokKurang] = useState('');

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 5000);
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function selectAll() { setSelectedIds(new Set(passengers.map((p) => p.id))); }
  function clearAll() { setSelectedIds(new Set()); }

  function handleBulkSend() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) { showMsg('Pilih minimal 1 peserta', 'error'); return; }
    startTransition(async () => {
      const r = await sendVisaWA({
        tripId: trip.id,
        passengerIds: ids,
        templateKey: bulkTemplate,
        customVars: bulkCustomDokKurang ? { list_dokumen_kurang: bulkCustomDokKurang } : {},
        familyAware: bulkFamilyAware,
      });
      if (r?.error) { showMsg('Gagal: ' + r.error, 'error'); return; }
      showMsg(`✓ Bulk send: ${r.sent} sukses, ${r.failed} gagal${r.family_aware ? ` · Family-aware (${r.family_count} family)` : ''}`);
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-amber-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
        <h2 className="font-bold text-amber-800 flex items-center gap-2">
          <span>📨</span> Visa Workflow (Cost · WA · Hasil · Jam Biometrik per Pax)
        </h2>
        <p className="text-[11px] text-slate-600 mt-0.5">
          Per peserta: biaya biometrik & visa · Request DP · Send WA · Upload hasil · ⏰ Jam biometrik
        </p>
      </div>

      {msg && (
        <div className={`px-5 py-3 text-sm border-b flex items-start justify-between gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-800 border-red-200 font-medium' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          <span className="flex-1">{msg.text}</span>
          {msg.type === 'error' && (
            <button type="button" onClick={() => setMsg(null)} className="text-xs px-2 py-0.5 bg-white border border-red-300 rounded">✕</button>
          )}
        </div>
      )}

      {/* BULK ACTION TOOLBAR */}
      <div className="px-5 py-3 bg-blue-50 border-b border-blue-200 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-blue-800 uppercase">📤 Bulk WA Send</span>
            <span className="text-slate-600">({selectedIds.size} selected)</span>
            <button type="button" onClick={selectAll} className="text-[11px] font-semibold px-2 py-0.5 bg-blue-200 hover:bg-blue-300 text-blue-800 rounded">✓ Semua</button>
            <button type="button" onClick={clearAll} className="text-[11px] font-semibold px-2 py-0.5 bg-slate-200 hover:bg-slate-300 rounded">✕ Kosong</button>
          </div>
          <label className="flex items-center gap-1 text-xs cursor-pointer">
            <input type="checkbox" checked={bulkFamilyAware} onChange={(e) => setBulkFamilyAware(e.target.checked)} />
            <span className="font-semibold text-blue-700">👨‍👩 Family-aware (1× per family)</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Template</label>
            <select value={bulkTemplate} onChange={(e) => setBulkTemplate(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white">
              {TEMPLATE_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          {bulkTemplate === 'doc_kurang' && (
            <div className="flex-1 min-w-[200px]">
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">List dokumen kurang</label>
              <input type="text" value={bulkCustomDokKurang} onChange={(e) => setBulkCustomDokKurang(e.target.value)} placeholder="- Pas foto belum jelas" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
            </div>
          )}
          <button type="button" onClick={handleBulkSend} disabled={pending || selectedIds.size === 0} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded">
            {pending ? '⏳' : '📨 Send WA Bulk'}
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {passengers.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">Belum ada peserta aktif.</div>
        ) : (
          passengers.map((p) => (
            <PassengerWorkflowRow
              key={p.id}
              passenger={p}
              trip={trip}
              isSelected={selectedIds.has(p.id)}
              onToggleSelect={() => toggleSelect(p.id)}
              showMsg={showMsg}
              pending={pending}
              startTransition={startTransition}
              router={router}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PassengerWorkflowRow({ passenger, trip, isSelected, onToggleSelect, showMsg, pending, startTransition, router }) {
  const p = passenger;
  const c = p.customers || {};
  const [expanded, setExpanded] = useState(false);
  const [biometricCost, setBiometricCost] = useState(p.visa_biometric_cost ?? trip.visa_default_biometric_cost ?? 0);
  const [visaCost, setVisaCost] = useState(p.visa_visa_cost ?? trip.visa_default_visa_cost ?? 0);
  // R215n — Per pax biometric time
  const [biometricTime, setBiometricTime] = useState(p.visa_biometric_time || '');
  const [singleTemplate, setSingleTemplate] = useState('doc_collection');
  const [singleCustomVars, setSingleCustomVars] = useState({});

  const [showUploadResult, setShowUploadResult] = useState(false);
  const [resultType, setResultType] = useState('approved');
  const [resultPhotoUrl, setResultPhotoUrl] = useState('');
  const [resultValidFrom, setResultValidFrom] = useState('');
  const [resultValidUntil, setResultValidUntil] = useState('');
  const [resultEntryType, setResultEntryType] = useState('multiple');
  const [resultRejReason, setResultRejReason] = useState('');
  const [resultReturnKurir, setResultReturnKurir] = useState('JNE');
  const [resultReturnResi, setResultReturnResi] = useState('');
  const [autoSendWA, setAutoSendWA] = useState(true);

  function handleSaveCost(type) {
    const amount = type === 'biometric' ? biometricCost : visaCost;
    startTransition(async () => {
      const r = await updatePassengerVisaCost(p.id, type, Number(amount) || 0);
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg(`✓ Cost ${type} tersimpan untuk ${c.name}`); router.refresh(); }
    });
  }

  function handleRequestDP(type) {
    const amount = type === 'biometric' ? biometricCost : visaCost;
    if (!amount || amount <= 0) { showMsg(`Set cost ${type} dulu`, 'error'); return; }
    startTransition(async () => {
      const r = await requestVisaCostToFinance(p.id, type, Number(amount), null, `Visa workflow ${type} ${c.name}`);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(`✓ HPP item dibuat (${type}). ${r.message}`);
      router.refresh();
    });
  }

  // R215n — Save jam biometrik per pax
  function handleSaveBiometricTime() {
    startTransition(async () => {
      const r = await updatePassengerBiometricTime(p.id, biometricTime);
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg(`✓ Jam biometrik ${biometricTime || 'kosong'} tersimpan untuk ${c.name}`); router.refresh(); }
    });
  }

  function handleSendSingle() {
    startTransition(async () => {
      const r = await sendVisaWA({
        tripId: trip.id,
        passengerIds: [p.id],
        templateKey: singleTemplate,
        customVars: singleCustomVars,
        familyAware: false,
      });
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg(`✓ WA ${singleTemplate} terkirim ke ${c.name}`); router.refresh(); }
    });
  }

  function handleGenerateToken() {
    startTransition(async () => {
      const r = await generateUploadToken(p.id);
      if (r?.error) showMsg(r.error, 'error');
      else {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(r.upload_url);
        }
        showMsg(`✓ Token ter-generate. URL di-copy: ${r.upload_url}`);
        router.refresh();
      }
    });
  }

  function handleSaveResult() {
    startTransition(async () => {
      const extras = {};
      if (resultType === 'approved') {
        if (resultValidFrom) extras.valid_from = resultValidFrom;
        if (resultValidUntil) extras.valid_until = resultValidUntil;
        if (resultEntryType) extras.entry_type = resultEntryType;
        if (resultReturnKurir) extras.return_kurir = resultReturnKurir;
        if (resultReturnResi) extras.return_resi = resultReturnResi;
      }
      if (resultType === 'rejected' && resultRejReason) extras.rejection_reason = resultRejReason;
      if (autoSendWA) extras.auto_send_wa = true;

      const r = await uploadVisaResult(p.id, resultPhotoUrl, resultType, extras);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(`✓ Hasil visa ${resultType} tersimpan${r.wa_sent ? ' + WA auto-sent' : ''} untuk ${c.name}`);
      setShowUploadResult(false);
      router.refresh();
    });
  }

  const visaResult = p.visa_result;

  return (
    <div className="p-4 hover:bg-slate-50">
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={isSelected} onChange={onToggleSelect} className="mt-1 w-4 h-4 accent-blue-600" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800">{c.name || `#${p.id}`}</span>
              {c.phone && <span className="text-xs text-slate-500">📞 {c.phone}</span>}
              {p.family_group_id && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-800">👨‍👩 Family</span>}
              {visaResult === 'approved' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">✅ Approved</span>}
              {visaResult === 'rejected' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">❌ Rejected</span>}
              {p.visa_biometric_time && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                  ⏰ {fmtTime(p.visa_biometric_time)}
                </span>
              )}
            </div>
            <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs font-semibold text-amber-700 hover:underline">
              {expanded ? '▾ Tutup' : '▸ Expand'}
            </button>
          </div>

          {/* Quick summary */}
          <div className="mt-1 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="bg-amber-50 rounded px-2 py-1">
              <p className="text-[10px] text-amber-700 font-semibold">🔬 Biometrik</p>
              <p className="font-bold text-amber-800">{fmtRp(biometricCost)}</p>
            </div>
            <div className="bg-purple-50 rounded px-2 py-1">
              <p className="text-[10px] text-purple-700 font-semibold">🛂 Visa</p>
              <p className="font-bold text-purple-800">{fmtRp(visaCost)}</p>
            </div>
            <div className="bg-indigo-50 rounded px-2 py-1">
              <p className="text-[10px] text-indigo-700 font-semibold">⏰ Jam Biometrik</p>
              <p className="font-bold text-indigo-800">{fmtTime(p.visa_biometric_time)}</p>
            </div>
            <div className="bg-blue-50 rounded px-2 py-1">
              <p className="text-[10px] text-blue-700 font-semibold">📤 Token</p>
              <p className="text-[11px] font-mono text-blue-800 truncate">{p.visa_upload_token || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded px-2 py-1">
              <p className="text-[10px] text-slate-600 font-semibold">📸 Foto Hasil</p>
              <p className="text-[11px] text-slate-700">{p.visa_result_photo_url ? '✓ Ada' : '—'}</p>
            </div>
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              {/* R215n — Jam Biometrik per Pax */}
              <div className="p-3 bg-indigo-50 rounded border border-indigo-200 space-y-2">
                <p className="text-xs font-bold text-indigo-800 uppercase">⏰ Jam Biometrik (per peserta)</p>
                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    value={biometricTime}
                    onChange={(e) => setBiometricTime(e.target.value)}
                    className="px-3 py-1.5 border border-slate-300 rounded text-sm"
                  />
                  <button type="button" onClick={handleSaveBiometricTime} disabled={pending} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded">
                    💾 Simpan Jam
                  </button>
                  {p.visa_biometric_date && (
                    <span className="text-xs text-slate-600">
                      📅 Tanggal: {new Date(p.visa_biometric_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500">
                  ℹ Tanggal biometrik di-set di card peserta atas (VisaMatrix). Jam biometrik di sini per peserta (bisa beda-beda).
                </p>
              </div>

              {/* Cost editing */}
              <div className="p-3 bg-amber-50 rounded border border-amber-200 space-y-2">
                <p className="text-xs font-bold text-amber-800 uppercase">💰 Cost & Request DP</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block">🔬 Biaya Biometrik (Rp/pax)</label>
                    <div className="flex gap-1">
                      <input type="number" value={biometricCost} onChange={(e) => setBiometricCost(e.target.value)} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm font-mono" />
                      <button type="button" onClick={() => handleSaveCost('biometric')} disabled={pending} className="px-2 py-1 bg-slate-500 hover:bg-slate-600 text-white text-xs font-bold rounded">💾</button>
                      <button type="button" onClick={() => handleRequestDP('biometric')} disabled={pending} className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded">💰 DP</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block">🛂 Biaya Visa (Rp/pax)</label>
                    <div className="flex gap-1">
                      <input type="number" value={visaCost} onChange={(e) => setVisaCost(e.target.value)} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm font-mono" />
                      <button type="button" onClick={() => handleSaveCost('visa')} disabled={pending} className="px-2 py-1 bg-slate-500 hover:bg-slate-600 text-white text-xs font-bold rounded">💾</button>
                      <button type="button" onClick={() => handleRequestDP('visa')} disabled={pending} className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded">💰 DP</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Single send WA */}
              <div className="p-3 bg-blue-50 rounded border border-blue-200 space-y-2">
                <p className="text-xs font-bold text-blue-800 uppercase">📨 Send WA Individual</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] font-semibold text-slate-600 block">Template</label>
                    <select value={singleTemplate} onChange={(e) => setSingleTemplate(e.target.value)} className="w-full px-2 py-1 border border-slate-300 rounded text-sm bg-white">
                      {TEMPLATE_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  {singleTemplate === 'doc_kurang' && (
                    <div className="flex-1 min-w-[200px]">
                      <input type="text" placeholder="Dokumen kurang" value={singleCustomVars.list_dokumen_kurang || ''} onChange={(e) => setSingleCustomVars({ list_dokumen_kurang: e.target.value })} className="w-full px-2 py-1 border border-slate-300 rounded text-sm" />
                    </div>
                  )}
                  <button type="button" onClick={handleSendSingle} disabled={pending} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded">📨 Send</button>
                </div>
              </div>

              {!trip.visa_needs_biometric && (
                <div className="p-3 bg-cyan-50 rounded border border-cyan-200">
                  <p className="text-xs font-bold text-cyan-800 uppercase mb-1">🔗 Self-Upload Portal</p>
                  <div className="flex gap-2 items-center">
                    <button type="button" onClick={handleGenerateToken} disabled={pending} className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded">
                      🎟 Generate Upload Token
                    </button>
                    {p.visa_upload_token && <span className="text-[10px] font-mono text-slate-600">/visa/upload/{p.visa_upload_token}</span>}
                  </div>
                </div>
              )}

              <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <p className="text-xs font-bold text-emerald-800 uppercase">📸 Hasil Visa</p>
                  <button type="button" onClick={() => setShowUploadResult((v) => !v)} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded">
                    {showUploadResult ? '✕ Tutup' : '📷 Upload Hasil Visa'}
                  </button>
                </div>
                {showUploadResult && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" checked={resultType === 'approved'} onChange={() => setResultType('approved')} />
                        <span className="text-xs font-semibold text-emerald-800">✅ Approved</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input type="radio" checked={resultType === 'rejected'} onChange={() => setResultType('rejected')} />
                        <span className="text-xs font-semibold text-red-800">❌ Rejected</span>
                      </label>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-600 block">URL Foto Hasil (upload ke Drive / Supabase storage)</label>
                      <input type="url" value={resultPhotoUrl} onChange={(e) => setResultPhotoUrl(e.target.value)} placeholder="https://..." className="w-full px-2 py-1 border border-slate-300 rounded text-sm" />
                    </div>
                    {resultType === 'approved' && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <input type="date" value={resultValidFrom} onChange={(e) => setResultValidFrom(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
                        <input type="date" value={resultValidUntil} onChange={(e) => setResultValidUntil(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
                        <select value={resultEntryType} onChange={(e) => setResultEntryType(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm bg-white">
                          <option value="single">Single Entry</option>
                          <option value="multiple">Multiple Entry</option>
                        </select>
                        <input type="text" placeholder="Kurir" value={resultReturnKurir} onChange={(e) => setResultReturnKurir(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
                        <input type="text" placeholder="No Resi" value={resultReturnResi} onChange={(e) => setResultReturnResi(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm col-span-2" />
                      </div>
                    )}
                    {resultType === 'rejected' && (
                      <textarea value={resultRejReason} onChange={(e) => setResultRejReason(e.target.value)} placeholder="Alasan penolakan" rows="2" className="w-full px-2 py-1 border border-slate-300 rounded text-sm" />
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={autoSendWA} onChange={(e) => setAutoSendWA(e.target.checked)} />
                      <span className="text-xs font-semibold">📨 Auto-send WA hasil ke peserta (foto attached)</span>
                    </label>
                    <button type="button" onClick={handleSaveResult} disabled={pending} className="w-full px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded">
                      {pending ? '⏳' : '💾 Simpan Hasil' + (autoSendWA ? ' + Send WA' : '')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
