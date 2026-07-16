'use client';

// Round 102b: EditCSForm + DP nominal + Family Group input per peserta row
// - DP > 0: auto create dp_payment_request (status pending) → /invoices tab
// - Family Name diisi: group peserta dengan family_name sama → auto-create family group

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateCSUpdate,
  addParticipantsToCS,
  updateParticipantRoomFromCS,
  removeParticipantFromCS,
} from '@/lib/actions/cs';

const ROOM_TYPES = ['Single', 'Twin', 'Double', 'Triple', 'Family'];
const SOURCES = [
  { value: 'instagram', label: '📷 Instagram' },
  { value: 'whatsapp',  label: '💬 WhatsApp' },
  { value: 'offline',   label: '🏪 Offline' },
  { value: 'alumni',    label: '🎓 Alumni' },
  { value: 'mitra',     label: '🤝 Mitra' },
];

function fmtInput(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}
function parseInput(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9]/g, '');
}

export default function EditCSForm({ update, existingParticipants = [] }) {
  const router = useRouter();
  const u = update;
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pending, setPending] = useState(false);
  const [pendingPax, startTransition] = useTransition();
  const [newParticipants, setNewParticipants] = useState([]);

  const updateAction = updateCSUpdate.bind(null, u.id);
  const filledNew = newParticipants.filter((p) => (p.first_name?.trim() || p.last_name?.trim()));
  const newJson = JSON.stringify(filledNew);
  const totalDPInputed = filledNew.reduce((s, p) => s + (parseInt(p.dp_amount) || 0), 0);

  // Detect family groups from family_name field
  const familyGroupsPreview = {};
  filledNew.forEach((p, idx) => {
    const fn = (p.family_name || '').trim();
    if (!fn) return;
    if (!familyGroupsPreview[fn]) familyGroupsPreview[fn] = [];
    familyGroupsPreview[fn].push({ idx, name: `${p.first_name} ${p.last_name}`.trim() });
  });
  const familyCount = Object.keys(familyGroupsPreview).length;

  function addRow() {
    setNewParticipants((a) => [...a, {
      first_name: '', last_name: '', phone: '', email: '',
      source: 'whatsapp', room_type: '', price_paid: '', discount: '',
      dp_amount: '', dp_date: new Date().toISOString().slice(0, 10), dp_method: 'transfer',
      family_name: '',
    }]);
  }
  function updRow(i, key, val) {
    setNewParticipants((a) => a.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
  }
  function rmRow(i) {
    setNewParticipants((a) => a.filter((_, idx) => idx !== i));
  }

  async function handleChangeRoom(passengerId, customerId, newRoom) {
    startTransition(async () => {
      const r = await updateParticipantRoomFromCS(u.trip_id, passengerId, customerId, newRoom);
      if (r?.error) alert('Gagal update room: ' + r.error);
      else router.refresh();
    });
  }

  async function handleRemove(passengerId, name) {
    if (!confirm(`Hapus peserta "${name}" dari trip ini?`)) return;
    startTransition(async () => {
      const r = await removeParticipantFromCS(u.trip_id, passengerId);
      if (r?.error) alert('Gagal hapus: ' + r.error);
      else router.refresh();
    });
  }

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    setInfo('');

    const result = await updateAction(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
      return;
    }

    if (filledNew.length > 0) {
      const fd = new FormData();
      fd.set('participants', newJson);
      const r2 = await addParticipantsToCS(u.trip_id, fd);
      if (r2?.error) {
        setError(r2.error);
        setPending(false);
        return;
      }
      const dpInfo = r2.dp_requests > 0 ? ` + ${r2.dp_requests} DP request → /invoices` : '';
      const famInfo = r2.families_created > 0 ? ` + ${r2.families_created} family group` : '';
      setInfo(`✓ CS update tersimpan + ${r2.inserted} peserta baru${dpInfo}${famInfo}`);
    }

    router.push('/cs');
    router.refresh();
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <input autoComplete="off" type="hidden" name="trip_id" value={u.trip_id} />

      <Field label="Tanggal" required>
        <input autoComplete="off" type="date" name="tanggal" defaultValue={u.tanggal} required className={inputCls} />
      </Field>

      <Section title="Closing per Sumber (Organic)">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <NumberField label="📷 Instagram" name="from_instagram" initial={u.from_instagram} />
          <NumberField label="💬 WhatsApp"  name="from_whatsapp"  initial={u.from_whatsapp} />
          <NumberField label="🏪 Offline"    name="from_offline"   initial={u.from_offline} />
          <NumberField label="🎓 Alumni"     name="closing_alumni" initial={u.closing_alumni} />
          <NumberField label="🤝 Mitra"      name="closing_mitra"  initial={u.closing_mitra} />
        </div>
      </Section>

      <Section title="Closing dari Ads">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NumberField label="🟦 Meta Ads" name="from_ads_meta" initial={u.from_ads_meta} />
          <NumberField label="🟥 Google Ads" name="from_ads_google" initial={u.from_ads_google} />
          <NumberField label="⚫ TikTok Ads" name="from_ads_tiktok" initial={u.from_ads_tiktok} />
        </div>
      </Section>

      <Field label="Total Leads (untuk trip ini)">
        <input autoComplete="off" type="number" name="jumlah_leads" defaultValue={u.jumlah_leads || 0} min="0" className={inputCls} />
      </Field>

      <Field label="Catatan">
        <textarea autoComplete="off" name="notes" defaultValue={u.notes || ''} rows="3" className={inputCls + ' resize-none'} />
      </Field>

      {/* ===== PESERTA EXISTING ===== */}
      <Section title={`Peserta di Trip Ini (${existingParticipants.length})`}>
        <p className="text-xs text-slate-500 -mt-2 mb-3">
          Edit room type atau hapus peserta. Perubahan langsung sync ke Master Trip + Finance + Payment Checklist.
        </p>
        {existingParticipants.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Belum ada peserta untuk trip ini.</p>
        ) : (
          <div className="space-y-2">
            {existingParticipants.map((p, idx) => {
              const c = p.customer || {};
              const name = c.name || `${c.first_name || ''} ${c.surname || ''}`.trim() || `Peserta #${idx + 1}`;
              return (
                <div key={p.id} className="flex items-center gap-2 p-2.5 bg-white border border-slate-200 rounded-lg flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{name}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {c.phone || '—'} {c.email && `· ${c.email}`}
                    </p>
                  </div>
                  <select
                    value={p.room_type || ''}
                    onChange={(e) => handleChangeRoom(p.id, p.customer_id, e.target.value || null)}
                    disabled={pendingPax}
                    className="text-xs px-2 py-1 border border-slate-300 rounded bg-white focus:ring-1 focus:ring-brand-500 outline-none"
                  >
                    <option value="">— Room? —</option>
                    {ROOM_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleRemove(p.id, name)}
                    disabled={pendingPax}
                    className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 font-semibold disabled:opacity-50"
                  >
                    🗑 Hapus
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* ===== TAMBAH PESERTA BARU + DP + FAMILY ===== */}
      <Section title="Tambah Peserta Baru + DP + Family Group (Opsional)">
        <p className="text-[11px] text-slate-500 -mt-2 mb-3">
          💡 <b>DP</b>: nominal yang sudah dibayar → masuk Invoice tab untuk Finance approve →
          matrix DP auto-centang + WA receipt.<br />
          💡 <b>Family Name</b>: isi nama family yang sama untuk peserta yang satu keluarga
          (peserta pertama dengan nama family yang sama jadi <b>kepala</b>).
        </p>

        {newParticipants.length === 0 ? (
          <button type="button" onClick={addRow} className="w-full py-2.5 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-sm font-semibold rounded-lg transition-colors">
            + Tambah Peserta Baru
          </button>
        ) : (
          <div className="space-y-3">
            {newParticipants.map((p, i) => {
              const fnTrim = (p.family_name || '').trim();
              const familyMembers = fnTrim ? familyGroupsPreview[fnTrim] || [] : [];
              const isFirstOfFamily = familyMembers.length > 0 && familyMembers[0].idx === i;

              return (
                <div key={i} className={`border rounded-lg p-3 bg-white ${
                  fnTrim ? 'border-indigo-300 border-l-4' : 'border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-brand-700">
                      Peserta Baru #{i + 1}
                      {fnTrim && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                          👨‍👩‍👧 {fnTrim}{isFirstOfFamily ? ' 👑 KEPALA' : ' (anggota)'}
                        </span>
                      )}
                    </p>
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
                    <label className="block">
                      <span className="text-[11px] font-semibold text-emerald-700 block mb-0.5">💸 Diskon (Rp)</span>
                      <input autoComplete="off" type="number" value={p.discount} min="0" onChange={(e) => updRow(i, 'discount', e.target.value)} className={miniInput} placeholder="0" />
                    </label>
                  </div>

                  {/* === FAMILY GROUP === */}
                  <div className="mt-3 pt-3 border-t border-dashed border-indigo-300 bg-indigo-50/30 -mx-3 px-3 pb-2">
                    <p className="text-[11px] font-bold text-indigo-800 uppercase tracking-wider mb-2">
                      👨‍👩‍👧‍👦 Family Group (Opsional)
                    </p>
                    <label className="block">
                      <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                        Nama Family
                        <span className="text-[9px] text-slate-500 font-normal ml-1">
                          (Isi sama dengan peserta lain untuk masuk family yang sama)
                        </span>
                      </span>
                      <input autoComplete="off"
                        type="text"
                        value={p.family_name || ''}
                        onChange={(e) => updRow(i, 'family_name', e.target.value)}
                        placeholder="e.g. Keluarga Andi Santoso"
                        className={miniInput}
                      />
                    </label>
                    {fnTrim && (
                      <p className="mt-1 text-[10px] text-indigo-700">
                        {familyMembers.length > 1
                          ? `✓ ${familyMembers.length} peserta di family ini: ${familyMembers.map((m) => m.name).join(', ')}`
                          : '✓ Family group baru — tambahin peserta lain dengan family name sama biar group-nya berisi'}
                      </p>
                    )}
                  </div>

                  {/* === DP === */}
                  <div className="mt-3 pt-3 border-t border-dashed border-blue-300 bg-blue-50/30 -mx-3 px-3 pb-2 rounded-b-lg">
                    <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wider mb-2">
                      💵 DP Sudah Dibayar (Opsional)
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <label className="block">
                        <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Nominal DP (Rp)</span>
                        <input autoComplete="off"
                          type="text"
                          inputMode="numeric"
                          value={fmtInput(p.dp_amount)}
                          onChange={(e) => updRow(i, 'dp_amount', parseInput(e.target.value))}
                          placeholder="5.000.000"
                          className={miniInput}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Tgl Bayar</span>
                        <input autoComplete="off"
                          type="date"
                          value={p.dp_date || new Date().toISOString().slice(0, 10)}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(e) => updRow(i, 'dp_date', e.target.value)}
                          className={miniInput}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Metode</span>
                        <select
                          value={p.dp_method || 'transfer'}
                          onChange={(e) => updRow(i, 'dp_method', e.target.value)}
                          className={miniInput}
                        >
                          <option value="transfer">Transfer</option>
                          <option value="cash">Cash</option>
                          <option value="manual">Manual</option>
                        </select>
                      </label>
                    </div>
                    {parseInt(p.dp_amount) > 0 && (
                      <p className="mt-1 text-[10px] text-blue-700">
                        ✓ DP Rp {Number(p.dp_amount).toLocaleString('id-ID')} → /invoices tab (pending Finance approval)
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={addRow} className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded-lg transition-colors">
              + Tambah Peserta Lain
            </button>
          </div>
        )}

        {/* Summary cards */}
        {(totalDPInputed > 0 || familyCount > 0) && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            {totalDPInputed > 0 && (
              <div className="p-2 bg-blue-100 border border-blue-300 rounded text-xs">
                <p className="font-bold text-blue-900">
                  💵 Total DP: Rp {totalDPInputed.toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] text-blue-700 mt-0.5">
                  Submit → muncul di /invoices untuk Finance approve
                </p>
              </div>
            )}
            {familyCount > 0 && (
              <div className="p-2 bg-indigo-100 border border-indigo-300 rounded text-xs">
                <p className="font-bold text-indigo-900">
                  👨‍👩‍👧 {familyCount} Family Group akan dibuat
                </p>
                <p className="text-[10px] text-indigo-700 mt-0.5">
                  {Object.entries(familyGroupsPreview).map(([name, ms]) => `${name}: ${ms.length} pax`).join(' · ')}
                </p>
              </div>
            )}
          </div>
        )}
      </Section>

      <input autoComplete="off" type="hidden" name="participants" value={newJson} />

      {info && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 font-medium">{info}</div>}
      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium whitespace-pre-wrap">{error}</div>}

      <button
        type="submit"
        disabled={pending}
        className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card transition-colors"
      >
        {pending ? 'Menyimpan...' : `Update CS${filledNew.length > 0 ? ` + ${filledNew.length} Peserta` : ''}${totalDPInputed > 0 ? ` + DP ${totalDPInputed.toLocaleString('id-ID')}` : ''}${familyCount > 0 ? ` + ${familyCount} Family` : ''}`}
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
      <input autoComplete="off" type="number" name={name} defaultValue={initial || 0} onFocus={(e) => e.target.select()} min="0" className={inputCls} />
    </label>
  );
}

function Mini({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">{label}</span>
      <input autoComplete="off" type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} className={miniInput} />
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
const miniInput = 'w-full px-2 py-1 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
