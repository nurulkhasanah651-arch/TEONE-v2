'use client';

// R215o: Template editor — CS bisa edit kata-kata WA per template
// Path: components/visa/VisaTemplateEditor.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTripMessageTemplate } from '@/lib/actions/visa-storage';
import { VISA_WA_TEMPLATES, getRawTemplateText, isDefaultTemplate, getTemplateOptions } from '@/lib/utils/visa-templates';

const TEMPLATE_OPTIONS = getTemplateOptions();

const AVAILABLE_VARS = [
  { key: 'nama_peserta', desc: 'Nama peserta' },
  { key: 'nama_trip', desc: 'Nama trip' },
  { key: 'country_name', desc: 'Negara visa' },
  { key: 'tanggal_keberangkatan', desc: 'Tgl berangkat' },
  { key: 'tanggal_biometrik', desc: 'Tgl biometrik (per pax)' },
  { key: 'jam_biometrik', desc: 'Jam biometrik (per pax)' },
  { key: 'lokasi_biometrik', desc: 'Lokasi biometrik' },
  { key: 'pickup_address', desc: 'Alamat kantor TE' },
  { key: 'deadline_dokumen', desc: 'Deadline dokumen' },
  { key: 'pdf_syarat_visa_url', desc: 'Link PDF syarat' },
  { key: 'pdf_template_dokumen_url', desc: 'Link PDF template' },
  { key: 'upload_portal_url', desc: 'Link upload portal (no-biometric)' },
  { key: 'list_dokumen_kurang', desc: 'List dokumen kurang' },
  { key: 'visa_valid_from', desc: 'Validity from (approved)' },
  { key: 'visa_valid_until', desc: 'Validity until (approved)' },
  { key: 'visa_entry_type', desc: 'Entry type (single/multiple)' },
  { key: 'rejection_reason', desc: 'Alasan reject' },
  { key: 'biometric_section', desc: 'Section jadwal biometrik (auto)' },
  { key: 'return_section', desc: 'Section pengiriman paspor (auto, based on return_method)' },
  { key: 'list_nama_anggota_family', desc: 'List nama anggota family' },
];

export default function VisaTemplateEditor({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState('doc_collection');
  const [editText, setEditText] = useState(() => getRawTemplateText('doc_collection', trip));
  const [msg, setMsg] = useState(null);

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 4000);
  }

  function handleTabChange(key) {
    setActiveKey(key);
    setEditText(getRawTemplateText(key, trip));
    setMsg(null);
  }

  function handleResetToDefault() {
    if (!confirm('Reset template ini ke default? Custom edit akan hilang.')) return;
    startTransition(async () => {
      const r = await updateTripMessageTemplate(trip.id, activeKey, '');
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg('✓ Template direset ke default');
      setEditText(VISA_WA_TEMPLATES[activeKey]?.template || '');
      router.refresh();
    });
  }

  function handleSave() {
    startTransition(async () => {
      const r = await updateTripMessageTemplate(trip.id, activeKey, editText);
      if (r?.error) { showMsg(r.error, 'error'); return; }
      showMsg(r.is_default ? '✓ Empty — pakai default lagi' : '✓ Template tersimpan (override active)');
      router.refresh();
    });
  }

  function insertVar(varKey) {
    const cursor = `{{${varKey}}}`;
    setEditText((t) => t + ' ' + cursor);
  }

  const isUsingOverride = !isDefaultTemplate(activeKey, trip);

  return (
    <div className="bg-white rounded-xl border-2 border-cyan-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-cyan-50 to-teal-50 border-b border-cyan-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-cyan-800 flex items-center gap-2">
              <span>📝</span> Editor Template Pesan WA Visa
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              CS bisa edit isi pesan per template. Empty = pakai default. Variable {`{{nama}}`} auto-replace.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-600 text-white text-xs font-bold rounded"
          >
            {open ? '✕ Tutup' : '✏ Edit Template'}
          </button>
        </div>
      </div>

      {open && (
        <div className="p-4 space-y-3">
          {msg && (
            <div className={`p-2 rounded text-xs ${msg.type === 'error' ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}`}>
              {msg.text}
            </div>
          )}

          {/* Template tabs */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
            {TEMPLATE_OPTIONS.map((opt) => {
              const isOverride = !isDefaultTemplate(opt.key, trip);
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleTabChange(opt.key)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded transition ${
                    activeKey === opt.key
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {opt.label}
                  {isOverride && <span className="ml-1 text-amber-400">✏</span>}
                </button>
              );
            })}
          </div>

          <p className="text-[10px] text-slate-500">
            ℹ Tab dgn tanda <span className="text-amber-600 font-bold">✏</span> = ada custom override
          </p>

          {/* Variables sidebar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-1 p-3 bg-slate-50 rounded border border-slate-200 max-h-80 overflow-auto">
              <p className="text-[10px] font-bold text-slate-700 uppercase mb-2">📋 Variable Tersedia (klik insert)</p>
              <div className="space-y-1">
                {AVAILABLE_VARS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key)}
                    className="block w-full text-left p-1.5 bg-white rounded border border-slate-200 hover:bg-cyan-50 hover:border-cyan-300 text-[10px]"
                  >
                    <span className="font-mono font-bold text-cyan-700">{`{{${v.key}}}`}</span>
                    <span className="block text-slate-500">{v.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Editor */}
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-bold text-slate-700">
                  Editing: {VISA_WA_TEMPLATES[activeKey]?.label || activeKey}
                  {isUsingOverride && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded">CUSTOM</span>}
                  {!isUsingOverride && <span className="ml-2 text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded">DEFAULT</span>}
                </p>
                {isUsingOverride && (
                  <button
                    type="button"
                    onClick={handleResetToDefault}
                    disabled={pending}
                    className="text-[10px] font-semibold px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 rounded"
                  >
                    ↺ Reset Default
                  </button>
                )}
              </div>
              <textarea autoComplete="off"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows="20"
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-mono"
                placeholder="Edit isi pesan template di sini. Pakai {{variable}} untuk auto-replace."
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditText(VISA_WA_TEMPLATES[activeKey]?.template || '')}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded"
                >
                  📋 Load Default
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={pending}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-bold rounded"
                >
                  {pending ? '⏳' : '💾 Simpan Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
