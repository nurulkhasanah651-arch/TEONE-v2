'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCSUpdate, addParticipantsToCS } from '@/lib/actions/cs';

const ROOM_TYPES = ['Single', 'Twin', 'Double', 'Triple', 'Family'];
const SOURCES = [
  { value: 'instagram', label: '📷 Instagram' },
  { value: 'whatsapp',  label: '💬 WhatsApp' },
  { value: 'offline',   label: '🏪 Offline' },
  { value: 'alumni',    label: '🎓 Alumni' },
  { value: 'mitra',     label: '🤝 Mitra' },
];

export default function EditCSForm({ update }) {
  const router = useRouter();
  const u = update;
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pending, setPending] = useState(false);
  const [participants, setParticipants] = useState([]);

  const updateAction = updateCSUpdate.bind(null, u.id);
  const filledParticipants = participants.filter((p) => (p.first_name?.trim() || p.last_name?.trim()));
  const participantsJson = JSON.stringify(filledParticipants);

  function addRow() {
    setParticipants((a) => [...a, { first_name: '', last_name: '', phone: '', email: '', source: 'whatsapp', room_type: '', price_paid: '' }]);
  }
  function updRow(i, key, val) {
    setParticipants((a) => a.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
  }
  function rmRow(i) {
    setParticipants((a) => a.filter((_, idx) => idx !== i));
  }

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    setInfo('');

    // Step 1: update CS row (numbers, notes)
    const result = await updateAction(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
      return;
    }

    // Step 2: add participants if any (separate action call)
    if (filledParticipants.length > 0) {
      const fd = new FormData();
      fd.set('participants', participantsJson);
      const r2 = await addParticipantsToCS(u.trip_id, fd);
      if (r2?.error) {
        setError(r2.error);
        setPending(false);
        return;
      }
      setInfo(`✓ CS update tersimpan + ${r2.inserted} peserta ditambahkan`);
    }

    router.push('/cs');
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <input type="hidden" name="trip_id" value={u.trip_id} />

      <Field label="Tanggal" required>
        <input type="date" name="tanggal" defaultValue={u.tanggal} required className={inputCls} />
      </Field>

      <Section title="Closing per Sumber">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <NumberField label="📷 Instagram" name="from_instagram" initial={u.from_instagram} />
          <NumberField label="💬 WhatsApp"  name="from_whatsapp"  initial={u.from_whatsapp} />
          <NumberField label="🏪 Offline"    name="from_offline"   initial={u.from_offline} />
          <NumberField label="🎓 Alumni"     name="closing_alumni" initial={u.closing_alumni} />
          <NumberField label="🤝 Mitra"      name="closing_mitra"  initial={u.closing_mitra} />
        </div>
      </Section>

      <Field label="Total Leads (untuk trip ini)">
        <input type="number" name="jumlah_leads" defaultValue={u.jumlah_leads || 0} min="0" className={inputCls} />
      </Field>

      <Field label="Catatan">
        <textarea name="notes" defaultValue={u.notes || ''} rows="3" className={inputCls + ' resize-none'} />
      </Field>

      {/* Tambah Peserta — additive only */}
      <Section title="Tambah Peserta (Opsional)">
        <p className="text-xs text-slate-500 -mt-2 mb-3">
          Peserta yang sudah ada di trip dikelola di halaman detail trip. Section ini hanya untuk MENAMBAH peserta baru.
        </p>

        {participants.length === 0 ? (
          <button type="button" onClick={addRow} className="w-full py-2.5 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-sm font-semibold rounded-lg transition-colors">
            + Tambah Peserta Baru
          </button>
        ) : (
          <div className="space-y-3">
            {participants.map((p, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-brand-700">Peserta Baru #{i + 1}</p>
                  <button type="button" onClick={() => rmRow(i)} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold">
                    ✕ Hapus
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Mini label="Nama Depan" value={p.first_name} onChange={(v) => updRow(i, 'first_name', v)} />
                  <Mini label="Nama Belakang" value={p.last_name} onChange={(v) => updRow(i, 'last_name', v)} />
                  <Mini label="No HP / WA" value={p.phone} onChange={(v) => updRow(i, 'phone', v)} />
                  <Mini label="Email" type="email" value={p.email} onChange={(v) => updRow(i, 'email', v)} />
                  <label className="block">
                    <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Sumber</span>
                    <select value={p.source} onChange={(e) => updRow(i, 'source', e.target.value)} className={miniInput}>
                      {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Tipe Kamar</span>
                    <select value={p.room_type} onChange={(e) => updRow(i, 'room_type', e.target.value)} className={miniInput}>
                      <option value="">— Pilih —</option>
                      {ROOM_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                  <label className="block col-span-2">
                    <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Harga Bayar (IDR)</span>
                    <input type="number" value={p.price_paid} min="0" onChange={(e) => updRow(i, 'price_paid', e.target.value)} className={miniInput} placeholder="50000000" />
                  </label>
                </div>
              </div>
            ))}
            <button type="button" onClick={addRow} className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded-lg transition-colors">
              + Tambah Peserta Lain
            </button>
          </div>
        )}
      </Section>

      <input type="hidden" name="participants" value={participantsJson} />

      {info && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">{info}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium whitespace-pre-wrap">{error}</div>}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card transition-colors"
      >
        {pending ? 'Menyimpan...' : `Update CS${filledParticipants.length > 0 ? ` + ${filledParticipants.length} Peserta Baru` : ''}`}
      </button>
    </form>
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

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700 block mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

function NumberField({ label, name, initial }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      <input type="number" name={name} defaultValue={initial || 0} onFocus={(e) => e.target.select()} min="0" className={inputCls} />
    </label>
  );
}

function Mini({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">{label}</span>
      <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} className={miniInput} />
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
const miniInput = 'w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
