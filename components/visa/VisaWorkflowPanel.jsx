'use client';

// R215m+R215n+R215o+R215q: Visa Workflow Panel + BULK SEND PREVIEW MODAL
// R215q: Confirmation modal sebelum kirim bulk WA — preview message + list peserta
// Path: components/visa/VisaWorkflowPanel.jsx

import { useState, useTransition, useRef, useMemo } from 'react';
import { compressImage } from '@/lib/utils/compress-image';
import { useRouter } from 'next/navigation';
import {
  updatePassengerVisaCost,
  updatePassengerBiometricTime,
  updatePassengerDocShortage,
  requestVisaCostToFinance,
  sendVisaWA,
  uploadVisaResult,
  generateUploadToken,
} from '@/lib/actions/visa-workflow';
import { uploadVisaResultFile, updateVisaReturnMethod } from '@/lib/actions/visa-storage';
import { getTemplateOptions, renderTemplate, VISA_WA_TEMPLATES, autoDeadlineDoc } from '@/lib/utils/visa-templates';

function fmtRp(n) { return `Rp ${Number(n || 0).toLocaleString('id-ID')}`; }
function fmtTime(t) { if (!t) return '—'; return String(t).slice(0, 5); }

const TEMPLATE_OPTIONS = getTemplateOptions();
const RETURN_METHODS = [
  { value: 'kurir', label: '📦 Kirim via Kurir (JNE/SiCepat)', desc: 'Paspor dikirim ke alamat peserta' },
  { value: 'team_carry', label: '✈ Dibawa Tim Saat Trip', desc: 'Paspor dibawa tim, diserahkan saat meeting point' },
  { value: 'office_pickup', label: '🏢 Diambil di Kantor', desc: 'Peserta ambil sendiri di kantor TE saat jam kerja' },
];

export default function VisaWorkflowPanel({ trip, passengers = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkTemplate, setBulkTemplate] = useState('doc_collection');
  const [bulkFamilyAware, setBulkFamilyAware] = useState(true);
  const [bulkCustomDokKurang, setBulkCustomDokKurang] = useState('');

  // R215q — Preview modal state
  const [previewOpen, setPreviewOpen] = useState(false);

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

  // R215q — Open preview instead of direct send
  function handleOpenPreview() {
    if (selectedIds.size === 0) { showMsg('Pilih minimal 1 peserta', 'error'); return; }
    setPreviewOpen(true);
  }

  // R215q — Confirm & actually send
  function handleConfirmSend() {
    const ids = Array.from(selectedIds);
    startTransition(async () => {
      const r = await sendVisaWA({
        tripId: trip.id, passengerIds: ids,
        templateKey: bulkTemplate,
        customVars: bulkCustomDokKurang ? { list_dokumen_kurang: bulkCustomDokKurang } : {},
        familyAware: bulkFamilyAware,
      });
      if (r?.error) { showMsg('Gagal: ' + r.error, 'error'); return; }
      const switched = r.template_switched ? ` (auto-switched to ${r.template_used})` : '';
      showMsg(`✓ Bulk: ${r.sent} sukses, ${r.failed} gagal${r.family_aware ? ` · Family-aware (${r.family_count})` : ''}${switched}`);
      setPreviewOpen(false);
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-amber-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
        <h2 className="font-bold text-amber-800 flex items-center gap-2">
          <span>📨</span> Visa Workflow (Cost · WA · Hasil)
        </h2>
        <p className="text-[11px] text-slate-600 mt-0.5">
          ✨ R215q: Bulk send AUTO + preview modal · Token auto-generated · No biometric auto-switch
        </p>
      </div>

      {msg && (
        <div className={`px-5 py-3 text-sm border-b flex items-start justify-between gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-800 border-red-200 font-medium' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          <span className="flex-1">{msg.text}</span>
          {msg.type === 'error' && <button type="button" onClick={() => setMsg(null)} className="text-xs px-2 py-0.5 bg-white border border-red-300 rounded">✕</button>}
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
            <input autoComplete="off" type="checkbox" checked={bulkFamilyAware} onChange={(e) => setBulkFamilyAware(e.target.checked)} />
            <span className="font-semibold text-blue-700">👨‍👩 Family-aware</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px]">
            <select value={bulkTemplate} onChange={(e) => setBulkTemplate(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white">
              {TEMPLATE_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {trip.visa_needs_biometric === false && bulkTemplate === 'doc_collection' && (
              <p className="text-[10px] text-emerald-700 mt-1">✨ Auto: switch ke No-Biometric + auto-gen token tiap pax</p>
            )}
          </div>
          {bulkTemplate === 'doc_kurang' && (
            <div className="flex-1 min-w-[200px]">
              <input autoComplete="off" type="text" value={bulkCustomDokKurang} onChange={(e) => setBulkCustomDokKurang(e.target.value)} placeholder="Dokumen kurang" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
            </div>
          )}
          {/* R215q — Klik buka preview dulu (BUKAN langsung send) */}
          <button type="button" onClick={handleOpenPreview} disabled={pending || selectedIds.size === 0} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded">
            👀 Preview & Send
          </button>
        </div>
      </div>

      {/* R215q — Preview Modal */}
      {previewOpen && (
        <BulkWAPreviewModal
          trip={trip}
          passengers={passengers}
          selectedIds={selectedIds}
          templateKey={bulkTemplate}
          familyAware={bulkFamilyAware}
          customVars={bulkCustomDokKurang ? { list_dokumen_kurang: bulkCustomDokKurang } : {}}
          onCancel={() => setPreviewOpen(false)}
          onConfirm={handleConfirmSend}
          pending={pending}
        />
      )}

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

// ============================================================
// R215q — Preview Modal
// ============================================================
function BulkWAPreviewModal({ trip, passengers, selectedIds, templateKey, familyAware, customVars, onCancel, onConfirm, pending }) {
  // Determine effective template (auto-switch detection)
  let effectiveTemplate = templateKey;
  let autoSwitched = false;
  if (templateKey === 'doc_collection' && trip.visa_needs_biometric === false) {
    effectiveTemplate = 'doc_collection_no_biometric';
    autoSwitched = true;
  }

  // Determine target peserta (apply family-aware dedup)
  const selected = passengers.filter((p) => selectedIds.has(p.id));
  let targets = selected;
  let familyDedupCount = 0;
  if (familyAware) {
    const seen = new Set();
    targets = selected.filter((p) => {
      if (p.family_group_id) {
        if (seen.has(p.family_group_id)) {
          familyDedupCount++;
          return false;
        }
        seen.add(p.family_group_id);
      }
      return true;
    });
  }

  // Count yg perlu auto-gen token
  const needsTokenCount = effectiveTemplate === 'doc_collection_no_biometric'
    ? targets.filter((p) => !p.visa_upload_token).length
    : 0;

  // Count peserta tanpa phone
  const noPhoneCount = targets.filter((p) => !p.customers?.phone).length;

  // Sample message rendering (pakai data peserta pertama)
  const samplePax = targets[0];
  const sampleCust = samplePax?.customers || {};
  const deadlineDoc = trip.visa_deadline_doc || autoDeadlineDoc(trip.departure);

  const sampleToken = samplePax?.visa_upload_token || '{{AKAN_AUTO_GENERATE}}';
  const siteUrl = typeof window !== 'undefined' ? window.location.origin : 'https://teone.dev';

  const sampleVars = {
    nama_peserta: sampleCust.name || 'Peserta',
    nama_kepala_keluarga: sampleCust.name || 'Peserta',
    list_nama_anggota_family: sampleCust.name || '',
    nama_trip: trip.name,
    country_name: trip.visa_country || 'Negara Tujuan',
    tanggal_keberangkatan: trip.departure,
    tanggal_biometrik: samplePax?.visa_biometric_date || trip.visa_biometric_date,
    jam_biometrik: samplePax?.visa_biometric_time || null,
    lokasi_biometrik: trip.visa_biometric_location,
    field_team_phone: trip.visa_field_team_phone,
    pickup_address: trip.visa_pickup_address,
    pdf_syarat_visa_url: trip.visa_pdf_syarat_url,
    pdf_template_dokumen_url: trip.visa_pdf_template_url,
    list_dokumen: trip.visa_doc_template,   // SINKRON dgn Template Dokumen Visa
    deadline_dokumen: deadlineDoc,
    upload_portal_url: `${siteUrl}/visa/upload/${sampleToken}`,
    return_method: samplePax?.visa_return_method || 'kurir',
    visa_valid_from: samplePax?.visa_valid_from,
    visa_valid_until: samplePax?.visa_valid_until,
    visa_entry_type: samplePax?.visa_entry_type,
    return_kurir: samplePax?.visa_return_kurir,
    return_resi: samplePax?.visa_return_resi,
    rejection_reason: samplePax?.visa_rejection_reason,
    visa_photo_url: samplePax?.visa_result_photo_url ? '(link aman 7 hari — dibuat otomatis saat kirim)' : null,
    list_dokumen_kurang: samplePax?.visa_docs_shortage || undefined,
    ...customVars,
  };

  const sampleMessage = samplePax ? renderTemplate(effectiveTemplate, sampleVars, trip) : '';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">👀 Preview Bulk WA Send</h2>
            <p className="text-xs text-blue-100">Cek dulu sebelum kirim ke {targets.length} peserta</p>
          </div>
          <button type="button" onClick={onCancel} className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-bold">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2 bg-blue-50 rounded border border-blue-200">
              <p className="text-[10px] font-bold text-blue-700 uppercase">📋 Template</p>
              <p className="font-bold text-blue-800 text-[11px]">{VISA_WA_TEMPLATES[effectiveTemplate]?.label || effectiveTemplate}</p>
              {autoSwitched && <p className="text-[9px] text-emerald-700 mt-0.5">✨ Auto-switched (no-biometric)</p>}
            </div>
            <div className="p-2 bg-emerald-50 rounded border border-emerald-200">
              <p className="text-[10px] font-bold text-emerald-700 uppercase">📤 Target Send</p>
              <p className="font-bold text-emerald-800">{targets.length} peserta</p>
              {familyAware && familyDedupCount > 0 && <p className="text-[9px] text-amber-700 mt-0.5">👨‍👩 {familyDedupCount} family dedup</p>}
            </div>
            <div className="p-2 bg-amber-50 rounded border border-amber-200">
              <p className="text-[10px] font-bold text-amber-700 uppercase">🎟 Auto-gen Token</p>
              <p className="font-bold text-amber-800">{needsTokenCount} peserta</p>
              <p className="text-[9px] text-slate-500 mt-0.5">{targets.length - needsTokenCount} udah punya</p>
            </div>
            <div className={`p-2 rounded border ${noPhoneCount > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <p className={`text-[10px] font-bold uppercase ${noPhoneCount > 0 ? 'text-red-700' : 'text-slate-600'}`}>📞 Phone Status</p>
              <p className={`font-bold ${noPhoneCount > 0 ? 'text-red-800' : 'text-slate-700'}`}>
                {noPhoneCount > 0 ? `${noPhoneCount} TANPA phone` : '✓ Semua ada'}
              </p>
            </div>
          </div>

          {/* Target list */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <p className="px-3 py-2 text-xs font-bold text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
              👥 Peserta yang akan dikirim ({targets.length})
            </p>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1">No</th>
                    <th className="px-2 py-1">Nama</th>
                    <th className="px-2 py-1">Phone</th>
                    <th className="px-2 py-1">Family</th>
                    <th className="px-2 py-1">Token</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((p, idx) => {
                    const cust = p.customers || {};
                    return (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-2 py-1 text-slate-500">{idx + 1}</td>
                        <td className="px-2 py-1 font-semibold">{cust.name || `#${p.id}`}</td>
                        <td className={`px-2 py-1 ${cust.phone ? 'text-slate-700' : 'text-red-600 font-bold'}`}>
                          {cust.phone || '⚠ Gak ada'}
                        </td>
                        <td className="px-2 py-1 text-[10px] text-slate-500">{p.family_group_id ? '👨‍👩' : '—'}</td>
                        <td className="px-2 py-1 text-[10px] font-mono text-slate-500">
                          {p.visa_upload_token ? '✓ Ada' : (effectiveTemplate === 'doc_collection_no_biometric' ? '🎟 Auto-gen' : '—')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sample message preview */}
          {samplePax && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <p className="px-3 py-2 text-xs font-bold text-slate-700 uppercase bg-slate-50 border-b border-slate-200">
                💬 Sample Message (pakai data: {samplePax.customers?.name || `#${samplePax.id}`})
              </p>
              <div className="p-4 bg-gradient-to-b from-emerald-50 to-white">
                <pre className="text-xs text-slate-800 whitespace-pre-wrap font-sans">{sampleMessage}</pre>
              </div>
              <p className="px-3 py-2 text-[10px] text-slate-500 italic bg-slate-50 border-t border-slate-200">
                ℹ Setiap peserta akan dapat message yg sama dgn data MASING-MASING (nama, link upload unique, dll).
              </p>
            </div>
          )}

          {noPhoneCount > 0 && (
            <div className="p-3 bg-red-50 border border-red-300 rounded text-xs text-red-800">
              ⚠ Ada {noPhoneCount} peserta TANPA phone — mereka akan SKIP saat kirim. Update phone di Master Customer dulu.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-slate-600">
            ✨ Token auto-generated untuk {needsTokenCount} peserta · Family dedup: {familyDedupCount}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} disabled={pending} className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold rounded">
              ✕ Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={pending || targets.length === 0} className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded">
              {pending ? '⏳ Sending...' : `✓ Confirm & Send (${targets.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PER PESERTA ROW (TETAP SAMA dengan R215o)
// ============================================================
function PassengerWorkflowRow({ passenger, trip, isSelected, onToggleSelect, showMsg, pending, startTransition, router }) {
  const p = passenger;
  const c = p.customers || {};
  const fileInputRef = useRef(null);

  const [expanded, setExpanded] = useState(false);
  const [biometricCost, setBiometricCost] = useState(p.visa_biometric_cost ?? trip.visa_default_biometric_cost ?? 0);
  const [visaCost, setVisaCost] = useState(p.visa_visa_cost ?? trip.visa_default_visa_cost ?? 0);
  const [biometricTime, setBiometricTime] = useState(p.visa_biometric_time || '');
  const [biometricDate, setBiometricDate] = useState(p.visa_biometric_date || '');
  const [docShortage, setDocShortage] = useState(p.visa_docs_shortage || '');
  const [singleTemplate, setSingleTemplate] = useState('doc_collection');
  const [singleCustomVars, setSingleCustomVars] = useState({});

  const [showUploadResult, setShowUploadResult] = useState(false);
  const [resultType, setResultType] = useState('approved');
  const [uploadedFileUrl, setUploadedFileUrl] = useState('');
  const [uploadedFilePath, setUploadedFilePath] = useState(p.visa_result_photo_url || '');
  const [uploading, setUploading] = useState(false);
  const [resultValidFrom, setResultValidFrom] = useState(p.visa_valid_from || '');
  const [resultValidUntil, setResultValidUntil] = useState(p.visa_valid_until || '');
  const [resultEntryType, setResultEntryType] = useState(p.visa_entry_type || 'multiple');
  const [resultReturnMethod, setResultReturnMethod] = useState(p.visa_return_method || 'kurir');
  const [resultReturnKurir, setResultReturnKurir] = useState(p.visa_return_kurir || 'JNE');
  const [resultReturnResi, setResultReturnResi] = useState(p.visa_return_resi || '');
  const [resultRejReason, setResultRejReason] = useState(p.visa_rejection_reason || '');
  const [autoSendWA, setAutoSendWA] = useState(true);

  function handleSaveCost(type) {
    const amount = type === 'biometric' ? biometricCost : visaCost;
    startTransition(async () => {
      const r = await updatePassengerVisaCost(p.id, type, Number(amount) || 0);
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg(`✓ Cost ${type} tersimpan`); router.refresh(); }
    });
  }
  function handleRequestDP(type) {
    const amount = type === 'biometric' ? biometricCost : visaCost;
    if (!amount || amount <= 0) { showMsg(`Set cost ${type} dulu`, 'error'); return; }
    startTransition(async () => {
      const r = await requestVisaCostToFinance(p.id, type, Number(amount), null, `${type} ${c.name}`);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(`✓ ${r.message}`);
      router.refresh();
    });
  }
  function handleSaveBiometricTime() {
    startTransition(async () => {
      const r = await updatePassengerBiometricTime(p.id, biometricTime, biometricDate);
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg(`✓ Jam biometrik tersimpan`); router.refresh(); }
    });
  }
  function handleSaveDocShortage() {
    startTransition(async () => {
      const r = await updatePassengerDocShortage(p.id, docShortage);
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg(`✓ Kekurangan dokumen tersimpan`); router.refresh(); }
    });
  }
  function handleSendDocShortage() {
    if (!docShortage || !docShortage.trim()) { showMsg('Isi kekurangan dokumen dulu', 'error'); return; }
    startTransition(async () => {
      // simpan dulu biar pesan ikut yg terbaru
      const sv = await updatePassengerDocShortage(p.id, docShortage);
      if (sv?.error) { showMsg(sv.error, 'error'); return; }
      const r = await sendVisaWA({
        tripId: trip.id, passengerIds: [p.id], templateKey: 'doc_kurang', customVars: {}, familyAware: false,
      });
      if (r?.error) showMsg(r.error, 'error');
      else { showMsg(`✓ WA Kekurangan Dokumen terkirim ke ${c.name}`); router.refresh(); }
    });
  }
  function handleSendSingle() {
    startTransition(async () => {
      const r = await sendVisaWA({
        tripId: trip.id, passengerIds: [p.id], templateKey: singleTemplate,
        customVars: singleCustomVars, familyAware: false,
      });
      if (r?.error) showMsg(r.error, 'error');
      else {
        const switched = r.template_switched ? ` (auto-switched to ${r.template_used})` : '';
        showMsg(`✓ WA terkirim ke ${c.name}${switched}`);
        router.refresh();
      }
    });
  }
  function handleGenerateToken() {
    startTransition(async () => {
      const r = await generateUploadToken(p.id);
      if (r?.error) showMsg(r.error, 'error');
      else {
        if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(r.upload_url);
        showMsg(`✓ Token ter-generate (URL di-copy)`);
        router.refresh();
      }
    });
  }
  async function handleFileUpload(e) {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await compressImage(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('visa_file', file);
      const r = await uploadVisaResultFile(p.id, fd);
      if (r?.error) showMsg('Upload gagal: ' + r.error, 'error');
      else { setUploadedFileUrl(r.file_url || ''); setUploadedFilePath(r.file_path || ''); showMsg(`✓ File uploaded`); }
    } catch (e) {
      showMsg('Upload error: ' + e.message, 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }
  function handleSaveResult() {
    if (!uploadedFilePath && !confirm('Belum upload file. Save tanpa file?')) return;
    startTransition(async () => {
      const extras = {};
      if (resultType === 'approved') {
        if (resultValidFrom) extras.valid_from = resultValidFrom;
        if (resultValidUntil) extras.valid_until = resultValidUntil;
        if (resultEntryType) extras.entry_type = resultEntryType;
        if (resultReturnMethod) extras.return_method = resultReturnMethod;
        if (resultReturnMethod === 'kurir') {
          if (resultReturnKurir) extras.return_kurir = resultReturnKurir;
          if (resultReturnResi) extras.return_resi = resultReturnResi;
        }
      }
      if (resultType === 'rejected' && resultRejReason) extras.rejection_reason = resultRejReason;
      if (autoSendWA) extras.auto_send_wa = true;

      const r = await uploadVisaResult(p.id, uploadedFilePath, resultType, extras);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(`✓ Hasil ${resultType}${r.wa_sent ? ' + WA sent' : ''}`);
      setShowUploadResult(false);
      router.refresh();
    });
  }

  return (
    <div className="p-4 hover:bg-slate-50">
      <div className="flex items-start gap-3">
        <input autoComplete="off" type="checkbox" checked={isSelected} onChange={onToggleSelect} className="mt-1 w-4 h-4 accent-blue-600" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800">{c.name || `#${p.id}`}</span>
              {c.phone && <span className="text-xs text-slate-500">📞 {c.phone}</span>}
              {p.family_group_id && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-pink-100 text-pink-800">👨‍👩 Family</span>}
              {p.visa_result === 'approved' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">✅ Approved</span>}
              {p.visa_result === 'rejected' && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-800">❌ Rejected</span>}
              {p.visa_biometric_time && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">⏰ {fmtTime(p.visa_biometric_time)}</span>}
              {p.visa_upload_token && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-cyan-100 text-cyan-800">🎟 Token Ready</span>}
            </div>
            <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs font-semibold text-amber-700 hover:underline">
              {expanded ? '▾ Tutup' : '▸ Expand'}
            </button>
          </div>

          <div className="mt-1 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
            <div className="bg-amber-50 rounded px-2 py-1"><p className="text-[10px] text-amber-700 font-semibold">🔬 Biometrik</p><p className="font-bold text-amber-800">{fmtRp(biometricCost)}</p></div>
            <div className="bg-purple-50 rounded px-2 py-1"><p className="text-[10px] text-purple-700 font-semibold">🛂 Visa</p><p className="font-bold text-purple-800">{fmtRp(visaCost)}</p></div>
            <div className="bg-indigo-50 rounded px-2 py-1"><p className="text-[10px] text-indigo-700 font-semibold">⏰ Jam</p><p className="font-bold text-indigo-800">{fmtTime(p.visa_biometric_time)}</p></div>
            <div className="bg-blue-50 rounded px-2 py-1"><p className="text-[10px] text-blue-700 font-semibold">📤 Token</p><p className="text-[11px] font-mono text-blue-800 truncate">{p.visa_upload_token ? '✓ Ada' : '—'}</p></div>
            <div className="bg-slate-50 rounded px-2 py-1"><p className="text-[10px] text-slate-600 font-semibold">📸 File</p><p className="text-[11px] text-slate-700">{p.visa_result_photo_url ? '✓ Ada' : '—'}</p></div>
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              <div className="p-3 bg-indigo-50 rounded border border-indigo-200">
                <p className="text-xs font-bold text-indigo-800 uppercase mb-1">📅 Tanggal & ⏰ Jam Biometrik</p>
                <div className="flex gap-2 items-center flex-wrap">
                  <div><span className="block text-[10px] text-indigo-600 font-semibold">Tanggal</span>
                    <input autoComplete="off" type="date" value={biometricDate} onChange={(e) => setBiometricDate(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
                  <div><span className="block text-[10px] text-indigo-600 font-semibold">Jam</span>
                    <input autoComplete="off" type="time" value={biometricTime} onChange={(e) => setBiometricTime(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded text-sm" /></div>
                  <button type="button" onClick={handleSaveBiometricTime} disabled={pending} className="self-end px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold rounded">💾 Simpan</button>
                </div>
              </div>

              <div className="p-3 bg-rose-50 rounded border border-rose-200">
                <p className="text-xs font-bold text-rose-800 uppercase mb-1">⚠ Kekurangan Dokumen (per peserta, 1 per baris)</p>
                <textarea value={docShortage} onChange={(e) => setDocShortage(e.target.value)} rows={3}
                  placeholder={"cth:\nRekening koran 3 bulan terakhir\nSurat keterangan kerja"}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono leading-relaxed" />
                <div className="flex justify-end mt-1">
                  <button type="button" onClick={handleSaveDocShortage} disabled={pending} className="px-3 py-1.5 bg-slate-500 hover:bg-slate-600 text-white text-xs font-bold rounded">💾 Simpan</button>
                  <button type="button" onClick={handleSendDocShortage} disabled={pending} className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded">📨 Simpan + Kirim WA Kekurangan</button>
                </div>
                <p className="text-[10px] text-rose-700 mt-1">Auto masuk ke pesan WA "Kekurangan Dokumen" peserta ini (tidak bisa di-blast — kirim per peserta).</p>
              </div>

              <div className="p-3 bg-amber-50 rounded border border-amber-200">
                <p className="text-xs font-bold text-amber-800 uppercase mb-2">💰 Cost & Request Bayar ke Accounting</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block">🔬 Biometrik (Rp)</label>
                    <div className="flex gap-1">
                      <input autoComplete="off" type="number" value={biometricCost} onChange={(e) => setBiometricCost(e.target.value)} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm font-mono" />
                      <button type="button" onClick={() => handleSaveCost('biometric')} disabled={pending} className="px-2 py-1 bg-slate-500 text-white text-xs rounded">💾</button>
                      <button type="button" title="Request bayar biometrik ke Accounting (masuk HPP)" onClick={() => handleRequestDP('biometric')} disabled={pending} className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded">💰 Request</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-600 block">🛂 Visa (Rp)</label>
                    <div className="flex gap-1">
                      <input autoComplete="off" type="number" value={visaCost} onChange={(e) => setVisaCost(e.target.value)} className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm font-mono" />
                      <button type="button" onClick={() => handleSaveCost('visa')} disabled={pending} className="px-2 py-1 bg-slate-500 text-white text-xs rounded">💾</button>
                      <button type="button" title="Request bayar visa ke Accounting (masuk HPP)" onClick={() => handleRequestDP('visa')} disabled={pending} className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded">💰 Request</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded border border-blue-200">
                <p className="text-xs font-bold text-blue-800 uppercase mb-2">📨 Send WA</p>
                <div className="flex flex-wrap gap-2 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <select value={singleTemplate} onChange={(e) => setSingleTemplate(e.target.value)} className="w-full px-2 py-1 border border-slate-300 rounded text-sm bg-white">
                      {TEMPLATE_OPTIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  {singleTemplate === 'doc_kurang' && (
                    <input autoComplete="off" type="text" placeholder="Doc kurang" value={singleCustomVars.list_dokumen_kurang || ''} onChange={(e) => setSingleCustomVars({ list_dokumen_kurang: e.target.value })} className="flex-1 min-w-[200px] px-2 py-1 border border-slate-300 rounded text-sm" />
                  )}
                  <button type="button" onClick={handleSendSingle} disabled={pending} className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded">📨 Send</button>
                </div>
              </div>

              {!trip.visa_needs_biometric && (
                <div className="p-3 bg-cyan-50 rounded border border-cyan-200">
                  <p className="text-xs font-bold text-cyan-800 uppercase mb-1">🔗 Upload Portal (Manual)</p>
                  <div className="flex gap-2 items-center">
                    <button type="button" onClick={handleGenerateToken} disabled={pending} className="px-3 py-1 bg-cyan-600 text-white text-xs font-bold rounded">🎟 Generate Token</button>
                    {p.visa_upload_token && <span className="text-[10px] font-mono text-slate-600 truncate">{p.visa_upload_token}</span>}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">ℹ Sebenarnya gak perlu klik ini — bulk Send WA udah auto-gen token</p>
                </div>
              )}

              <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                  <p className="text-xs font-bold text-emerald-800 uppercase">📸 Hasil Visa</p>
                  <button type="button" onClick={() => setShowUploadResult((v) => !v)} className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded">
                    {showUploadResult ? '✕ Tutup' : '📷 Upload Hasil'}
                  </button>
                </div>
                {showUploadResult && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-1 cursor-pointer"><input autoComplete="off" type="radio" checked={resultType === 'approved'} onChange={() => setResultType('approved')} /><span className="text-xs font-semibold text-emerald-800">✅ Approved</span></label>
                      <label className="flex items-center gap-1 cursor-pointer"><input autoComplete="off" type="radio" checked={resultType === 'rejected'} onChange={() => setResultType('rejected')} /><span className="text-xs font-semibold text-red-800">❌ Rejected</span></label>
                    </div>
                    <div className="p-2 bg-white rounded border border-emerald-300">
                      <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">📤 Upload File (max 10MB)</label>
                      <input autoComplete="off" ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={handleFileUpload} disabled={uploading} className="w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-emerald-200 file:text-emerald-800 file:font-bold" />
                      {uploading && <p className="text-[10px] text-amber-700 mt-1">⏳ Uploading...</p>}
                      {uploadedFileUrl && !uploading && (
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] text-emerald-700">✓ File ready</span>
                          <a href={uploadedFileUrl} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700 hover:underline truncate">{uploadedFileUrl}</a>
                        </div>
                      )}
                    </div>
                    {resultType === 'approved' && (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          <input autoComplete="off" type="date" value={resultValidFrom} onChange={(e) => setResultValidFrom(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
                          <input autoComplete="off" type="date" value={resultValidUntil} onChange={(e) => setResultValidUntil(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
                          <select value={resultEntryType} onChange={(e) => setResultEntryType(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm bg-white">
                            <option value="single">Single Entry</option>
                            <option value="multiple">Multiple Entry</option>
                          </select>
                        </div>
                        <div className="p-2 bg-cyan-50 rounded border border-cyan-200">
                          <label className="text-[10px] font-bold text-cyan-800 uppercase block mb-1">🚚 Cara Pengiriman</label>
                          <div className="space-y-1">
                            {RETURN_METHODS.map((m) => (
                              <label key={m.value} className="flex items-start gap-2 cursor-pointer p-1.5 bg-white rounded">
                                <input autoComplete="off" type="radio" checked={resultReturnMethod === m.value} onChange={() => setResultReturnMethod(m.value)} className="mt-0.5" />
                                <div><p className="text-xs font-bold text-slate-800">{m.label}</p><p className="text-[10px] text-slate-500">{m.desc}</p></div>
                              </label>
                            ))}
                          </div>
                          {resultReturnMethod === 'kurir' && (
                            <div className="grid grid-cols-2 gap-2 mt-2">
                              <input autoComplete="off" type="text" placeholder="Kurir" value={resultReturnKurir} onChange={(e) => setResultReturnKurir(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
                              <input autoComplete="off" type="text" placeholder="No Resi" value={resultReturnResi} onChange={(e) => setResultReturnResi(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-sm" />
                            </div>
                          )}
                        </div>
                      </>
                    )}
                    {resultType === 'rejected' && (
                      <textarea autoComplete="off" value={resultRejReason} onChange={(e) => setResultRejReason(e.target.value)} placeholder="Alasan penolakan" rows="2" className="w-full px-2 py-1 border border-slate-300 rounded text-sm" />
                    )}
                    <label className="flex items-center gap-2 cursor-pointer"><input autoComplete="off" type="checkbox" checked={autoSendWA} onChange={(e) => setAutoSendWA(e.target.checked)} /><span className="text-xs font-semibold">📨 Auto-send WA + foto attached</span></label>
                    <button type="button" onClick={handleSaveResult} disabled={pending || uploading} className="w-full px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded">
                      {pending ? '⏳' : '💾 Simpan' + (autoSendWA ? ' + Send WA' : '')}
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
