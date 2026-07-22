'use client';

import { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { saveTourConfirmation, sendTourConfirmation, getTCRecipients } from '@/lib/actions/tour-confirmation';

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm';
const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase mb-1';

export default function TourConfirmationEditor({ tripId, trip = {}, initialTc = {} }) {
  const [f, setF] = useState({
    group_name: initialTc.group_name || '',
    periode: initialTc.periode || '',
    tour_leader: initialTc.tour_leader || '',
    waktu_kumpul: initialTc.waktu_kumpul || '',
    meeting_point: initialTc.meeting_point || '',
    meeting_note: initialTc.meeting_note || '',
    detail_flight: initialTc.detail_flight || '',
  });
  const [itin, setItin] = useState(Array.isArray(initialTc.itinerary) ? initialTc.itinerary : []);
  const [hotels, setHotels] = useState(Array.isArray(initialTc.hotels) ? initialTc.hotels : []);
  const [genInfo, setGenInfo] = useState(Array.isArray(initialTc.general_info) ? initialTc.general_info.map((s) => ({ title: s?.title || '', items: Array.isArray(s?.items) ? s.items : [] })) : []);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');
  const [pending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [customMsg, setCustomMsg] = useState('');
  const [families, setFamilies] = useState(null); // null = belum dimuat
  const [noPhone, setNoPhone] = useState(0);
  const [selected, setSelected] = useState(() => new Set()); // set of participant ids
  const [loadingRcp, setLoadingRcp] = useState(false);

  useEffect(() => {
    if (!showSend || families !== null) return;
    setLoadingRcp(true);
    getTCRecipients(tripId).then((r) => {
      if (r?.error) { flash(r.error, 'error'); setFamilies([]); }
      else {
        setFamilies(r.families || []);
        setNoPhone(r.noPhone || 0);
        const all = new Set();
        for (const f of (r.families || [])) for (const id of f.memberIds) all.add(String(id));
        setSelected(all);
      }
      setLoadingRcp(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSend]);

  function toggleFamily(fam, on) {
    setSelected((prev) => {
      const s = new Set(prev);
      for (const id of fam.memberIds) { if (on) s.add(String(id)); else s.delete(String(id)); }
      return s;
    });
  }
  function setAll(on) {
    setSelected(() => {
      const s = new Set();
      if (on) for (const f of (families || [])) for (const id of f.memberIds) s.add(String(id));
      return s;
    });
  }
  const famChecked = (fam) => fam.memberIds.every((id) => selected.has(String(id)));
  const selectedContacts = (families || []).filter((f) => f.memberIds.some((id) => selected.has(String(id)))).length;

  function flash(text, type = 'ok') { setMsg(text); setMsgType(type); if (type === 'ok') setTimeout(() => setMsg(''), 4000); }
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  function updItin(i, k, v) { setItin((arr) => arr.map((d, idx) => idx === i ? { ...d, [k]: v } : d)); }
  function addItin() { setItin((arr) => [...arr, { day: `Day ${String(arr.length + 1).padStart(2, '0')}`, route: '', date: '', schedule: '', hotel: '' }]); }
  function delItin(i) { setItin((arr) => arr.filter((_, idx) => idx !== i)); }
  function moveItin(i, dir) {
    setItin((arr) => { const a = [...arr]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; });
  }

  function updHotel(i, k, v) { setHotels((arr) => arr.map((h, idx) => idx === i ? { ...h, [k]: v } : h)); }
  function addHotel() { setHotels((arr) => [...arr, { name: '', address: '' }]); }
  function delHotel(i) { setHotels((arr) => arr.filter((_, idx) => idx !== i)); }

  function updGiTitle(i, v) { setGenInfo((arr) => arr.map((s, idx) => idx === i ? { ...s, title: v } : s)); }
  function updGiItems(i, text) { setGenInfo((arr) => arr.map((s, idx) => idx === i ? { ...s, items: text.split('\n') } : s)); }
  function addGi() { setGenInfo((arr) => [...arr, { title: '', items: [] }]); }
  function delGi(i) { setGenInfo((arr) => arr.filter((_, idx) => idx !== i)); }
  function moveGi(i, dir) { setGenInfo((arr) => { const a = [...arr]; const j = i + dir; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; }); }

  function payload() { return { ...f, itinerary: itin, hotels, general_info: genInfo }; }

  function handleSave(then) {
    startTransition(async () => {
      const r = await saveTourConfirmation(tripId, payload());
      if (r?.error) { flash('Gagal simpan: ' + r.error, 'error'); return; }
      flash('✓ Tour Confirmation tersimpan');
      if (typeof then === 'function') then(r.public_token);
    });
  }

  function handleDownload() {
    handleSave((token) => { if (token) window.open(`/tc/${token}`, '_blank', 'noopener'); });
  }

  async function handleSend() {
    const ids = Array.from(selected);
    if (!ids.length) { flash('Pilih minimal 1 peserta.', 'error'); return; }
    if (!confirm(`Kirim Tour Confirmation ke ${selectedContacts} kontak (${ids.length} peserta) via WhatsApp (nomor PIC)?`)) return;
    setSending(true);
    // Simpan dulu supaya link & data terbaru.
    const s = await saveTourConfirmation(tripId, payload());
    if (s?.error) { flash('Gagal simpan sebelum kirim: ' + s.error, 'error'); setSending(false); return; }
    const r = await sendTourConfirmation(tripId, customMsg, ids);
    setSending(false);
    if (r?.error) { flash(r.error, 'error'); return; }
    flash(`✓ Terkirim ke ${r.sent} kontak${r.failed ? `, gagal ${r.failed}` : ''}${r.usedPicNumber ? ' (nomor PIC)' : ' (nomor CS — PIC belum punya nomor)'}`);
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`p-3 rounded-lg text-sm font-medium ${msgType === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>{msg}</div>
      )}

      {/* INFO GROUP */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
        <h2 className="font-bold text-brand-700">📋 Info Group</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label className={labelCls}>Nama Group / Tour</label><input autoComplete="off" className={inputCls} value={f.group_name} onChange={set('group_name')} placeholder="521 East Europe + Switzerland" /></div>
          <div><label className={labelCls}>Periode</label><input autoComplete="off" className={inputCls} value={f.periode} onChange={set('periode')} placeholder="28 Dec 2026 - 06 Jan 2027" /></div>
          <div><label className={labelCls}>Tour Leader</label><input autoComplete="off" className={inputCls} value={f.tour_leader} onChange={set('tour_leader')} placeholder="TBA" /></div>
          <div><label className={labelCls}>Waktu Kumpul</label><input autoComplete="off" className={inputCls} value={f.waktu_kumpul} onChange={set('waktu_kumpul')} placeholder="Senin, 28 Dec 2026 pukul 14.00 (4 jam sebelum keberangkatan)" /></div>
          <div><label className={labelCls}>Meeting Point</label><input autoComplete="off" className={inputCls} value={f.meeting_point} onChange={set('meeting_point')} placeholder="Terminal 3 Bandara Soekarno Hatta" /></div>
          <div><label className={labelCls}>Catatan Meeting (italic)</label><input autoComplete="off" className={inputCls} value={f.meeting_note} onChange={set('meeting_note')} placeholder="Titik Kumpul akan diinfokan kembali oleh TL" /></div>
        </div>
        <div>
          <label className={labelCls}>Detail Flight (1 penerbangan per baris)</label>
          <textarea className={`${inputCls} font-mono`} rows={4} value={f.detail_flight} onChange={set('detail_flight')} placeholder={"EY475 28DEC CGKAUH 1800 - 2310\nEY81 29DEC AUHMXP 0235 - 0630"} />
        </div>
      </div>

      {/* ITINERARY */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-brand-700">🗺 Itinerary</h2>
            <p className="text-[11px] text-slate-500">Diambil dari itinerary web — boleh diubah manual. Isi juga hotel per hari.</p>
          </div>
          <button type="button" onClick={addItin} className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg">+ Tambah Hari</button>
        </div>
        {itin.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Belum ada itinerary. Klik "+ Tambah Hari".</p>
        ) : (
          <div className="space-y-3">
            {itin.map((d, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-500">#{i + 1}</span>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => moveItin(i, -1)} className="px-2 py-0.5 text-xs bg-slate-200 rounded" title="Naik">↑</button>
                    <button type="button" onClick={() => moveItin(i, 1)} className="px-2 py-0.5 text-xs bg-slate-200 rounded" title="Turun">↓</button>
                    <button type="button" onClick={() => delItin(i)} className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded font-bold">🗑</button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input autoComplete="off" className={inputCls} value={d.day || ''} onChange={(e) => updItin(i, 'day', e.target.value)} placeholder="Day 01" />
                  <input autoComplete="off" className={inputCls} value={d.route || ''} onChange={(e) => updItin(i, 'route', e.target.value)} placeholder="Jakarta - Abu Dhabi" />
                  <input autoComplete="off" className={inputCls} value={d.date || ''} onChange={(e) => updItin(i, 'date', e.target.value)} placeholder="28 December 2026" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                  <div>
                    <span className="text-[10px] text-slate-400">Schedule (Enter = baris baru)</span>
                    <textarea className={inputCls} rows={4} value={d.schedule || ''} onChange={(e) => updItin(i, 'schedule', e.target.value)} placeholder={"Meeting Point at Airport\nFlight to ...\n- Visit ..."} />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400">Hotel (Enter = baris baru)</span>
                    <textarea className={inputCls} rows={4} value={d.hotel || ''} onChange={(e) => updItin(i, 'hotel', e.target.value)} placeholder={"Hotel : TBA"} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* HOTELS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-brand-700">🏨 Nama & Alamat Hotel</h2>
            <p className="text-[11px] text-slate-500">Daftar hotel yang dipakai + alamat (tampil di bawah itinerary).</p>
          </div>
          <button type="button" onClick={addHotel} className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg">+ Tambah Hotel</button>
        </div>
        {hotels.length === 0 ? (
          <p className="text-sm text-slate-400 py-3 text-center">Belum ada hotel. (Opsional)</p>
        ) : (
          <div className="space-y-2">
            {hotels.map((h, i) => (
              <div key={i} className="flex gap-2 items-start">
                <textarea className={`${inputCls} md:w-1/3`} rows={2} value={h.name || ''} onChange={(e) => updHotel(i, 'name', e.target.value)} placeholder="Nama Hotel" />
                <textarea className={inputCls} rows={2} value={h.address || ''} onChange={(e) => updHotel(i, 'address', e.target.value)} placeholder="Alamat hotel (Enter = baris baru)" />
                <button type="button" onClick={() => delHotel(i)} className="px-2 py-2 text-xs bg-red-100 text-red-700 rounded font-bold shrink-0">🗑</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GENERAL INFORMATION */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-brand-700">📑 General Information (Syarat & Ketentuan)</h2>
            <p className="text-[11px] text-slate-500">Sudah terisi teks baku — boleh diedit/tambah/hapus. Tiap poin = 1 baris (Enter = poin baru).</p>
          </div>
          <button type="button" onClick={addGi} className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold rounded-lg">+ Tambah Bagian</button>
        </div>
        {genInfo.length === 0 ? (
          <p className="text-sm text-slate-400 py-3 text-center">Belum ada bagian. Klik "+ Tambah Bagian".</p>
        ) : (
          <div className="space-y-3">
            {genInfo.map((s, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-slate-500 shrink-0">{i + 1}.</span>
                  <input autoComplete="off" className={`${inputCls} font-bold`} value={s.title || ''} onChange={(e) => updGiTitle(i, e.target.value)} placeholder="Judul bagian (mis. MEETING POINT)" />
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => moveGi(i, -1)} className="px-2 py-0.5 text-xs bg-slate-200 rounded" title="Naik">↑</button>
                    <button type="button" onClick={() => moveGi(i, 1)} className="px-2 py-0.5 text-xs bg-slate-200 rounded" title="Turun">↓</button>
                    <button type="button" onClick={() => delGi(i)} className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded font-bold">🗑</button>
                  </div>
                </div>
                <textarea className={inputCls} rows={Math.max(2, (s.items || []).length)} value={(s.items || []).join('\n')} onChange={(e) => updGiItems(i, e.target.value)} placeholder={"1 poin per baris..."} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3 sticky bottom-2">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => handleSave()} disabled={pending} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">{pending ? '⏳ Menyimpan...' : '💾 Simpan'}</button>
          <button type="button" onClick={handleDownload} disabled={pending} className="px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-bold rounded-lg">📄 Simpan & Download PDF</button>
          <button type="button" onClick={() => setShowSend((v) => !v)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg">📨 Kirim ke Peserta</button>
        </div>

        {showSend && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <p className="text-xs text-blue-800">Dikirim via WhatsApp <b>nomor PIC</b> (fallback CS kalau PIC belum punya nomor). Link Tour Confirmation otomatis dilampirkan. 1 pesan per keluarga (nomor sama). Kosongkan pesan untuk pakai teks default.</p>

            {/* CHECKLIST PENERIMA */}
            <div className="bg-white rounded-lg border border-slate-200 p-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-600">Pilih penerima {families ? `(${selectedContacts}/${families.length} kontak)` : ''}</span>
                {families && families.length > 0 && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAll(true)} className="text-[11px] font-semibold text-blue-700 hover:underline">Pilih semua</button>
                    <button type="button" onClick={() => setAll(false)} className="text-[11px] font-semibold text-slate-500 hover:underline">Kosongkan</button>
                  </div>
                )}
              </div>
              {loadingRcp ? (
                <p className="text-xs text-slate-400 py-2 text-center">⏳ Memuat penerima...</p>
              ) : !families || families.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">Tidak ada peserta dengan nomor HP.</p>
              ) : (
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {families.map((fam) => (
                    <label key={fam.key} className="flex items-start gap-2 py-1.5 cursor-pointer">
                      <input autoComplete="off" type="checkbox" checked={famChecked(fam)} onChange={(e) => toggleFamily(fam, e.target.checked)} className="mt-0.5 w-4 h-4 accent-blue-600" />
                      <span className="text-xs">
                        <b className="text-slate-800">{fam.headName}</b>
                        {fam.count > 1 && <span className="text-slate-500"> +{fam.count - 1} anggota</span>}
                        <span className="text-slate-400"> · {fam.phone}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {noPhone > 0 && <p className="text-[10px] text-amber-700 mt-1">⚠ {noPhone} peserta tanpa nomor HP (tidak bisa dikirim).</p>}
            </div>

            <textarea className={`${inputCls} bg-white`} rows={4} value={customMsg} onChange={(e) => setCustomMsg(e.target.value)} placeholder={`(Opsional) Teks pembuka custom. Pakai {{nama}} untuk nama peserta.\nContoh: Halo kak {{nama}}, berikut final tour confirmation & itinerary trip. Mohon dicek ya 🙏`} />
            <button type="button" onClick={handleSend} disabled={sending || loadingRcp} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg">{sending ? '⏳ Mengirim...' : `🚀 Kirim ke ${selectedContacts} kontak`}</button>
          </div>
        )}
      </div>
    </div>
  );
}
