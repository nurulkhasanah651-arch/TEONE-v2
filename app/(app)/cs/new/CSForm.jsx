'use client';

// Round 150 (v2): CS Daily form NEW — tambah input "Days to Close" (langsung ketik angka)
// (sudah include R134 Passport AI + R133 DP bukti transfer)
// Path: app/(app)/cs/new/CSForm.jsx

import { useState } from 'react';
import { createCSUpdate } from '@/lib/actions/cs';
import FileUploadInput from '@/components/tl/FileUploadInput';
import PassportUploadAI from '@/components/cs/PassportUploadAI';

const ROOM_TYPES = [
  'Single', 'Twin', 'Double', 'Triple', 'Quad', 'Family',
  'Child no Bed', 'Infant', 'Land Tour Only',
];

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

const BLANK_PAX = {
  first_name: '', last_name: '', phone: '', email: '',
  source: 'whatsapp', room_type: '', price_paid: '', discount: '', include_visa: false, visa_ready: false, include_asuransi: false,
  dp_amount: '', dp_date: new Date().toISOString().slice(0, 10),
  dp_method: 'transfer', dp_proof_url: '',
  family_name: '',
  // Passport fields
  passport_photo_url: '', passport_number: '', passport_surname: '',
  passport_given_names: '', nationality: '', dob: '', passport_expiry: '',
  passport_issued_at: '', place_of_birth: '', sex: '', mrz_raw: '',
  // R150 v2: langsung input angka hari
  days_to_close: '',
};

export default function CSForm({ trips, mitraList = [] }) {
  const [mitraId, setMitraId] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [tripId, setTripId] = useState('');
  const [tanggalClosing, setTanggalClosing] = useState(new Date().toISOString().slice(0, 10));
  const [sources, setSources] = useState({
    ig: 0, wa: 0, offline: 0, alumni: 0, mitra: 0,
    ads_meta: 0, ads_google: 0, ads_tiktok: 0,
  });
  const [adsLeads, setAdsLeads] = useState({ meta: 0, google: 0, tiktok: 0 });
  const [participants, setParticipants] = useState([]);

  const selectedTrip = trips.find((t) => String(t.id) === String(tripId));
  const _visaReq = selectedTrip?.visa_requirement || '';
  const _visaLocked = _visaReq === 'group';
  const totalTerjual = Object.values(sources).reduce((a, b) => a + (+b || 0), 0);
  const sisaSeat = selectedTrip ? selectedTrip.seat_left ?? 0 : 0;

  function addParticipant() {
    setParticipants((arr) => [...arr, { ...BLANK_PAX, dp_date: new Date().toISOString().slice(0, 10) }]);
  }
  function updParticipant(i, key, val) {
    setParticipants((arr) => arr.map((p, idx) => idx === i ? { ...p, [key]: val } : p));
  }
  function rmParticipant(i) {
    setParticipants((arr) => arr.filter((_, idx) => idx !== i));
  }

  function handlePassportExtracted(i, updates) {
    setParticipants((arr) => arr.map((p, idx) => {
      if (idx !== i) return p;
      const next = { ...p };
      for (const [k, v] of Object.entries(updates)) {
        if (k === 'first_name_auto' && !p.first_name) next.first_name = v;
        else if (k === 'last_name_auto' && !p.last_name) next.last_name = v;
        else next[k] = v;
      }
      return next;
    }));
  }

  const filledParticipants = participants.filter((p) => (p.first_name?.trim() || p.last_name?.trim()));
  const participantsJson = JSON.stringify(filledParticipants);
  const totalDPInputed = filledParticipants.reduce((s, p) => s + (parseInt(p.dp_amount) || 0), 0);
  const dpWithProof = filledParticipants.filter((p) => parseInt(p.dp_amount) > 0 && p.dp_proof_url).length;
  const dpWithoutProof = filledParticipants.filter((p) => parseInt(p.dp_amount) > 0 && !p.dp_proof_url).length;
  const passportUploaded = filledParticipants.filter((p) => p.passport_photo_url).length;

  // R150 v2: aggregate days-to-close (langsung dari input angka)
  const chatDatesFilled = filledParticipants.filter((p) => p.days_to_close !== '' && p.days_to_close != null).length;
  const avgDaysToClose = (() => {
    const vals = filledParticipants
      .map((p) => parseInt(p.days_to_close))
      .filter((d) => !isNaN(d) && d >= 0);
    if (vals.length === 0) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  })();

  const familyGroupsPreview = {};
  filledParticipants.forEach((p, idx) => {
    const fn = (p.family_name || '').trim();
    if (!fn) return;
    if (!familyGroupsPreview[fn]) familyGroupsPreview[fn] = [];
    familyGroupsPreview[fn].push({ idx, name: `${p.first_name} ${p.last_name}`.trim() });
  });
  const familyCount = Object.keys(familyGroupsPreview).length;

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
      <input autoComplete="off" type="hidden" name="participants" value={participantsJson} />

      <Field label="Trip" required>
        <select name="trip_id" required value={tripId} onChange={(e) => setTripId(e.target.value)} className={inputCls}>
          <option value="">Pilih trip...</option>
          {trips.map((t) => (
            <option key={t.id} value={t.id}>{t.kode_trip || `#${t.id}`} — {t.name} ({t.status})</option>
          ))}
        </select>
      </Field>

      <Field label="Tanggal Closing" required hint="Default hari ini. Dipakai untuk hitung 'Days to Close' per peserta.">
        <input autoComplete="off"
          type="date"
          name="tanggal"
          value={tanggalClosing}
          onChange={(e) => setTanggalClosing(e.target.value)}
          required
          className={inputCls}
        />
      </Field>

      <Section title="Closing Hari Ini (per Sumber)">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <SourceField label="📷 Instagram" name="from_instagram" value={sources.ig}      onChange={(v) => setSources((s) => ({ ...s, ig: v }))} />
          <SourceField label="💬 WhatsApp"  name="from_whatsapp"  value={sources.wa}      onChange={(v) => setSources((s) => ({ ...s, wa: v }))} />
          <SourceField label="🏪 Offline"    name="from_offline"   value={sources.offline} onChange={(v) => setSources((s) => ({ ...s, offline: v }))} />
          <SourceField label="🎓 Alumni"     name="closing_alumni" value={sources.alumni}  onChange={(v) => setSources((s) => ({ ...s, alumni: v }))} />
          <SourceField label="🤝 Mitra"      name="closing_mitra"  value={sources.mitra}   onChange={(v) => setSources((s) => ({ ...s, mitra: v }))} />
        </div>
        {sources.mitra > 0 && (
          <div className="mt-2 p-3 bg-teal-50 border border-teal-200 rounded-lg">
            <label className="text-xs font-bold text-teal-800 block mb-1">🤝 Closing dari mitra siapa?</label>
            <select name="mitra_id" value={mitraId} onChange={(e) => setMitraId(e.target.value)} className={inputCls} required>
              <option value="">— Pilih mitra —</option>
              {mitraList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <p className="text-[11px] text-teal-700 mt-1">Fee otomatis dihitung dari kategori trip × {sources.mitra} closing.</p>
          </div>
        )}

        <div className="mt-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
          <p className="text-xs font-bold text-indigo-700 mb-2">🎯 Closing dari Iklan (Ads)</p>
          <div className="grid grid-cols-3 gap-2">
            <SourceField label="📱 Meta"   name="from_ads_meta"   value={sources.ads_meta}   onChange={(v) => setSources((s) => ({ ...s, ads_meta: v }))} />
            <SourceField label="🔍 Google" name="from_ads_google" value={sources.ads_google} onChange={(v) => setSources((s) => ({ ...s, ads_google: v }))} />
            <SourceField label="🎵 TikTok" name="from_ads_tiktok" value={sources.ads_tiktok} onChange={(v) => setSources((s) => ({ ...s, ads_tiktok: v }))} />
          </div>
          <input autoComplete="off" type="hidden" name="closing_ads" value={sources.ads_meta + sources.ads_google + sources.ads_tiktok} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-green-50 border border-green-200">
            <p className="text-[11px] font-bold text-green-700 uppercase tracking-wider">Total Closing</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{totalTerjual}</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">Sisa Seat</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{selectedTrip ? sisaSeat : '—'}</p>
          </div>
        </div>
      </Section>

      <Section title="🎯 Leads Harian dari Iklan">
        <p className="text-xs text-slate-500 -mt-2 mb-3">Untuk dihitung CAC & conversion rate di Ads Manager.</p>
        <div className="grid grid-cols-3 gap-3">
          <SourceField label="📱 Meta Leads"   name="leads_ads_meta"   value={adsLeads.meta}   onChange={(v) => setAdsLeads((s) => ({ ...s, meta: v }))} />
          <SourceField label="🔍 Google Leads" name="leads_ads_google" value={adsLeads.google} onChange={(v) => setAdsLeads((s) => ({ ...s, google: v }))} />
          <SourceField label="🎵 TikTok Leads" name="leads_ads_tiktok" value={adsLeads.tiktok} onChange={(v) => setAdsLeads((s) => ({ ...s, tiktok: v }))} />
        </div>
      </Section>

      <Section title="Detail Peserta Baru + Passport AI + DP + Family + Chat-to-Close">
        <p className="text-[11px] text-slate-500 -mt-2 mb-3">
          💡 <b>⏱ Days to Close</b>: ketik berapa hari (contoh: 4) dari chat pertama sampai closing → analytics di Ads Manager<br />
          💡 <b>🛂 Passport</b>: upload foto → AI auto-fill data passport<br />
          💡 <b>💵 DP</b>: nominal + bukti transfer → masuk Invoice tab buat Finance approve<br />
          💡 <b>👨‍👩‍👧 Family Name</b>: peserta pertama dengan nama family sama jadi <b>kepala</b>
        </p>

        {participants.length === 0 ? (
          <button type="button" onClick={addParticipant} className="w-full py-2.5 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-sm font-semibold rounded-lg transition-colors">
            + Tambah Peserta
          </button>
        ) : (
          <div className="space-y-4">
            {participants.map((p, i) => {
              const fnTrim = (p.family_name || '').trim();
              const familyMembers = fnTrim ? familyGroupsPreview[fnTrim] || [] : [];
              const isFirstOfFamily = familyMembers.length > 0 && familyMembers[0].idx === i;
              const dpAmt = parseInt(p.dp_amount) || 0;
              // R150 v2: langsung dari input angka
              const daysToCloseNum = p.days_to_close === '' || p.days_to_close == null
                ? null
                : parseInt(p.days_to_close);
              const daysToClose = (daysToCloseNum != null && !isNaN(daysToCloseNum)) ? daysToCloseNum : null;

              return (
                <div key={i} className={`border rounded-lg p-3 bg-white ${
                  fnTrim ? 'border-indigo-300 border-l-4' : 'border-slate-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-brand-700">
                      Peserta #{i + 1}
                      {p.passport_photo_url && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold">🛂 Passport ✓</span>}
                      {daysToClose != null && (
                        <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          daysToClose <= 3 ? 'bg-emerald-100 text-emerald-800'
                            : daysToClose <= 14 ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          ⏱ {daysToClose}d close
                        </span>
                      )}
                      {fnTrim && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
                          👨‍👩‍👧 {fnTrim}{isFirstOfFamily ? ' 👑 KEPALA' : ' (anggota)'}
                        </span>
                      )}
                    </p>
                    <button type="button" onClick={() => rmParticipant(i)} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold">✕ Hapus</button>
                  </div>

                  {/* PASSPORT AI section */}
                  <div className="mb-3 pb-3 border-b border-dashed border-purple-300">
                    <PassportUploadAI
                      tripId={tripId || 'cs-passport'}
                      paxIndex={i}
                      passportData={p}
                      onChange={(key, val) => updParticipant(i, key, val)}
                      onExtracted={(updates) => handlePassportExtracted(i, updates)}
                    />
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
                      <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Tipe (Base Price)</span>
                      <select value={p.room_type} onChange={(e) => updParticipant(i, 'room_type', e.target.value)} className={miniInput}>
                        <option value="">— Pilih —</option>
                        {ROOM_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">Harga PAKET / peserta (opsional)</span>
                      <input autoComplete="off" type="number" value={p.price_paid} min="0" onChange={(e) => updParticipant(i, 'price_paid', e.target.value)} className={miniInput} placeholder="Kosongkan = ikut harga paket trip" />
                      <span className="block text-[9.5px] text-amber-700 mt-0.5">⚠ Ini HARGA PAKET, bukan DP. DP diisi di kolom DP di bawah. Kosongkan kalau harga normal.</span>
                      {parseInt(p.price_paid) > 0 && parseInt(p.dp_amount) > 0 && parseInt(p.price_paid) === parseInt(p.dp_amount) && (
                        <span className="block text-[10px] text-red-600 font-bold mt-0.5">⚠ Nilai ini sama dengan DP — yakin ini harga paket, bukan DP?</span>
                      )}
                    </label>
                    <label className="block">
                      <span className="text-[11px] font-semibold text-emerald-700 block mb-0.5">💸 Diskon (Rp, opsional)</span>
                      <input autoComplete="off" type="number" value={p.discount} min="0" onChange={(e) => updParticipant(i, 'discount', e.target.value)} className={miniInput} placeholder="0" />
                    </label>
                    {(
                      <div className="block sm:col-span-2 mt-1 flex flex-wrap gap-4 bg-amber-50/40 border border-amber-200 rounded-lg px-2 py-1.5">
                        {(
                          <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-700">
                            <span className="text-slate-500">Visa:</span>
                            {_visaLocked ? (
                              <span>Urus visa lewat kami (wajib group)</span>
                            ) : (<>
                              <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`visa_${i}`} checked={!!p.include_visa && !p.visa_ready} onChange={() => { updParticipant(i, 'include_visa', true); updParticipant(i, 'visa_ready', false); }} className="w-3.5 h-3.5" /> Include Visa</label>
                              <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`visa_${i}`} checked={!!p.visa_ready} onChange={() => { updParticipant(i, 'visa_ready', true); updParticipant(i, 'include_visa', false); }} className="w-3.5 h-3.5" /> Sudah ready visa</label>
                              <label className="flex items-center gap-1 cursor-pointer"><input type="radio" name={`visa_${i}`} checked={!p.include_visa && !p.visa_ready} onChange={() => { updParticipant(i, 'include_visa', false); updParticipant(i, 'visa_ready', false); }} className="w-3.5 h-3.5" /> Tidak</label>
                            </>)}
                          </div>
                        )}
                        {(
                          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700">
                            <input type="checkbox" checked={!!p.include_asuransi} onChange={(e) => updParticipant(i, 'include_asuransi', e.target.checked)} className="w-3.5 h-3.5" />
                            Include Asuransi
                          </label>
                        )}
                      </div>
                    )}
                  </div>

                  {/* R150 v2: TIME-TO-CLOSING — langsung ketik angka */}
                  <div className="mt-3 pt-3 border-t border-dashed border-emerald-300 bg-emerald-50/30 -mx-3 px-3 pb-2">
                    <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-2">
                      ⏱ Berapa Lama Chat Sampai Closing
                    </p>
                    <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                      <label className="block">
                        <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">
                          Berapa hari dari chat pertama sampai closing?
                        </span>
                        <input autoComplete="off"
                          type="number"
                          min="0"
                          max="365"
                          step="1"
                          value={p.days_to_close}
                          onChange={(e) => updParticipant(i, 'days_to_close', e.target.value.replace(/[^0-9]/g, ''))}
                          placeholder="contoh: 4"
                          className={miniInput}
                        />
                      </label>
                      {daysToClose != null && (
                        <div className={`px-3 py-1.5 rounded text-sm font-bold border ${
                          daysToClose <= 3 ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                            : daysToClose <= 14 ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
                            : 'bg-orange-100 text-orange-700 border-orange-300'
                        }`}>
                          {daysToClose} hari
                        </div>
                      )}
                    </div>
                    {daysToClose != null && (
                      <p className="mt-1 text-[10px] text-emerald-700">
                        {daysToClose === 0 && '⚡ Hot lead — closing langsung hari yang sama'}
                        {daysToClose >= 1 && daysToClose <= 3 && '🔥 Fast conversion — kurang dari 1 minggu'}
                        {daysToClose >= 4 && daysToClose <= 14 && '👍 Normal — 1-2 minggu'}
                        {daysToClose >= 15 && daysToClose <= 30 && '🐢 Slow — 2-4 minggu, butuh nurturing'}
                        {daysToClose > 30 && '🐌 Very slow — perlu strategi follow-up baru'}
                      </p>
                    )}
                  </div>

                  {/* FAMILY */}
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
                        onChange={(e) => updParticipant(i, 'family_name', e.target.value)}
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

                  {/* DP */}
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
                          onChange={(e) => updParticipant(i, 'dp_amount', parseInput(e.target.value))}
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
                          onChange={(e) => updParticipant(i, 'dp_date', e.target.value)}
                          className={miniInput}
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10px] font-semibold text-slate-700 block mb-0.5">Metode</span>
                        <select
                          value={p.dp_method || 'transfer'}
                          onChange={(e) => updParticipant(i, 'dp_method', e.target.value)}
                          className={miniInput}
                        >
                          <option value="transfer">Transfer</option>
                          <option value="cash">Cash</option>
                          <option value="manual">Manual</option>
                        </select>
                      </label>
                    </div>

                    {dpAmt > 0 && (
                      <div className="mt-2 p-2 bg-white border-2 border-blue-300 rounded">
                        <FileUploadInput
                          tripId={tripId || 'dp-cs'}
                          subfolder={`dp-bukti/pax${i}`}
                          value={p.dp_proof_url}
                          onChange={(url) => updParticipant(i, 'dp_proof_url', url)}
                          label="📎 Upload Bukti Transfer DP"
                          maxSizeMB={20}
                        />
                        <p className="text-[10px] text-blue-700 mt-1">
                          💡 Foto/screenshot bukti transfer — Finance akan cek di /invoices sebelum approve
                        </p>
                      </div>
                    )}

                    {dpAmt > 0 && (
                      <p className="mt-1 text-[10px] text-blue-700">
                        ✓ DP Rp {Number(p.dp_amount).toLocaleString('id-ID')} → /invoices (pending Finance approval)
                        {p.dp_proof_url ? ' · 📎 Bukti sudah di-upload' : ' · ⚠ belum upload bukti'}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={addParticipant} className="w-full py-2 border-2 border-dashed border-brand-300 hover:border-brand-500 text-brand-600 text-xs font-semibold rounded-lg transition-colors">
              + Tambah Peserta Lain
            </button>
          </div>
        )}

        {(totalDPInputed > 0 || familyCount > 0 || passportUploaded > 0 || chatDatesFilled > 0) && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
            {chatDatesFilled > 0 && avgDaysToClose != null && (
              <div className="p-2 bg-emerald-100 border border-emerald-300 rounded text-xs">
                <p className="font-bold text-emerald-900">
                  ⏱ Avg Days to Close: {avgDaysToClose}
                </p>
                <p className="text-[10px] text-emerald-700 mt-0.5">
                  {chatDatesFilled}/{filledParticipants.length} peserta tracked
                </p>
              </div>
            )}
            {passportUploaded > 0 && (
              <div className="p-2 bg-purple-100 border border-purple-300 rounded text-xs">
                <p className="font-bold text-purple-900">
                  🛂 Passport: {passportUploaded}/{filledParticipants.length}
                </p>
                <p className="text-[10px] text-purple-700 mt-0.5">
                  AI auto-extract data passport
                </p>
              </div>
            )}
            {totalDPInputed > 0 && (
              <div className="p-2 bg-blue-100 border border-blue-300 rounded text-xs">
                <p className="font-bold text-blue-900">
                  💵 DP: Rp {totalDPInputed.toLocaleString('id-ID')}
                </p>
                <p className="text-[10px] text-blue-700 mt-0.5">
                  📎 {dpWithProof} ada bukti
                  {dpWithoutProof > 0 && <span className="text-amber-700 font-bold"> · ⚠ {dpWithoutProof} belum</span>}
                </p>
              </div>
            )}
            {familyCount > 0 && (
              <div className="p-2 bg-indigo-100 border border-indigo-300 rounded text-xs">
                <p className="font-bold text-indigo-900">
                  👨‍👩‍👧 {familyCount} Family Group
                </p>
                <p className="text-[10px] text-indigo-700 mt-0.5">
                  {Object.entries(familyGroupsPreview).map(([name, ms]) => `${name}: ${ms.length}`).join(' · ')}
                </p>
              </div>
            )}
          </div>
        )}
      </Section>

      <Field label="Total Leads Organik Hari Ini" hint="Leads yang BUKAN dari ads (organik IG, WA, referral)">
        <input autoComplete="off" type="number" name="jumlah_leads" defaultValue="0" min="0" className={inputCls} />
      </Field>

      <Field label="Catatan (opsional)">
        <textarea autoComplete="off" name="notes" rows="3" className={inputCls + ' resize-none'} placeholder="Hal penting hari ini..." />
      </Field>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium whitespace-pre-wrap">{error}</div>}

      <button type="submit" disabled={pending} className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card">
        {pending ? 'Menyimpan...' : `Simpan${filledParticipants.length > 0 ? ` + ${filledParticipants.length} Peserta` : ''}${passportUploaded > 0 ? ` + ${passportUploaded} Passport` : ''}${totalDPInputed > 0 ? ` + DP ${totalDPInputed.toLocaleString('id-ID')}` : ''}${familyCount > 0 ? ` + ${familyCount} Family` : ''}${chatDatesFilled > 0 ? ` · ⏱ avg ${avgDaysToClose}d` : ''}`}
      </button>
    </form>
  );
}

function SourceField({ label, name, value, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{label}</span>
      <input autoComplete="off" type="number" name={name} value={value} onChange={(e) => onChange(parseInt(e.target.value) || 0)} onFocus={(e) => e.target.select()} min="0" className={inputCls} />
    </label>
  );
}

function PaxInput({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-slate-700 block mb-0.5">{label}</span>
      <input autoComplete="off" type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} className={miniInput} />
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
