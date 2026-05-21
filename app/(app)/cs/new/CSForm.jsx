'use client';

// CS Daily form dengan ads source (Round 42)

import { useState } from 'react';
import { createCSUpdate } from '@/lib/actions/cs';

const ROOM_TYPES = ['Single', 'Twin', 'Double', 'Triple', 'Family'];
const SOURCES = [
  { value: 'instagram',   label: '📷 Instagram' },
  { value: 'whatsapp',    label: '💬 WhatsApp' },
  { value: 'offline',     label: '🏪 Offline' },
  { value: 'alumni',      label: '🎓 Alumni' },
  { value: 'mitra',       label: '🤝 Mitra' },
  { value: 'ads_meta',    label: '📱 Ads Meta (FB/IG)' },
  { value: 'ads_google',  label: '🔍 Ads Google' },
  { value: 'ads_tiktok',  label: '🎵 Ads TikTok' },
];

export default function CSForm({ trips }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [tripId, setTripId] = useState('');
  const [sources, setSources] = useState({
    ig: 0, wa: 0, offline: 0, alumni: 0, mitra: 0,
    ads_meta: 0, ads_google: 0, ads_tiktok: 0,
  });
  const [adsLeads, setAdsLeads] = useState({ meta: 0, google: 0, tiktok: 0 });
  const [participants, setParticipants] = useState([]);

  const selectedTrip = trips.find((t) => String(t.id) === String(tripId));
  const totalTerjual = Object.values(sources).reduce((a, b) => a + (+b || 0), 0);
  const sisaSeat = selectedTrip ? selectedTrip.seat_left ?? 0 : 0;

  function addParticipant() {
    setParticipants((arr) => [...arr, { first_name: '', last_name: '', phone: '', email: '', source: 'whatsapp', room_type: '', price_paid: '' }]);
  }
  function updParticipant(i, key, val) {
    setParticipants((arr) => arr.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
  }
  function rmParticipant(i) {
    setParticipants((arr) => arr.filter((_, idx) => idx !== i));
  }

  const filledParticipants = participants.filter((p) => (p.first_name?.trim() || p.last_name?.trim()));
  const participantsJson = JSON.stringify(filledParticipants);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    const result = await createCSUpdate(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={handleSubmit} className="space-y-5">
      <input type="hidden" name="participants" value={participantsJson} />

      <Field label="Trip" required>
        <select name="trip_id" required value={tripId} onChange={(e) => setTripId(e.target.value)} className={inputCls}>
          <option value="">Pilih trip...</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.kode_trip || `#${t.id}`} — {t.name} ({t.status})</option>
          ))}
        </select>
      </Field>

      <Field label="Tanggal" required>
        <input type="date" name="tanggal" defaultValue={today} required className={inputCls} />
      </Field>

      {/* Closing per Source */}
      <Section title="Closing Hari Ini (per Sumber)">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SourceField label="📷 Instagram" name="from_instagram" value={sources.ig}      onChange={(v) => setSources((s) => ({ ...s, ig: v }))} />
          <SourceField label="💬 WhatsApp"  name="from_whatsapp"  value={sources.wa}      onChange={(v) => setSources((s) => ({ ...s, wa: v }))} />
          <SourceField label="🏪 Offline"    name="from_offline"   value={sources.offline} onChange={(v) => setSources((s) => ({ ...s, offline: v }))} />
          <SourceField label="🎓 Alumni"     name="closing_alumni" value={sources.alumni}  onChange={(v) => setSources((s) => ({ ...s, alumni: v }))} />
          <SourceField label="🤝 Mitra"      name="closing_mitra"  value={sources.mitra}   onChange={(v) => setSources((s) => ({ ...s, mitra: v }))} />
        </div>

        {/* ADS CLOSING — section sendiri */}
        <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
          <p className="text-xs font-bold text-indigo-700 mb-2">🎯 Closing dari Iklan (Ads)</p>
          <div className="grid grid-cols-3 gap-2">
            <SourceField label="📱 Meta" name="from_ads_meta"   value={sources.ads_meta}   onChange={(v) => setSources((s) => ({ ...s, ads_meta: v }))} />
            <SourceField label="🔍 Google" name="from_ads_google" value={sources.ads_google} onChange={(v) => setSources((s) => ({ ...s, ads_google: v }))} />
            <SourceField label="🎵 TikTok" name="from_ads_tiktok" value={sources.ads_tiktok} onChange={(v) => setSources((s) => ({ ...s, ads_tiktok: v }))} />
          </div>
          {/* Total ads closing — auto sum, sent as hidden input */}
          <input type="hidden" name="closing_ads" value={sources.ads_meta + sources.ads_google + sources.ads_tiktok} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <p className="text-[11px] font-bold text-green-700 uppercase tracking-wider">Total Closing</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{totalTerjual}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Sisa Seat Trip Ini</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{selectedTrip ? sisaSeat : '—'}</p>
          </div>
        </div>
      </Section>

      {/* LEADS HARIAN DARI ADS */}
      <Section title="🎯 Leads Harian dari Iklan (untuk Ads Manager)">
        <p className="text-xs text-slate-500 -mt-2 mb-3">
          Jumlah leads (orang yang fill form/DM) hari ini dari masing-masing platform. Untuk dihitung CAC & conversion rate di tab Ads Manager.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <SourceField label="📱 Meta Leads"   name="leads_ads_meta"   value={adsLeads.meta}   onChange={(v) => setAdsLeads((s) => ({ ...s, meta: v }))} />
          <SourceField label="🔍 Google Leads" name="leads_ads_google" value={adsLeads.google} onChange={(v) => setAdsLeads((s) => ({ ...s, google: v }))} />
          <SourceField label="🎵 TikTok Leads" name="leads_ads_tiktok" value={adsLeads.tiktok} onChange={(v) => setAdsLeads((s) => ({ ...s, tiktok: v }))} />
        </div>
      </Section>

      {/* Inline Participants */}
      <Section title="Detail Peserta Baru (Opsional)">
        <p className="text-xs text-slate-500 -mt-2 mb-3">
          Isi nama peserta yang closing hari ini → otomatis masuk ke master file trip.
        </p>

        {participants.length === 0 ? (
          <button type="button" onClick={addParticipant} className="w-full py-2.5 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-sm font-semibold rounded-lg transition-colors">
            + Tambah Peserta
          </button>
        ) : (
          <div className="space-y-3">
            {participants.map((p, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-brand-700">Peserta #{i + 1}</p>
                  <button type="button" onClick={() => rmParticipant(i)} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold">✕ Hapus</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <PaxInput label="Nama Depan" value={p.first_name} onChange={(v) => updParticipant(i, 'first_name', v)} />
                  <PaxInput label="Nama Belakang" value={p.last_name} onChange={(v) => updParticipant(i, 'last_name', v)} />
                  <PaxInput label="No HP / WA" value={p.phone} onChange={(v) => updParticipant(i, 'phone', v)} />
                  <PaxInput label="Email" value={p.email} type="email" onChange={(v) => updParticipant(i, 'email', v)} />
                  <label className="block">
                    <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Dari Sumber</span>
                    <select value={p.source} onChange={(e) => updParticipant(i, 'source', e.target.value)} className={miniInput}>
                      {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Tipe Kamar</span>
                    <select value={p.room_type} onChange={(e) => updParticipant(i, 'room_type', e.target.value)} className={miniInput}>
                      <option value="">— Pilih —</option>
                      {ROOM_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="block col-span-2">
                    <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Harga Bayar (IDR)</span>
                    <input type="number" value={p.price_paid} min="0" onChange={(e) => updParticipant(i, 'price_paid', e.target.value)} className={miniInput} placeholder="50000000" />
                  </label>
                </div>
              </div>
            ))}
            <button type="button" onClick={addParticipant} className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded-lg transition-colors">
              + Tambah Peserta Lain
            </button>
          </div>
        )}
      </Section>

      <Field label="Total Leads Organik Hari Ini" hint="Leads yang BUKAN dari ads (organik IG, WA, referral, dll)">
        <input type="number" name="jumlah_leads" defaultValue="0" min="0" className={inputCls} />
      </Field>

      <Field label="Catatan (opsional)">
        <textarea name="notes" rows="3" className={inputCls + ' resize-none'} placeholder="Hal penting hari ini..." />
      </Field>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending} className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-card transition-colors">
        {pending ? 'Menyimpan...' : `Simpan${filledParticipants.length > 0 ? ` + ${filledParticipants.length} Peserta` : ''}`}
      </button>
    </form>
  );
}

function SourceField({ label, name, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      <input type="number" name={name} value={value} onChange={(e) => onChange(parseInt(e.target.value) || 0)} onFocus={(e) => e.target.select()} min="0" className={inputCls} />
    </label>
  );
}

function PaxInput({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">{label}</span>
      <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} className={miniInput} />
    </label>
  );
}

function Section({ title, children }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
      <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {hint && <span className="text-[11px] text-slate-500 block mb-1.5">{hint}</span>}
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
const miniInput = 'w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
