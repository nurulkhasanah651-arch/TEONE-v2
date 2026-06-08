'use client';

// Round 72 + R198 — Trip Form
// - Auto-format harga dengan titik ribuan otomatis saat ngetik
// - Tambah PNR + Route picker (dari pnr_inventory atau manual)
// - R198: Send WA Konfirmasi ke TL (di samping Tour Leader)

import { useState, useEffect } from 'react';
import { ROOM_KEYS, AGE_KEYS, ADDON_KEYS, autoDeadlineClose } from '@/lib/utils/price-breakdown';
import TLSendWAButton from '@/components/master-trip/TLSendWAButton';

let TLPicker;
try { TLPicker = require('./TLPicker').default; } catch { TLPicker = null; }

let PnrPicker;
try { PnrPicker = require('./PnrPicker').default; } catch { PnrPicker = null; }

// ===== Helper format harga =====
function formatRupiah(v) {
  if (v === '' || v == null) return '';
  const n = String(v).replace(/[^0-9]/g, '');
  if (!n) return '';
  return Number(n).toLocaleString('id-ID');
}

function parseRupiah(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9]/g, '');
}

export default function TripForm({ initial = {}, onSubmit, submitLabel = 'Simpan Trip', tourLeaders = [], pnrInventory = [], employees = [] }) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [departure, setDeparture] = useState(initial.departure || '');
  const [deadlineClose, setDeadlineClose] = useState(initial.deadline_close || '');
  const [status, setStatus] = useState(initial.status || 'prepare to sell');
  const [closedAt, setClosedAt] = useState(initial.closed_at || '');

  // Price breakdown — controlled state (semua angka, no titik)
  const initialBreakdown = initial.price_breakdown || {};
  const [breakdown, setBreakdown] = useState(() => {
    const init = {};
    [...ROOM_KEYS, ...AGE_KEYS, ...ADDON_KEYS].forEach((it) => {
      init[it.key] = initialBreakdown[it.key] || 0;
    });
    init._custom = Array.isArray(initialBreakdown._custom) ? initialBreakdown._custom : [];
    return init;
  });
  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomPrice, setNewCustomPrice] = useState('');

  function setBd(key, val) {
    setBreakdown((b) => ({ ...b, [key]: parseInt(val) || 0 }));
  }
  function addCustom() {
    if (!newCustomName.trim()) return;
    setBreakdown((b) => ({ ...b, _custom: [...b._custom, { name: newCustomName.trim(), price: parseInt(newCustomPrice) || 0 }] }));
    setNewCustomName('');
    setNewCustomPrice('');
  }
  function removeCustom(idx) {
    setBreakdown((b) => ({ ...b, _custom: b._custom.filter((_, i) => i !== idx) }));
  }

  useEffect(() => {
    if (departure && !initial.deadline_close && !deadlineClose) {
      const auto = autoDeadlineClose(departure);
      if (auto) setDeadlineClose(auto);
    }
  }, [departure, initial.deadline_close]);

  useEffect(() => {
    if (['closed selling', 'completed'].includes(status) && !closedAt) {
      setClosedAt(new Date().toISOString().slice(0, 10));
    }
  }, [status]);

  async function handleSubmit(formData) {
    setPending(true);
    setError('');
    formData.set('price_breakdown_json', JSON.stringify(breakdown));
    const result = await onSubmit(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      {/* Basic info */}
      <Section title="Info Dasar">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Kode Trip" hint="Contoh: KARANG-2026">
            <input autoComplete="off" name="kode_trip" defaultValue={initial.kode_trip || ''} className={inputCls} />
          </Field>
          <Field label="Nama Trip" required>
            <input autoComplete="off" name="name" defaultValue={initial.name || ''} required className={inputCls} placeholder="KARANG 14 Hari" />
          </Field>
          <Field label="Tujuan">
            <input autoComplete="off" name="destination" defaultValue={initial.destination || ''} className={inputCls} placeholder="Eropa, Jepang, dll" />
          </Field>
          <Field label="Tipe Tiket">
            <select name="ticket" defaultValue={initial.ticket || 'FIT'} className={inputCls}>
              <option value="FIT">FIT</option>
              <option value="GROUP">GROUP</option>
              <option value="PRIVATE">PRIVATE</option>
              <option value="CHARTER">CHARTER</option>
            </select>
          </Field>
        </div>
      </Section>

      {/* PNR + Route — Round 72 */}
      <Section title="✈ PNR & Route">
        {PnrPicker ? (
          <PnrPicker
            pnrInventory={pnrInventory}
            initialPnr={initial.pnr || ''}
            initialRoute={initial.route || ''}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="PNR">
              <input autoComplete="off" name="pnr" defaultValue={initial.pnr || ''} className={inputCls} placeholder="ABC123" />
            </Field>
            <Field label="Route">
              <input autoComplete="off" name="route" defaultValue={initial.route || ''} className={inputCls} placeholder="CGK-DOH-CDG" />
            </Field>
          </div>
        )}
      </Section>

      {/* Dates */}
      <Section title="Tanggal">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Tanggal Publish" hint="Kapan trip mulai diiklankan">
            <input autoComplete="off" type="date" name="publish_date" defaultValue={initial.publish_date || ''} className={inputCls} />
          </Field>
          <Field label="Keberangkatan">
            <input autoComplete="off" type="date" name="departure" value={departure} onChange={(e) => setDeparture(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Kepulangan">
            <input autoComplete="off" type="date" name="arrival" defaultValue={initial.arrival || ''} className={inputCls} />
          </Field>
          <Field label="Deadline Tutup Booking" hint="Auto = departure − 45 hari (bisa override)">
            <input autoComplete="off" type="date" name="deadline_close" value={deadlineClose} onChange={(e) => setDeadlineClose(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tgl Closed Selling" hint="Auto-set saat status → Closed Selling">
            <input autoComplete="off" type="date" name="closed_at" value={closedAt} onChange={(e) => setClosedAt(e.target.value)} className={inputCls} />
          </Field>
        </div>
      </Section>

      {/* Capacity */}
      <Section title="Kapasitas">
        <Field label="Quota (jumlah seat)" hint="Total kursi yang dijual. Harga di-set per tipe di section di bawah.">
          <input autoComplete="off" type="number" name="quota" defaultValue={initial.quota || ''} min="0" className={inputCls} placeholder="20" />
        </Field>
      </Section>

      {/* PRICE BREAKDOWN */}
      <Section title="💰 Harga per Tipe (Breakdown)">
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Tipe Kamar</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {ROOM_KEYS.map((r) => (
                <PriceField key={r.key} icon={r.icon} label={r.label} value={breakdown[r.key]} onChange={(v) => setBd(r.key, v)} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Anak / Bayi</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {AGE_KEYS.map((a) => (
                <PriceField key={a.key} icon={a.icon} label={a.label} value={breakdown[a.key]} onChange={(v) => setBd(a.key, v)} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Add-on</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {ADDON_KEYS.map((a) => (
                <PriceField key={a.key} icon={a.icon} label={a.label} value={breakdown[a.key]} onChange={(v) => setBd(a.key, v)} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-2">Custom Items</p>
            {breakdown._custom.length > 0 && (
              <div className="space-y-1 mb-2">
                {breakdown._custom.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded">
                    <span className="flex-1 text-sm">{c.name}: Rp {Number(c.price || 0).toLocaleString('id-ID')}</span>
                    <button type="button" onClick={() => removeCustom(i)} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700">🗑</button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input autoComplete="off" type="text" value={newCustomName} onChange={(e) => setNewCustomName(e.target.value)} placeholder="Nama item custom" className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm" />
              <input autoComplete="off"
                type="text"
                inputMode="numeric"
                value={formatRupiah(newCustomPrice)}
                onChange={(e) => setNewCustomPrice(parseRupiah(e.target.value))}
                placeholder="Harga"
                className="w-32 px-2 py-1.5 border border-slate-300 rounded text-sm"
              />
              <button type="button" onClick={addCustom} className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded">+ Add</button>
            </div>
          </div>
        </div>
      </Section>

      {/* Status & Tim */}
      <Section title="Status & Tim">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Status Penjualan">
            <select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
              <option value="prepare to sell">Prepare to Sell</option>
              <option value="open selling">Open Selling</option>
              <option value="closed selling">Closed Selling</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="PIC (CS Officer)">
            {Array.isArray(employees) && employees.length > 0 ? (
              <select
                name="pic"
                defaultValue={initial.pic || ''}
                className={inputCls}
                onChange={(e) => {
                  const emp = employees.find((x) => x.full_name === e.target.value);
                  const hidden = document.getElementById('pic_email_hidden');
                  if (hidden) hidden.value = emp?.email || '';
                }}
              >
                <option value="">— Pilih PIC dari karyawan —</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.full_name}>{emp.full_name}{emp.role ? ` · ${emp.role}` : ''}{emp.email ? ` (${emp.email})` : ''}</option>
                ))}
              </select>
            ) : (
              <input autoComplete="off" name="pic" defaultValue={initial.pic || ''} className={inputCls} placeholder="Nama PIC" />
            )}
            <input autoComplete="off" type="hidden" id="pic_email_hidden" name="pic_email" defaultValue={initial.pic_email || ''} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Tour Leader" hint="Pilih dari master TL atau input manual">
              {TLPicker ? (
                <TLPicker tourLeaders={tourLeaders} initialTlId={initial.tl_id || null} initialTlName={initial.tl_name || ''} />
              ) : (
                <input autoComplete="off" name="tl_name" defaultValue={initial.tl_name || ''} className={inputCls} placeholder="Nama TL" />
              )}
            </Field>

            {/* R198: Send WA Konfirmasi — pakai data initial dari DB */}
            {initial?.id && (
              <div className="mt-3 p-3 border border-slate-200 rounded-lg bg-white">
                <p className="text-xs font-semibold text-slate-600 mb-2">
                  📱 Konfirmasi TL via WhatsApp
                </p>
                <TLSendWAButton
                  tripId={initial.id}
                  tlPhone={initial.tl_phone || ''}
                  tlName={initial.tl_name || ''}
                  tlId={initial.tl_id || null}
                  initialStatus={initial.tl_assignment_status || 'pending'}
                  initialSentAt={initial.tl_assignment_sent_at || null}
                  initialRespondedAt={initial.tl_assignment_responded_at || null}
                />
                {!initial.tl_phone && !initial.tl_id && (
                  <p className="text-[11px] text-slate-500 mt-2">
                    💡 Pilih TL di dropdown atas dan <b>Save trip</b> dulu, baru bisa kirim WA.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Operations Status */}
      <Section title="Status Operasional">
        <p className="text-[11px] text-slate-500 mb-3">
          Status ini sync ke modul lain (Visa, Manifest, Roomlist, dst). Update di sini = update di semua tab.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Status Tiket">
            <select name="ticket_status" defaultValue={initial.ticket_status || 'pending'} className={inputCls}>
              <option value="pending">Pending</option>
              <option value="booked">Booked</option>
              <option value="confirmed">Confirmed</option>
              <option value="issued">Issued</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
          <Field label="Status Visa">
            <select name="visa" defaultValue={initial.visa || 'pending'} className={inputCls}>
              <option value="pending">Pending</option>
              <option value="process">In Process</option>
              <option value="approved">Approved</option>
              <option value="done">Done</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
          <Field label="Manifest">
            <select name="manifest" defaultValue={initial.manifest || 'pending'} className={inputCls}>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </select>
          </Field>
          <Field label="Room List">
            <select name="roomlist" defaultValue={initial.roomlist || 'pending'} className={inputCls}>
              <option value="pending">Pending</option>
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </select>
          </Field>
          <Field label="Status Payment">
            <select name="payment" defaultValue={initial.payment || 'belum'} className={inputCls}>
              <option value="belum">Belum Bayar</option>
              <option value="cicilan">Cicilan</option>
              <option value="lunas">Lunas</option>
            </select>
          </Field>
          <Field label="Briefing TL">
            <select name="briefing_tl" defaultValue={initial.briefing_tl || 'belum'} className={inputCls}>
              <option value="belum">Belum</option>
              <option value="dijadwalkan">Dijadwalkan</option>
              <option value="sudah">Sudah</option>
            </select>
          </Field>
        </div>
      </Section>

      <Section title="Catatan">
        <Field label="Catatan (opsional)">
          <textarea autoComplete="off" name="notes" defaultValue={initial.notes || ''} rows="3" className={inputCls + ' resize-none'} />
        </Field>
      </Section>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">{error}</div>}

      <button type="submit" disabled={pending} className="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg shadow-card">
        {pending ? 'Menyimpan...' : submitLabel}
      </button>
    </form>
  );
}

function PriceField({ icon, label, value, onChange }) {
  const [display, setDisplay] = useState(formatRupiah(value || ''));

  useEffect(() => {
    setDisplay(formatRupiah(value || ''));
  }, [value]);

  function handleChange(e) {
    const r = parseRupiah(e.target.value);
    setDisplay(formatRupiah(r));
    onChange(r);
  }

  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">{icon} {label}</span>
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">Rp</span>
        <input autoComplete="off"
          type="text"
          inputMode="numeric"
          value={display}
          onChange={handleChange}
          onFocus={(e) => e.target.select()}
          className="w-full pl-7 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none bg-white"
          placeholder="0"
        />
      </div>
    </label>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';

function Section({ title, children }) {
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
      <p className="text-sm font-bold text-brand-700 uppercase tracking-wider mb-3">{title}</p>
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
