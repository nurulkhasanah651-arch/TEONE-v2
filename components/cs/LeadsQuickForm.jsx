'use client';

// Inline daily leads form — upsert today's leads from /cs page

import { useState } from 'react';
import { upsertDailyLeads } from '@/lib/actions/leads';

export default function LeadsQuickForm({ initial = {} }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [ig, setIg] = useState(initial.leads_ig || 0);
  const [tiktok, setTiktok] = useState(initial.leads_tiktok || 0);
  const [wa, setWa] = useState(initial.leads_wa || 0);
  const [fb, setFb] = useState(initial.leads_fb || 0);
  const total = (+ig || 0) + (+tiktok || 0) + (+wa || 0) + (+fb || 0);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    const result = await upsertDailyLeads(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      setOpen(false);
      setPending(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const isToday = initial.tanggal === today;
  const hasToday = initial.tanggal && initial.leads_ig != null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-sm font-semibold rounded-lg transition-colors"
      >
        {hasToday && isToday ? '✎ Edit Leads Hari Ini' : '+ Input Leads Hari Ini'}
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="border border-brand-200 rounded-xl p-4 bg-brand-50/30 space-y-3">
      <input type="hidden" name="tanggal" value={today} />
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">Leads Masuk Hari Ini</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700">Batal</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <NumberInput label="📷 IG" name="leads_ig" value={ig} onChange={setIg} />
        <NumberInput label="🎵 TikTok" name="leads_tiktok" value={tiktok} onChange={setTiktok} />
        <NumberInput label="💬 WA" name="leads_wa" value={wa} onChange={setWa} />
        <NumberInput label="📘 FB/Lainnya" name="leads_fb" value={fb} onChange={setFb} />
      </div>
      <div className="flex items-center justify-between p-2 rounded-lg bg-brand-100">
        <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">Total Leads</span>
        <span className="text-xl font-bold text-brand-700">{total}</span>
      </div>
      <input type="text" name="notes" placeholder="Catatan (opsional)..." className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white" />

      {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending} className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
        {pending ? 'Menyimpan...' : 'Simpan Leads'}
      </button>
    </form>
  );
}

function NumberInput({ label, name, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-0.5">{label}</span>
      <input
        type="number"
        name={name}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()}
        min="0"
        className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
      />
    </label>
  );
}
