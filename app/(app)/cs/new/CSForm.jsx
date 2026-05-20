'use client';

// CS Daily form — input closings per trip + auto-redirect to add participants

import { useState } from 'react';
import { createCSUpdate } from '@/lib/actions/cs';

export default function CSForm({ trips }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [tripId, setTripId] = useState('');
  const [sources, setSources] = useState({ ig: 0, wa: 0, offline: 0, alumni: 0, mitra: 0 });

  const selectedTrip = trips.find((t) => String(t.id) === String(tripId));
  const totalTerjual = Object.values(sources).reduce((a, b) => a + (+b || 0), 0);
  const sisaSeat = selectedTrip ? selectedTrip.seat_left ?? 0 : 0;

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
      <Field label="Trip" required>
        <select
          name="trip_id"
          required
          value={tripId}
          onChange={(e) => setTripId(e.target.value)}
          className={inputCls}
        >
          <option value="">Pilih trip...</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>
              {t.kode_trip || `#${t.id}`} — {t.name} ({t.status})
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tanggal" required>
        <input type="date" name="tanggal" defaultValue={today} required className={inputCls} />
      </Field>

      {/* Sumber Closing — 5 sources */}
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
        <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">Closing Hari Ini (per Sumber)</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SourceField label="📷 Instagram" name="from_instagram" value={sources.ig} onChange={(v) => setSources((s) => ({ ...s, ig: v }))} />
          <SourceField label="💬 WhatsApp" name="from_whatsapp" value={sources.wa} onChange={(v) => setSources((s) => ({ ...s, wa: v }))} />
          <SourceField label="🏪 Offline" name="from_offline" value={sources.offline} onChange={(v) => setSources((s) => ({ ...s, offline: v }))} />
          <SourceField label="🎓 Alumni" name="closing_alumni" value={sources.alumni} onChange={(v) => setSources((s) => ({ ...s, alumni: v }))} />
          <SourceField label="🤝 Mitra" name="closing_mitra" value={sources.mitra} onChange={(v) => setSources((s) => ({ ...s, mitra: v }))} />
        </div>

        {/* Auto-computed total */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <p className="text-[11px] font-bold text-green-700 uppercase tracking-wider">Total Closing Hari Ini</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{totalTerjual}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Sisa Seat Trip Ini</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{selectedTrip ? sisaSeat : '—'}</p>
            <p className="text-[10px] text-amber-700 mt-0.5">Auto: quota - terjual</p>
          </div>
        </div>
      </div>

      <Field label="Total Leads Hari Ini (untuk trip ini)" hint="Untuk leads global per sumber, gunakan halaman Leads Harian">
        <input type="number" name="jumlah_leads" defaultValue="0" min="0" className={inputCls} />
      </Field>

      <Field label="Catatan (opsional)">
        <textarea name="notes" rows="3" className={inputCls + ' resize-none'} placeholder="Hal penting hari ini..." />
      </Field>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      {totalTerjual > 0 && tripId && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-start gap-2">
          <span>💡</span>
          <span>
            Setelah simpan, kamu akan diarahkan ke <strong>detail trip</strong> untuk input <strong>data lengkap peserta</strong> (nama, passport, room).
          </span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-card transition-colors"
      >
        {pending ? 'Menyimpan...' : totalTerjual > 0 ? 'Simpan & Tambah Peserta →' : 'Simpan Update'}
      </button>
    </form>
  );
}

function SourceField({ label, name, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      <input
        type="number"
        name={name}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        onFocus={(e) => e.target.select()}
        min="0"
        className={inputCls}
      />
    </label>
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
