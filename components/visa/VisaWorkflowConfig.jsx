'use client';

// R215m + R215n: Visa Workflow Config — REMOVE jam biometrik (sekarang per pax)
// Path: components/visa/VisaWorkflowConfig.jsx

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTripVisaConfig } from '@/lib/actions/visa-workflow';

function fmtRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

export default function VisaWorkflowConfig({ trip }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    visa_pdf_syarat_url: trip.visa_pdf_syarat_url || '',
    visa_pdf_template_url: trip.visa_pdf_template_url || '',
    visa_needs_biometric: trip.visa_needs_biometric !== false,
    visa_needs_physical_doc: trip.visa_needs_physical_doc !== false,
    visa_biometric_location: trip.visa_biometric_location || '',
    visa_pickup_address: trip.visa_pickup_address || '',
    visa_default_biometric_cost: trip.visa_default_biometric_cost || 0,
    visa_default_visa_cost: trip.visa_default_visa_cost || 0,
    visa_deadline_doc: trip.visa_deadline_doc || '',
  });

  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') setTimeout(() => setMsg(null), 6000);
  }

  function handleSave() {
    startTransition(async () => {
      const r = await updateTripVisaConfig(trip.id, {
        ...form,
        visa_default_biometric_cost: Number(form.visa_default_biometric_cost) || 0,
        visa_default_visa_cost: Number(form.visa_default_visa_cost) || 0,
        visa_deadline_doc: form.visa_deadline_doc || null,
      });
      if (r?.error) { showMsg('❌ Gagal: ' + r.error, 'error'); return; }
      if (r?.warning) {
        showMsg('⚠ Tersimpan dengan warning: ' + r.warning, 'error');
      } else {
        showMsg('✓ Config visa workflow tersimpan');
      }
      router.refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-purple-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-purple-800 flex items-center gap-2">
              <span>⚙</span> Visa Workflow Config
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Trip-level: PDF syarat, default cost biometrik & visa, lokasi biometrik, alamat pickup
              <br />
              <span className="text-amber-700 font-semibold">⏰ Jam biometrik di-set per peserta (bukan di sini, di Workflow Panel bawah)</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold rounded"
          >
            {open ? '✕ Tutup' : '⚙ Edit Config'}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-5 py-3 text-sm border-b flex items-start justify-between gap-2 ${msg.type === 'error' ? 'bg-red-50 text-red-800 border-red-200 font-medium' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
          <span className="flex-1">{msg.text}</span>
          {msg.type === 'error' && (
            <button type="button" onClick={() => setMsg(null)} className="text-xs px-2 py-0.5 bg-white border border-red-300 rounded">✕</button>
          )}
        </div>
      )}

      {/* Summary view */}
      <div className="px-5 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="p-2 bg-slate-50 rounded">
          <p className="text-[10px] font-bold text-slate-600 uppercase">Biometrik?</p>
          <p className="font-bold text-slate-800">{form.visa_needs_biometric ? '✅ Perlu' : '❌ Gak Perlu'}</p>
        </div>
        <div className="p-2 bg-slate-50 rounded">
          <p className="text-[10px] font-bold text-slate-600 uppercase">Doc Fisik?</p>
          <p className="font-bold text-slate-800">{form.visa_needs_physical_doc ? '✅ Kirim Doc' : '📤 Upload Portal'}</p>
        </div>
        <div className="p-2 bg-amber-50 rounded">
          <p className="text-[10px] font-bold text-amber-700 uppercase">Default Biometrik</p>
          <p className="font-bold text-amber-800">{fmtRp(form.visa_default_biometric_cost)}</p>
        </div>
        <div className="p-2 bg-amber-50 rounded">
          <p className="text-[10px] font-bold text-amber-700 uppercase">Default Visa</p>
          <p className="font-bold text-amber-800">{fmtRp(form.visa_default_visa_cost)}</p>
        </div>
        {form.visa_pdf_syarat_url && (
          <div className="p-2 bg-blue-50 rounded col-span-2 md:col-span-4">
            <p className="text-[10px] font-bold text-blue-700 uppercase">📄 PDF Syarat</p>
            <a href={form.visa_pdf_syarat_url} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline truncate block">
              {form.visa_pdf_syarat_url}
            </a>
          </div>
        )}
      </div>

      {/* Edit form */}
      {open && (
        <div className="p-5 border-t border-slate-200 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">PDF Syarat URL</label>
              <input autoComplete="off"
                type="url"
                value={form.visa_pdf_syarat_url}
                onChange={(e) => setForm((f) => ({ ...f, visa_pdf_syarat_url: e.target.value }))}
                placeholder="https://..."
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">PDF Template Dokumen URL</label>
              <input autoComplete="off"
                type="url"
                value={form.visa_pdf_template_url}
                onChange={(e) => setForm((f) => ({ ...f, visa_pdf_template_url: e.target.value }))}
                placeholder="https://..."
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="flex items-center gap-2 cursor-pointer p-2 bg-slate-50 rounded">
              <input autoComplete="off"
                type="checkbox"
                checked={form.visa_needs_biometric}
                onChange={(e) => setForm((f) => ({ ...f, visa_needs_biometric: e.target.checked }))}
              />
              <span className="text-xs font-semibold text-slate-700">🔬 Perlu Biometrik</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer p-2 bg-slate-50 rounded">
              <input autoComplete="off"
                type="checkbox"
                checked={form.visa_needs_physical_doc}
                onChange={(e) => setForm((f) => ({ ...f, visa_needs_physical_doc: e.target.checked }))}
              />
              <span className="text-xs font-semibold text-slate-700">📦 Kirim Doc Fisik</span>
            </label>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Default Biometrik (Rp/pax)</label>
              <input autoComplete="off"
                type="number"
                value={form.visa_default_biometric_cost}
                onChange={(e) => setForm((f) => ({ ...f, visa_default_biometric_cost: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Default Visa (Rp/pax)</label>
              <input autoComplete="off"
                type="number"
                value={form.visa_default_visa_cost}
                onChange={(e) => setForm((f) => ({ ...f, visa_default_visa_cost: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Lokasi Biometrik</label>
              <input autoComplete="off"
                type="text"
                value={form.visa_biometric_location}
                onChange={(e) => setForm((f) => ({ ...f, visa_biometric_location: e.target.value }))}
                placeholder="VFS Global Jakarta, ..."
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Deadline Dokumen</label>
              <input autoComplete="off"
                type="date"
                value={form.visa_deadline_doc}
                onChange={(e) => setForm((f) => ({ ...f, visa_deadline_doc: e.target.value }))}
                className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">Alamat Pengiriman Dokumen (kantor TE)</label>
            <textarea autoComplete="off"
              value={form.visa_pickup_address}
              onChange={(e) => setForm((f) => ({ ...f, visa_pickup_address: e.target.value }))}
              rows="4"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
              placeholder="PT KHASANAH GLOBAL INTERNATIONAL&#10;Traveling Eropa Headquarter&#10;..."
            />
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-lg"
          >
            {pending ? '⏳ Menyimpan...' : '💾 Simpan Visa Workflow Config'}
          </button>
        </div>
      )}
    </div>
  );
}
