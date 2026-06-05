'use client';

// R215d + R215j: Hotel HPP Calculator
// R215j FIX:
//   - Save jalan walau auto-count = 0 (manual override OK)
//   - Persistent error message (gak auto-hide untuk error)
//   - Console.log on save attempt + result (debug)
//   - Try-catch wrap supaya error visible
//   - Default pax_in_room minimum 1 (gak ke-set 0 kalau room kosong)
// Path: components/finance/HotelHPPSection.jsx

import { useState, useTransition, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  saveHotelHPP,
  updatePaxRoomType,
  updateTripKurs,
} from '@/lib/actions/hotel-hpp';
import {
  ROOM_TYPES,
  CURRENCIES,
  ROOM_CAPACITY,
  countPaxByRoomType,
  calcHotelCost,
  calcHotelCostPerPax,
  fmtCurrency,
} from '@/lib/utils/room-pricing';

function fmtRp(n) {
  return `Rp ${Number(n || 0).toLocaleString('id-ID')}`;
}

export default function HotelHPPSection({ trip, passengers = [], customers = [], hotelItems = [] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [openKurs, setOpenKurs] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);

  const custMap = useMemo(
    () => Object.fromEntries((customers || []).map((c) => [c.id, c])),
    [customers]
  );

  const activePassengers = useMemo(
    () => passengers.filter((p) => {
      if (p.transfer_status === 'transferred') return false;
      if (p.refund_status === 'refunded' || p.refund_status === 'partial_refund') return false;
      return true;
    }),
    [passengers]
  );

  const counts = useMemo(() => countPaxByRoomType(activePassengers), [activePassengers]);

  // R215j — default pax_in_room minimum 1 (kalau auto-count 0, fallback ke activePassengers length atau 1)
  const initialPaxInRoom = counts.quad > 0 ? counts.quad : (activePassengers.length || 1);

  const [form, setForm] = useState({
    calc_mode: 'per_room',
    hotel_name: '',
    vendor_name: '',
    category: 'Hotel',
    room_type: 'quad',
    pax_in_room: initialPaxInRoom,
    price_per_room: 0,
    pax_count: activePassengers.length || 1,
    price_per_pax: 0,
    currency: 'SAR',
    nights: 1,
    price_mode: 'per_night',
    notes: '',
  });

  // R215j — Sync pax defaults kalau passengers berubah
  useEffect(() => {
    setForm((f) => ({
      ...f,
      pax_in_room: f.pax_in_room > 0 ? f.pax_in_room : (counts[f.room_type] || activePassengers.length || 1),
      pax_count: f.pax_count > 0 ? f.pax_count : (activePassengers.length || 1),
    }));
  }, [activePassengers.length]);

  const [kurs, setKurs] = useState({
    kurs_usd: trip?.kurs_usd || 16000,
    kurs_eur: trip?.kurs_eur || 18000,
    kurs_sar: trip?.kurs_sar || 4500,
  });

  // R215j — Saat room_type berubah, fallback chain yg robust
  function handleRoomTypeChange(newType) {
    setForm((f) => ({
      ...f,
      room_type: newType,
      pax_in_room: counts[newType] > 0 ? counts[newType] : (f.pax_in_room || activePassengers.length || 1),
    }));
  }

  // R215j — Persistent error message (gak auto-hide), success auto-hide 5s
  function showMsg(text, type = 'success') {
    setMsg({ text, type });
    if (type !== 'error') {
      setTimeout(() => setMsg(null), 5000);
    }
  }

  const currentKurs = (() => {
    if (form.currency === 'USD') return kurs.kurs_usd;
    if (form.currency === 'EUR') return kurs.kurs_eur;
    if (form.currency === 'SAR') return kurs.kurs_sar;
    return 1;
  })();

  const calc = form.calc_mode === 'per_room'
    ? calcHotelCost({
        paxInRoom: form.pax_in_room,
        roomType: form.room_type,
        pricePerRoom: form.price_per_room,
        currency: form.currency,
        kurs: currentKurs,
        nights: form.nights,
        priceMode: form.price_mode,
      })
    : calcHotelCostPerPax({
        pax: form.pax_count,
        pricePerPax: form.price_per_pax,
        currency: form.currency,
        kurs: currentKurs,
        nights: form.nights,
        priceMode: form.price_mode,
      });

  // R215j — Validation flags (untuk UI feedback)
  const hotelNameValid = form.hotel_name.trim().length > 0;
  const priceValid = form.calc_mode === 'per_room'
    ? (form.price_per_room > 0)
    : (form.price_per_pax > 0);
  const paxValid = form.calc_mode === 'per_room'
    ? (form.pax_in_room > 0)
    : (form.pax_count > 0);
  const isFormValid = hotelNameValid && priceValid && paxValid;

  function handleSave() {
    // R215j — Debug log SEBELUM action
    console.log('[HotelHPP] handleSave START', {
      form,
      currentKurs,
      calc,
      tripId: trip?.id,
    });

    if (!form.hotel_name.trim()) {
      showMsg('❌ Nama hotel wajib diisi', 'error');
      return;
    }

    if (form.calc_mode === 'per_room') {
      if (!form.price_per_room || form.price_per_room <= 0) {
        showMsg('❌ Harga per room wajib > 0', 'error');
        return;
      }
      if (form.pax_in_room <= 0) {
        showMsg('❌ Pax di room = 0. Input jumlah pax MANUAL di field "Pax di Room ini" atau assign peserta dulu.', 'error');
        return;
      }
    } else {
      if (!form.price_per_pax || form.price_per_pax <= 0) {
        showMsg('❌ Harga per pax wajib > 0', 'error');
        return;
      }
      if (form.pax_count <= 0) {
        showMsg('❌ Jumlah pax = 0. Input jumlah pax manual.', 'error');
        return;
      }
    }

    startTransition(async () => {
      try {
        const payload = {
          trip_id: trip.id,
          hotel_name: form.hotel_name.trim(),
          vendor_name: form.vendor_name.trim(),
          category: form.category,
          calc_mode: form.calc_mode,
          room_type: form.room_type,
          pax_in_room: Number(form.pax_in_room) || 0,
          price_per_room: Number(form.price_per_room) || 0,
          pax_count: Number(form.pax_count) || 0,
          price_per_pax: Number(form.price_per_pax) || 0,
          currency: form.currency,
          nights: Number(form.nights) || 1,
          price_mode: form.price_mode,
          notes: form.notes,
        };

        console.log('[HotelHPP] calling saveHotelHPP with payload:', payload);

        const r = await saveHotelHPP(payload);

        console.log('[HotelHPP] saveHotelHPP response:', r);

        if (r?.error) {
          showMsg('❌ Gagal save: ' + r.error, 'error');
          return;
        }
        if (!r?.ok) {
          showMsg('❌ Save tidak return ok. Response: ' + JSON.stringify(r), 'error');
          return;
        }

        const totalDisplay = r.calc?.totalIDR ? fmtRp(r.calc.totalIDR) : 'OK';
        showMsg(`✓ ${form.hotel_name} saved: ${totalDisplay} · Lanjut input hotel berikutnya${r.warning ? ' · ' + r.warning : ''}`);

        setForm((f) => ({
          ...f,
          hotel_name: '',
          vendor_name: '',
          price_per_room: 0,
          price_per_pax: 0,
          notes: '',
        }));
        router.refresh();
      } catch (e) {
        console.error('[HotelHPP] save error caught:', e);
        showMsg('❌ Error: ' + (e?.message || String(e)), 'error');
      }
    });
  }

  function handleAssignRoom(passengerId, roomType) {
    startTransition(async () => {
      const r = await updatePaxRoomType(passengerId, roomType);
      if (r.error) showMsg(r.error, 'error');
      else router.refresh();
    });
  }

  function handleSaveKurs() {
    startTransition(async () => {
      const r = await updateTripKurs(trip.id, kurs);
      if (r.error) showMsg(r.error, 'error');
      else {
        showMsg('✓ Kurs trip ter-update');
        router.refresh();
      }
    });
  }

  return (
    <div className="bg-white rounded-xl border-2 border-amber-300 shadow-card overflow-hidden">
      <div className="px-5 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-bold text-amber-800 flex items-center gap-2">
              <span>🏨</span> Hotel HPP Calculator (auto room × harga)
            </h2>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Input harga per room/pax → auto-hitung total + auto convert ke Rupiah
            </p>
          </div>
          <div className="text-xs text-slate-600">
            {activePassengers.length} pax aktif · {counts.unassigned > 0 ? <span className="text-red-600 font-bold">{counts.unassigned} belum di-assign</span> : <span className="text-green-700">✓ Semua ter-assign</span>}
          </div>
        </div>
      </div>

      {/* R215j — Persistent message */}
      {msg && (
        <div className={`px-5 py-3 text-sm border-b font-medium flex items-start justify-between gap-2 ${
          msg.type === 'error' ? 'bg-red-50 text-red-800 border-red-300' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          <span>{msg.text}</span>
          {msg.type === 'error' && (
            <button
              type="button"
              onClick={() => setMsg(null)}
              className="text-xs px-2 py-0.5 bg-white border border-red-300 rounded hover:bg-red-100"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* ROOM SUMMARY */}
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">📊 Room Distribution</p>
          <button
            type="button"
            onClick={() => setOpenAssign((v) => !v)}
            className="text-[11px] font-semibold px-3 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded"
          >
            {openAssign ? '✕ Tutup' : '🛏 Assign Room per Peserta'}
          </button>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
          {ROOM_TYPES.map((rt) => (
            <div key={rt.key} className={`p-2 rounded ${rt.color} text-center`}>
              <p className="font-bold uppercase text-[10px]">{rt.label}</p>
              <p className="text-lg font-bold">{counts[rt.key] || 0}</p>
              <p className="text-[10px]">pax (cap {rt.capacity})</p>
            </div>
          ))}
          {counts.unassigned > 0 && (
            <div className="p-2 rounded bg-red-100 text-red-800 text-center">
              <p className="font-bold uppercase text-[10px]">Belum Assign</p>
              <p className="text-lg font-bold">{counts.unassigned}</p>
              <p className="text-[10px]">pax</p>
            </div>
          )}
        </div>

        {openAssign && (
          <div className="mt-3 p-3 bg-white rounded border border-slate-200 max-h-80 overflow-auto">
            <p className="text-xs font-bold text-slate-700 uppercase mb-2">Set room type per peserta:</p>
            {activePassengers.length === 0 ? (
              <p className="text-xs text-red-600">Tidak ada peserta aktif. Cek master trip atau status peserta (mungkin semua transferred/refunded).</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1">Nama</th>
                    <th className="px-2 py-1">Room Type</th>
                  </tr>
                </thead>
                <tbody>
                  {activePassengers.map((p) => {
                    const c = custMap[p.customer_id];
                    return (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="px-2 py-1">{c?.name || `#${p.id}`}</td>
                        <td className="px-2 py-1">
                          <select
                            defaultValue={p.room_type || ''}
                            disabled={pending}
                            onChange={(e) => handleAssignRoom(p.id, e.target.value)}
                            className="px-2 py-0.5 border border-slate-300 rounded text-xs"
                          >
                            <option value="">— Belum —</option>
                            {ROOM_TYPES.map((rt) => (
                              <option key={rt.key} value={rt.key}>{rt.label} ({rt.capacity})</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* KURS CONFIG */}
      <div className="px-5 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">💱 Rate Kurs Trip Ini</p>
          <button
            type="button"
            onClick={() => setOpenKurs((v) => !v)}
            className="text-[11px] font-semibold px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded"
          >
            {openKurs ? '✕ Tutup' : '⚙ Edit Kurs'}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2 bg-blue-50 rounded text-center">
            <p className="text-[10px] font-bold text-blue-700">🇺🇸 USD → IDR</p>
            <p className="font-bold text-blue-700">{fmtRp(kurs.kurs_usd)}</p>
          </div>
          <div className="p-2 bg-indigo-50 rounded text-center">
            <p className="text-[10px] font-bold text-indigo-700">🇪🇺 EUR → IDR</p>
            <p className="font-bold text-indigo-700">{fmtRp(kurs.kurs_eur)}</p>
          </div>
          <div className="p-2 bg-emerald-50 rounded text-center">
            <p className="text-[10px] font-bold text-emerald-700">🇸🇦 SAR → IDR</p>
            <p className="font-bold text-emerald-700">{fmtRp(kurs.kurs_sar)}</p>
          </div>
        </div>

        {openKurs && (
          <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-200">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block">USD → IDR</label>
                <input
                  type="number"
                  value={kurs.kurs_usd}
                  onChange={(e) => setKurs((k) => ({ ...k, kurs_usd: Number(e.target.value) }))}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block">EUR → IDR</label>
                <input
                  type="number"
                  value={kurs.kurs_eur}
                  onChange={(e) => setKurs((k) => ({ ...k, kurs_eur: Number(e.target.value) }))}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block">SAR → IDR</label>
                <input
                  type="number"
                  value={kurs.kurs_sar}
                  onChange={(e) => setKurs((k) => ({ ...k, kurs_sar: Number(e.target.value) }))}
                  className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveKurs}
              disabled={pending}
              className="mt-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded disabled:opacity-50"
            >
              {pending ? '⏳' : '💾 Simpan Kurs ke Trip'}
            </button>
          </div>
        )}
      </div>

      {/* HOTEL INPUT FORM */}
      <div className="p-5 space-y-3">
        <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">🏨 Input Hotel HPP</p>

        {/* MODE TOGGLE */}
        <div className="p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border-2 border-purple-300">
          <p className="text-xs font-bold text-purple-800 uppercase mb-2">⚙ Mode Perhitungan</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, calc_mode: 'per_room' }))}
              className={`flex-1 min-w-[200px] px-3 py-2 rounded text-sm font-bold transition ${
                form.calc_mode === 'per_room'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-purple-50'
              }`}
            >
              🛏 Mode A: Per Room × Hari
              <span className="block text-[10px] font-normal mt-0.5">
                Harga per kamar × jumlah room (auto dari pax) × hari
              </span>
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, calc_mode: 'per_pax' }))}
              className={`flex-1 min-w-[200px] px-3 py-2 rounded text-sm font-bold transition ${
                form.calc_mode === 'per_pax'
                  ? 'bg-purple-600 text-white shadow'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-purple-50'
              }`}
            >
              👥 Mode B: Per Pax × Hari
              <span className="block text-[10px] font-normal mt-0.5">
                Harga per peserta × jumlah peserta × hari (simpel)
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block uppercase">
              Nama Hotel <span className="text-red-500">*</span>
              {!hotelNameValid && <span className="text-red-500 ml-1">(wajib)</span>}
            </label>
            <input
              type="text"
              value={form.hotel_name}
              onChange={(e) => setForm((f) => ({ ...f, hotel_name: e.target.value }))}
              placeholder="e.g. Madinah Movenpick / Mekkah Hilton"
              className={`w-full px-3 py-1.5 border rounded text-sm ${hotelNameValid ? 'border-slate-300' : 'border-red-300 bg-red-50'}`}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block uppercase">Vendor (opsional)</label>
            <input
              type="text"
              value={form.vendor_name}
              onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
              placeholder="e.g. TBA Tours"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {form.calc_mode === 'per_room' ? (
            <>
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block uppercase">Room Type</label>
                <select
                  value={form.room_type}
                  onChange={(e) => handleRoomTypeChange(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm bg-white"
                >
                  {ROOM_TYPES.map((rt) => (
                    <option key={rt.key} value={rt.key}>
                      {rt.label} (cap {rt.capacity})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-600 block uppercase">
                  Pax di Room ini <span className="text-red-500">*</span>
                  <span className="text-amber-600 ml-1">(auto: {counts[form.room_type] || 0})</span>
                </label>
                <input
                  type="number"
                  value={form.pax_in_room}
                  min="1"
                  onChange={(e) => setForm((f) => ({ ...f, pax_in_room: Number(e.target.value) }))}
                  className={`w-full px-3 py-1.5 border rounded text-sm ${paxValid ? 'border-slate-300' : 'border-red-300 bg-red-50'}`}
                />
              </div>
            </>
          ) : (
            <>
              <div className="col-span-2">
                <label className="text-[10px] font-semibold text-slate-600 block uppercase">
                  Jumlah Peserta <span className="text-red-500">*</span>
                  <span className="text-amber-600 ml-1">(auto: {activePassengers.length} aktif)</span>
                </label>
                <input
                  type="number"
                  value={form.pax_count}
                  min="1"
                  onChange={(e) => setForm((f) => ({ ...f, pax_count: Number(e.target.value) }))}
                  className={`w-full px-3 py-1.5 border rounded text-sm ${paxValid ? 'border-slate-300' : 'border-red-300 bg-red-50'}`}
                />
              </div>
            </>
          )}
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block uppercase">Currency</label>
            <select
              value={form.currency}
              onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm bg-white"
            >
              {CURRENCIES.map((c) => (
                <option key={c.key} value={c.key}>{c.flag} {c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block uppercase">Kurs ({form.currency})</label>
            <input
              type="number"
              value={currentKurs}
              disabled
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm bg-slate-100"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {form.calc_mode === 'per_room' ? (
            <div>
              <label className="text-[10px] font-semibold text-slate-600 block uppercase">
                Harga per Room ({form.currency}) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.price_per_room}
                onChange={(e) => setForm((f) => ({ ...f, price_per_room: Number(e.target.value) }))}
                placeholder="e.g. 520"
                step="0.01"
                className={`w-full px-3 py-1.5 border rounded text-sm font-mono ${priceValid ? 'border-slate-300' : 'border-red-300 bg-red-50'}`}
              />
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-semibold text-slate-600 block uppercase">
                Harga per Pax ({form.currency}) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={form.price_per_pax}
                onChange={(e) => setForm((f) => ({ ...f, price_per_pax: Number(e.target.value) }))}
                placeholder="e.g. 150"
                step="0.01"
                className={`w-full px-3 py-1.5 border rounded text-sm font-mono ${priceValid ? 'border-slate-300' : 'border-red-300 bg-red-50'}`}
              />
            </div>
          )}
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block uppercase">Mode Harga</label>
            <select
              value={form.price_mode}
              onChange={(e) => setForm((f) => ({ ...f, price_mode: e.target.value }))}
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm bg-white"
            >
              <option value="per_night">Per Malam × Jumlah Malam</option>
              <option value="total_stay">Total Stay (sekali bayar)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block uppercase">
              Jumlah Malam
              {form.price_mode === 'total_stay' && <span className="text-slate-400 ml-1">(N/A)</span>}
            </label>
            <input
              type="number"
              value={form.nights}
              onChange={(e) => setForm((f) => ({ ...f, nights: Number(e.target.value) }))}
              disabled={form.price_mode === 'total_stay'}
              min="1"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm disabled:bg-slate-100"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-600 block uppercase">Category HPP</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Hotel"
              className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] font-semibold text-slate-600 block uppercase">Notes (opsional)</label>
          <input
            type="text"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="catatan tambahan..."
            className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm"
          />
        </div>

        {/* LIVE PREVIEW */}
        <div className="p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg border-2 border-amber-300">
          <p className="text-xs font-bold text-amber-800 uppercase mb-2">
            💡 Live Calculation Preview · Mode {form.calc_mode === 'per_room' ? 'A (Per Room)' : 'B (Per Pax)'}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              {form.calc_mode === 'per_room' ? (
                <>
                  <p className="text-xs text-slate-600">
                    <span className="font-mono">{form.pax_in_room}</span> pax ÷ <span className="font-mono">{calc.capacity}</span> capacity = <span className="font-bold text-amber-700">{calc.roomsNeeded} rooms</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    Per room ({form.price_mode === 'per_night' ? `${form.nights} malam` : 'total stay'}):
                    <span className="font-mono ml-1">{fmtCurrency(calc.unitPriceForeign, form.currency)}</span>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-600">
                    <span className="font-mono">{form.pax_count}</span> pax × <span className="font-mono">{fmtCurrency(form.price_per_pax, form.currency)}</span>/pax
                  </p>
                  {form.price_mode === 'per_night' && form.nights > 1 && (
                    <p className="text-xs text-slate-600">
                      × <span className="font-mono">{form.nights} malam</span>
                    </p>
                  )}
                </>
              )}
              <p className="text-xs text-slate-600">
                Total foreign:
                <span className="font-mono ml-1 font-bold">{fmtCurrency(calc.totalForeign, form.currency)}</span>
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-600">
                Kurs: <span className="font-mono">{fmtRp(currentKurs)}</span> per {form.currency}
              </p>
              <div className="pt-2 border-t border-amber-300">
                <p className="text-xs font-bold text-amber-900">💰 Total HPP (Rp)</p>
                <p className="text-2xl font-bold text-amber-700">{fmtRp(calc.totalIDR)}</p>
                <p className="text-[10px] text-slate-600">
                  Per pax: {fmtRp(calc.perPaxIDR)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* R215j — Validation hint */}
        {!isFormValid && (
          <div className="p-2 bg-red-50 border border-red-300 rounded text-xs text-red-800">
            ⚠ Form belum valid: {!hotelNameValid && '[Nama Hotel kosong] '}
            {!priceValid && `[Harga ${form.calc_mode === 'per_room' ? 'per Room' : 'per Pax'} = 0] `}
            {!paxValid && `[${form.calc_mode === 'per_room' ? 'Pax di Room' : 'Jumlah Pax'} = 0]`}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !isFormValid}
          className={`w-full px-4 py-2.5 rounded-lg font-bold text-white ${
            pending || !isFormValid
              ? 'bg-slate-400 cursor-not-allowed'
              : 'bg-amber-600 hover:bg-amber-700'
          }`}
        >
          {pending ? '⏳ Menyimpan...' : (isFormValid ? '💾 Simpan ke HPP' : '⚠ Lengkapi form dulu')}
        </button>
      </div>

      {/* HOTEL ITEMS LIST */}
      {hotelItems.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-200">
          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            🏨 Hotel HPP Items ({hotelItems.length})
          </p>
          <div className="space-y-1">
            {hotelItems.map((it) => (
              <div key={it.id} className="text-sm flex items-center justify-between p-2 bg-amber-50 rounded border border-amber-200">
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{it.component}</p>
                  {it.notes && <p className="text-[11px] text-slate-500">{it.notes}</p>}
                </div>
                <p className="font-bold text-amber-700">{fmtRp(it.total_amount)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
