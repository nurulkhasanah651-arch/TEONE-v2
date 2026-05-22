'use client';

// Round 75: Form support edit row tanggal lain (tidak hanya hari ini)
// Inline daily leads form — upsert by tanggal

import { useState, useEffect } from 'react';
import { upsertDailyLeads } from '@/lib/actions/leads';

export default function LeadsQuickForm({ initial = {}, mode = 'add', onCancel }) {
  // mode: 'add' (today) | 'edit' (initial.tanggal)
  const [open, setOpen] = useState(mode === 'edit');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const [tanggal, setTanggal] = useState(initial.tanggal || new Date().toISOString().slice(0, 10));
  const [ig, setIg] = useState(initial.leads_ig || 0);
  const [tiktok, setTiktok] = useState(initial.leads_tiktok || 0);
  const [wa, setWa] = useState(initial.leads_wa || 0);
  const [fb, setFb] = useState(initial.leads_fb || 0);
  const [adsMeta, setAdsMeta] = useState(initial.leads_ads_meta || 0);
  const [adsGoogle, setAdsGoogle] = useState(initial.leads_ads_google || 0);
  const [adsTiktok, setAdsTiktok] = useState(initial.leads_ads_tiktok || 0);
  const [notes, setNotes] = useState(initial.notes || '');

  useEffect(() => {
    if (mode === 'edit') {
      setTanggal(initial.tanggal || '');
      setIg(initial.leads_ig || 0);
      setTiktok(initial.leads_tiktok || 0);
      setWa(initial.leads_wa || 0);
      setFb(initial.leads_fb || 0);
      setAdsMeta(initial.leads_ads_meta || 0);
      setAdsGoogle(initial.leads_ads_google || 0);
      setAdsTiktok(initial.leads_ads_tiktok || 0);
      setNotes(initial.notes || '');
      setOpen(true);
    }
  }, [initial, mode]);

  const organicTotal = (+ig || 0) + (+tiktok || 0) + (+wa || 0) + (+fb || 0);
  const adsTotal = (+adsMeta || 0) + (+adsGoogle || 0) + (+adsTiktok || 0);
  const total = organicTotal + adsTotal;

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
      if (onCancel) onCancel();
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full py-2.5 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-sm font-semibold rounded-lg transition-colors"
      >
        + Input Leads Hari Ini
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="border border-brand-200 rounded-xl p-4 bg-brand-50/30 space-y-3">
      <input type="hidden" name="tanggal" value={tanggal} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">
          {mode === 'edit' ? `✎ Edit Leads ${tanggal}` : 'Leads Masuk'}
        </p>
        <button
          type="button"
          onClick={() => { setOpen(false); if (onCancel) onCancel(); }}
          className="text-xs text-slate-500 hover:text-slate-700"
        >
          Batal
        </button>
      </div>

      {/* Tanggal picker — hanya kalau mode 'add' */}
      {mode === 'add' && (
        <label className="block">
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Tanggal</span>
          <input
            type="date"
            value={tanggal}
            max={today}
            onChange={(e) => setTanggal(e.target.value)}
            className="w-full mt-0.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
          />
        </label>
      )}

      <div>
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">🌱 Organic</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <NumberInput label="📷 IG" name="leads_ig" value={ig} onChange={setIg} />
          <NumberInput label="🎵 TikTok" name="leads_tiktok" value={tiktok} onChange={setTiktok} />
          <NumberInput label="💬 WA" name="leads_wa" value={wa} onChange={setWa} />
          <NumberInput label="📘 FB/Lainnya" name="leads_fb" value={fb} onChange={setFb} />
        </div>
        <div className="mt-1 text-right text-[11px] text-slate-500">Subtotal organic: <span className="font-bold text-slate-700">{organicTotal}</span></div>
      </div>

      <div className="pt-2 border-t border-brand-200">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">🎯 Ads</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <NumberInput label="🟦 Meta Ads (FB+IG)" name="leads_ads_meta" value={adsMeta} onChange={setAdsMeta} color="bg-blue-50" />
          <NumberInput label="🟥 Google Ads" name="leads_ads_google" value={adsGoogle} onChange={setAdsGoogle} color="bg-red-50" />
          <NumberInput label="⚫ TikTok Ads" name="leads_ads_tiktok" value={adsTiktok} onChange={setAdsTiktok} color="bg-slate-50" />
        </div>
        <div className="mt-1 text-right text-[11px] text-slate-500">Subtotal ads: <span className="font-bold text-slate-700">{adsTotal}</span></div>
      </div>

      <div className="flex items-center justify-between p-2 rounded-lg bg-brand-100">
        <span className="text-[11px] font-bold text-brand-700 uppercase tracking-wider">Total Leads</span>
        <span className="text-xl font-bold text-brand-700">{total}</span>
      </div>

      <input
        type="text"
        name="notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Catatan (opsional)..."
        className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
      />

      {error && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending} className="w-full py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
        {pending ? 'Menyimpan...' : (mode === 'edit' ? 'Update Leads' : 'Simpan Leads')}
      </button>
    </form>
  );
}

function NumberInput({ label, name, value, onChange, color = '' }) {
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
        className={`w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none ${color || 'bg-white'}`}
      />
    </label>
  );
}
