'use client';

import { useState } from 'react';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateVisaGroupInfo, updateDocTemplate } from '@/lib/actions/visa';
import { DEFAULT_VISA_DOCS, VISA_STATUS_OPTS } from '@/lib/utils/visa-constants';

export default function VisaGroupForm({ trip, template = [] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [docs, setDocs] = useState(() => (template.length > 0 ? [...template] : []));
  const router = useRouter();

  const action = updateVisaGroupInfo.bind(null, trip.id);

  async function handleGroupSave(formData) {
    setError('');
    startTransition(async () => {
      const result = await action(formData);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  async function handleSaveTemplate() {
    setError('');
    startTransition(async () => {
      const result = await updateDocTemplate(trip.id, docs);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  function addDoc(name) {
    if (!name || docs.includes(name)) return;
    setDocs([...docs, name]);
  }
  function removeDoc(name) {
    setDocs(docs.filter((d) => d !== name));
  }
  function loadDefault() {
    setDocs([...DEFAULT_VISA_DOCS]);
  }

  const [newDocName, setNewDocName] = useState('');

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200">
        <h2 className="font-bold text-brand-700">Info Visa Group</h2>
      </div>
      <div className="p-5 space-y-5">
        {/* Group info form */}
        <form action={handleGroupSave} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Negara Tujuan Visa">
              <input name="visa_country" defaultValue={trip.visa_country || ''} className={inputCls} placeholder="Schengen, UK, Japan, dll" />
            </Field>
            <Field label="Status Visa">
              <select name="visa_status" defaultValue={trip.visa_status || 'pending'} className={inputCls}>
                {VISA_STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Tanggal Biometrik">
              <input type="date" name="visa_biometric_date" defaultValue={trip.visa_biometric_date || ''} className={inputCls} />
            </Field>
          </div>
          <Field label="Catatan Group">
            <textarea name="visa_notes" defaultValue={trip.visa_notes || ''} rows="2" className={inputCls + ' resize-none'} placeholder="Catatan tentang visa group ini..." />
          </Field>
          <button type="submit" disabled={pending} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
            {pending ? 'Menyimpan...' : 'Simpan Info Group'}
          </button>
        </form>

        {/* Doc template editor */}
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider">Template Dokumen Visa</h3>
            <div className="flex gap-2">
              {docs.length === 0 && (
                <button type="button" onClick={loadDefault} className="text-xs font-semibold px-3 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100">
                  📋 Pakai Template Default
                </button>
              )}
              <button type="button" onClick={handleSaveTemplate} disabled={pending} className="text-xs font-semibold px-3 py-1 rounded bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50">
                💾 Save Template
              </button>
            </div>
          </div>

          {docs.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Belum ada dokumen di template. Klik "Pakai Template Default" untuk load standar dokumen visa, atau tambah manual di bawah.</p>
          ) : (
            <div className="flex flex-wrap gap-2 mb-3">
              {docs.map((doc, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                  {doc}
                  <button type="button" onClick={() => removeDoc(doc)} className="text-red-500 hover:text-red-700 font-bold">×</button>
                </span>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newDocName}
              onChange={(e) => setNewDocName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDoc(newDocName); setNewDocName(''); } }}
              placeholder="Tambah dokumen custom (Enter)..."
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
            />
            <button type="button" onClick={() => { addDoc(newDocName); setNewDocName(''); }} className="px-3 py-1.5 bg-brand-50 text-brand-700 hover:bg-brand-100 text-sm font-semibold rounded">
              + Tambah
            </button>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
