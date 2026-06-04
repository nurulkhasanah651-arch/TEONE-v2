'use client';

// Round 185 + R208 v2: DeliverySection
// R208 ADDITIVE: tambah gender badge + items checklist by gender + internal notes
// v2 FIX: pake c.gender (fallback c.sex) — bukan c.sex doang
// JANGAN nyentuh fitur existing (Kirim Link, Copy link, Skip, Mark Sent, Mark Received)

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  sendDeliveryLink,
  bulkSendDeliveryLinks,
  markDeliverySent,
  markDeliveryReceived,
  skipDelivery,
  resetDeliveryStatus,
} from '@/lib/actions/delivery';
import {
  saveDeliveryItemsConfig,
  updateItemStatus,
  setAllItemsStatus,
  updateInternalNotes,
} from '@/lib/actions/delivery-items';

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_BADGE = {
  pending:  { label: '⏳ Belum Isi Alamat', cls: 'bg-slate-100 text-slate-700' },
  filled:   { label: '✓ Alamat OK',         cls: 'bg-amber-100 text-amber-700' },
  sent:     { label: '🚚 Sudah Dikirim',    cls: 'bg-blue-100 text-blue-700' },
  received: { label: '✅ Diterima',          cls: 'bg-green-100 text-green-700' },
  skip:     { label: '— Skip',              cls: 'bg-slate-100 text-slate-400' },
};

const ITEM_STATUS_OPTIONS = [
  { value: 'belum',    label: '○ Belum',    cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  { value: 'siap',     label: '📦 Siap',    cls: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'dikirim',  label: '🚚 Dikirim', cls: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'diterima', label: '✅ Terima',  cls: 'bg-green-100 text-green-800 border-green-300' },
];

const DEFAULT_ITEMS_CONFIG = {
  cowok: ['Koper', 'Kain ihram', 'Kain umum', 'Buku doa', 'Syal'],
  cewek: ['Koper', 'Kain umum', 'Buku doa', 'Syal', 'Mukena'],
};

// R208 v2: Normalize gender — terima dari kolom gender ATAU sex
function normalizeGender(genderValue, sexValue) {
  const raw = genderValue || sexValue;
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  if (s === 'm' || s === 'male' || s === 'l' || s === 'laki' || s === 'laki-laki' || s === 'pria' || s === 'cowok') return 'cowok';
  if (s === 'f' || s === 'female' || s === 'p' || s === 'perempuan' || s === 'wanita' || s === 'cewek') return 'cewek';
  return 'unknown';
}

export default function DeliverySection({ tripId, passengers = [], appUrl = '', trip = {} }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openSent, setOpenSent] = useState(null);
  const [courier, setCourier] = useState('JNE');
  const [resi, setResi] = useState('');
  const [msg, setMsg] = useState(null);

  const initialConfig = (trip?.delivery_items_config && typeof trip.delivery_items_config === 'object')
    ? trip.delivery_items_config
    : DEFAULT_ITEMS_CONFIG;
  const [editingItems, setEditingItems] = useState(false);
  const [cowokItems, setCowokItems] = useState(
    Array.isArray(initialConfig.cowok) ? initialConfig.cowok : DEFAULT_ITEMS_CONFIG.cowok
  );
  const [cewekItems, setCewekItems] = useState(
    Array.isArray(initialConfig.cewek) ? initialConfig.cewek : DEFAULT_ITEMS_CONFIG.cewek
  );

  const [expandedItems, setExpandedItems] = useState(null);
  const [notesDraft, setNotesDraft] = useState({});

  function flash(text, isErr = false) {
    setMsg({ text, isErr });
    setTimeout(() => setMsg(null), 6000);
  }

  const counts = { pending: 0, filled: 0, sent: 0, received: 0, skip: 0 };
  for (const p of passengers) {
    const s = p.delivery_status || 'pending';
    if (counts[s] != null) counts[s]++;
  }

  async function handleSendLink(id) {
    startTransition(async () => {
      const r = await sendDeliveryLink(id);
      if (r?.error) flash(r.error, true);
      else { flash(`✓ Link terkirim ke ${r.target}`); router.refresh(); }
    });
  }

  async function handleBulkSend() {
    if (counts.pending === 0) { flash('Semua peserta sudah isi alamat', true); return; }
    if (!confirm(`Kirim link alamat ke ${counts.pending} peserta yang belum isi?`)) return;
    startTransition(async () => {
      const r = await bulkSendDeliveryLinks(tripId);
      if (r?.error) flash(r.error, true);
      else { flash(r.message); router.refresh(); }
    });
  }

  async function handleSent(id) {
    if (!courier || !resi) { flash('Isi kurir + resi dulu', true); return; }
    const fd = new FormData();
    fd.append('courier', courier);
    fd.append('resi', resi);
    startTransition(async () => {
      const r = await markDeliverySent(id, fd);
      if (r?.error) flash(r.error, true);
      else {
        flash('✓ Marked dikirim + WA resi terkirim ke peserta');
        setOpenSent(null);
        setCourier('JNE');
        setResi('');
        router.refresh();
      }
    });
  }

  async function handleReceived(id) {
    if (!confirm('Konfirmasi peserta sudah terima perlengkapan?')) return;
    startTransition(async () => {
      const r = await markDeliveryReceived(id);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Marked diterima'); router.refresh(); }
    });
  }

  async function handleSkip(id) {
    if (!confirm('Skip pengiriman untuk peserta ini?')) return;
    startTransition(async () => {
      const r = await skipDelivery(id);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Skipped'); router.refresh(); }
    });
  }

  async function handleReset(id) {
    if (!confirm('Reset status ke "filled" (batalin sent/received)?')) return;
    startTransition(async () => {
      const r = await resetDeliveryStatus(id);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Reset'); router.refresh(); }
    });
  }

  function copyLink(token) {
    const url = `${appUrl || window.location.origin}/delivery/${token}`;
    navigator.clipboard.writeText(url);
    flash('✓ Link disalin ke clipboard');
  }

  async function downloadExcel() {
    const filled = passengers.filter((p) => p.delivery_status === 'filled' || p.delivery_status === 'sent' || p.delivery_status === 'received');
    if (filled.length === 0) { flash('Belum ada alamat yg terisi', true); return; }

    const rows = [
      ['No', 'Nama Peserta', 'Nama Penerima', 'No HP', 'Alamat', 'Kelurahan', 'Kecamatan', 'Kota', 'Provinsi', 'Kode Pos', 'Catatan', 'Status', 'Kurir', 'Resi'],
      ...filled.map((p, i) => {
        const c = p.customers || {};
        return [
          i + 1,
          c.name || '',
          p.delivery_recipient || '',
          p.delivery_phone || '',
          p.delivery_street || '',
          p.delivery_kelurahan || '',
          p.delivery_kecamatan || '',
          p.delivery_kota || '',
          p.delivery_provinsi || '',
          p.delivery_kode_pos || '',
          p.delivery_notes || '',
          p.delivery_status || '',
          p.delivery_courier || '',
          p.delivery_resi || '',
        ];
      }),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daftar-alamat-pengiriman-trip-${tripId}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    flash(`✓ Downloaded daftar alamat ${filled.length} peserta`);
  }

  async function saveItemsConfig() {
    startTransition(async () => {
      const r = await saveDeliveryItemsConfig(tripId, { cowok: cowokItems, cewek: cewekItems });
      if (r?.error) flash(r.error, true);
      else { flash('✓ Template items disimpan'); setEditingItems(false); router.refresh(); }
    });
  }

  async function handleItemStatus(passengerId, itemKey, newStatus) {
    startTransition(async () => {
      const r = await updateItemStatus(passengerId, itemKey, newStatus);
      if (r?.error) flash(r.error, true);
      else router.refresh();
    });
  }

  async function handleSetAllItems(passengerId, status, items) {
    if (!confirm(`Set SEMUA item peserta ini ke "${status}"?`)) return;
    startTransition(async () => {
      const r = await setAllItemsStatus(passengerId, status, items);
      if (r?.error) flash(r.error, true);
      else { flash(`✓ Semua item → ${status}`); router.refresh(); }
    });
  }

  async function saveNotes(passengerId) {
    const notes = notesDraft[passengerId] ?? '';
    startTransition(async () => {
      const r = await updateInternalNotes(passengerId, notes);
      if (r?.error) flash(r.error, true);
      else { flash('✓ Catatan disimpan'); router.refresh(); }
    });
  }

  function getItemsForGender(gender) {
    if (gender === 'cowok') return cowokItems;
    if (gender === 'cewek') return cewekItems;
    return [];
  }

  function addItemToList(gender) {
    const name = prompt('Nama item baru:');
    if (!name || !name.trim()) return;
    if (gender === 'cowok') setCowokItems([...cowokItems, name.trim()]);
    else setCewekItems([...cewekItems, name.trim()]);
  }

  function removeItemFromList(gender, idx) {
    if (gender === 'cowok') setCowokItems(cowokItems.filter((_, i) => i !== idx));
    else setCewekItems(cewekItems.filter((_, i) => i !== idx));
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-pink-50 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-purple-700">📦 Pengiriman Perlengkapan</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {counts.pending} belum isi · {counts.filled} siap kirim · {counts.sent} dikirim · {counts.received} diterima
            {counts.skip > 0 && ` · ${counts.skip} skip`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEditingItems(!editingItems)}
            className="px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-800 text-xs font-semibold rounded"
          >
            ⚙ Edit Template Item
          </button>
          {counts.pending > 0 && (
            <button
              onClick={handleBulkSend}
              disabled={pending}
              className="px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold rounded disabled:opacity-50"
            >
              📨 Kirim Link ke {counts.pending} Peserta
            </button>
          )}
          <button
            onClick={downloadExcel}
            disabled={pending}
            className="px-3 py-1.5 bg-green-100 hover:bg-green-200 text-green-800 text-xs font-semibold rounded"
          >
            📥 Download Daftar (CSV)
          </button>
        </div>
      </div>

      {editingItems && (
        <div className="px-5 py-4 bg-indigo-50/50 border-b border-indigo-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-bold text-indigo-800 mb-2">🚹 Template Cowok</p>
              <div className="space-y-1">
                {cowokItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white rounded border border-slate-200 px-2 py-1">
                    <span className="text-xs flex-1">{item}</span>
                    <button onClick={() => removeItemFromList('cowok', i)}
                      className="text-[10px] text-red-500 hover:underline">Hapus</button>
                  </div>
                ))}
                <button onClick={() => addItemToList('cowok')}
                  className="w-full text-xs px-2 py-1 border-2 border-dashed border-indigo-300 hover:border-indigo-500 text-indigo-600 rounded">
                  + Tambah item
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-pink-800 mb-2">🚺 Template Cewek</p>
              <div className="space-y-1">
                {cewekItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-white rounded border border-slate-200 px-2 py-1">
                    <span className="text-xs flex-1">{item}</span>
                    <button onClick={() => removeItemFromList('cewek', i)}
                      className="text-[10px] text-red-500 hover:underline">Hapus</button>
                  </div>
                ))}
                <button onClick={() => addItemToList('cewek')}
                  className="w-full text-xs px-2 py-1 border-2 border-dashed border-pink-300 hover:border-pink-500 text-pink-600 rounded">
                  + Tambah item
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setEditingItems(false)}
              className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 rounded">
              Batal
            </button>
            <button onClick={saveItemsConfig} disabled={pending}
              className="px-3 py-1 text-xs bg-indigo-500 hover:bg-indigo-600 text-white font-bold rounded disabled:opacity-50">
              💾 Simpan Template
            </button>
          </div>
        </div>
      )}

      {msg && (
        <div className={`px-5 py-2 text-xs ${msg.isErr ? 'bg-red-50 text-red-700 border-b border-red-200' : 'bg-green-50 text-green-700 border-b border-green-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {passengers.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">Belum ada peserta</p>
        ) : (
          passengers.map((p) => {
            const c = p.customers || {};
            const status = STATUS_BADGE[p.delivery_status || 'pending'];
            const isFilled = ['filled', 'sent', 'received'].includes(p.delivery_status);
            const isSent = p.delivery_status === 'sent' || p.delivery_status === 'received';

            // R208 v2: ambil dari c.gender DAN c.sex (fallback)
            const gender = normalizeGender(c.gender, c.sex);
            const items = getItemsForGender(gender);
            const itemsStatus = (p.delivery_items_status && typeof p.delivery_items_status === 'object')
              ? p.delivery_items_status
              : {};
            const itemsDoneCount = items.filter((it) => ['diterima'].includes(itemsStatus[it])).length;
            const isItemsExpanded = expandedItems === p.id;
            const internalNotes = notesDraft[p.id] ?? (p.delivery_internal_notes || '');

            return (
              <div key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-800">{c.name || '—'}</p>
                      {gender !== 'unknown' && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          gender === 'cowok' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'
                        }`}>
                          {gender === 'cowok' ? '🚹 Laki-laki' : '🚺 Perempuan'}
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${status.cls}`}>{status.label}</span>
                      {items.length > 0 && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          itemsDoneCount === items.length ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                        }`}>
                          📦 {itemsDoneCount}/{items.length} item
                        </span>
                      )}
                      {p.delivery_link_sent_at && p.delivery_status === 'pending' && (
                        <span className="text-[10px] text-slate-500">
                          Link dikirim: {fmtDate(p.delivery_link_sent_at)}
                        </span>
                      )}
                    </div>

                    {isFilled && (
                      <div className="mt-2 text-xs text-slate-700 bg-slate-50 rounded p-2">
                        <p className="font-semibold">📍 {p.delivery_recipient}</p>
                        <p className="text-slate-600">📞 {p.delivery_phone}</p>
                        <p className="text-slate-600 mt-1">
                          {p.delivery_street}<br />
                          {p.delivery_kelurahan}, {p.delivery_kecamatan}<br />
                          {p.delivery_kota}, {p.delivery_provinsi} {p.delivery_kode_pos}
                        </p>
                        {p.delivery_notes && (
                          <p className="text-slate-500 italic mt-1">📝 {p.delivery_notes}</p>
                        )}
                      </div>
                    )}

                    {isSent && (
                      <div className="mt-2 text-xs text-blue-800 bg-blue-50 rounded p-2 border border-blue-200">
                        🚚 <b>{p.delivery_courier}</b> · Resi: <b className="font-mono">{p.delivery_resi}</b>
                        <br />
                        <span className="text-slate-500">Dikirim: {fmtDate(p.delivery_sent_at)}{p.delivery_sent_by && ` oleh ${p.delivery_sent_by}`}</span>
                        {p.delivery_received_at && (
                          <span className="block text-green-700">✓ Diterima: {fmtDate(p.delivery_received_at)}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1 items-end">
                    {p.delivery_status === 'pending' && (
                      <>
                        <button onClick={() => handleSendLink(p.id)} disabled={pending}
                          className="text-xs px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded">
                          📨 Kirim Link WA
                        </button>
                        <button onClick={() => copyLink(p.delivery_token)}
                          className="text-[10px] text-slate-500 hover:underline">
                          🔗 Copy link
                        </button>
                        <button onClick={() => handleSkip(p.id)} disabled={pending}
                          className="text-[10px] text-slate-400 hover:underline">
                          Skip pengiriman
                        </button>
                      </>
                    )}

                    {p.delivery_status === 'filled' && (
                      <>
                        <button onClick={() => setOpenSent(openSent === p.id ? null : p.id)} disabled={pending}
                          className="text-xs px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded">
                          🚚 Mark Dikirim
                        </button>
                        <button onClick={() => handleSendLink(p.id)} disabled={pending}
                          className="text-[10px] text-slate-500 hover:underline">
                          📨 Kirim link lagi (revisi)
                        </button>
                      </>
                    )}

                    {p.delivery_status === 'sent' && (
                      <>
                        <button onClick={() => handleReceived(p.id)} disabled={pending}
                          className="text-xs px-3 py-1 bg-green-500 hover:bg-green-600 text-white font-semibold rounded">
                          ✓ Mark Diterima
                        </button>
                        <button onClick={() => handleReset(p.id)} disabled={pending}
                          className="text-[10px] text-red-500 hover:underline">
                          ↶ Reset sent
                        </button>
                      </>
                    )}

                    {p.delivery_status === 'received' && (
                      <button onClick={() => handleReset(p.id)} disabled={pending}
                        className="text-[10px] text-slate-500 hover:underline">
                        ↶ Reset
                      </button>
                    )}
                  </div>
                </div>

                {openSent === p.id && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded space-y-2">
                    <p className="text-xs font-bold text-blue-800">🚚 Input Info Pengiriman</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] text-slate-700 block mb-0.5">Kurir</span>
                        <select value={courier} onChange={(e) => setCourier(e.target.value)}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white">
                          <option value="JNE">JNE</option>
                          <option value="J&T">J&T</option>
                          <option value="SiCepat">SiCepat</option>
                          <option value="Anteraja">Anteraja</option>
                          <option value="Pos Indonesia">Pos Indonesia</option>
                          <option value="Ninja Express">Ninja Express</option>
                          <option value="GoSend">GoSend</option>
                          <option value="GrabExpress">GrabExpress</option>
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] text-slate-700 block mb-0.5">No. Resi</span>
                        <input type="text" value={resi} onChange={(e) => setResi(e.target.value)}
                          placeholder="Contoh: JNE1234567890"
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm bg-white" />
                      </label>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setOpenSent(null)}
                        className="px-3 py-1 text-xs bg-slate-200 hover:bg-slate-300 rounded">
                        Batal
                      </button>
                      <button onClick={() => handleSent(p.id)} disabled={pending || !courier || !resi}
                        className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white font-bold rounded disabled:opacity-50">
                        ✓ Confirm Dikirim + Kirim WA
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => setExpandedItems(isItemsExpanded ? null : p.id)}
                    className="text-xs font-semibold text-slate-700 hover:text-purple-700"
                  >
                    {isItemsExpanded ? '▾' : '▸'} Items & Catatan Internal
                    {gender !== 'unknown' && (
                      <span className="ml-2 text-[10px] text-slate-500">
                        ({items.length} item · {itemsDoneCount} diterima)
                      </span>
                    )}
                  </button>

                  {isItemsExpanded && (
                    <div className="mt-2 p-3 bg-purple-50/30 border border-purple-200 rounded space-y-3">
                      {gender === 'unknown' ? (
                        <p className="text-xs text-amber-700 italic">
                          ⚠ Gender peserta belum di-set di Master Customer (kolom gender/sex). Set dulu supaya template item muncul.
                        </p>
                      ) : items.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">
                          Template item kosong untuk {gender}. Edit di tombol "⚙ Edit Template Item" di atas.
                        </p>
                      ) : (
                        <>
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <p className="text-xs font-bold text-purple-800">
                              📦 Checklist Item ({gender === 'cowok' ? 'Cowok' : 'Cewek'}) — {items.length} item
                            </p>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleSetAllItems(p.id, 'siap', items)}
                                disabled={pending}
                                className="text-[10px] px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded font-semibold"
                              >
                                Semua → Siap
                              </button>
                              <button
                                onClick={() => handleSetAllItems(p.id, 'diterima', items)}
                                disabled={pending}
                                className="text-[10px] px-2 py-0.5 bg-green-100 hover:bg-green-200 text-green-800 rounded font-semibold"
                              >
                                Semua → Diterima
                              </button>
                              <button
                                onClick={() => handleSetAllItems(p.id, 'belum', items)}
                                disabled={pending}
                                className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold"
                              >
                                Reset
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {items.map((item) => {
                              const itemStatus = itemsStatus[item] || 'belum';
                              return (
                                <div key={item} className="flex items-center gap-2 bg-white rounded border border-slate-200 p-2">
                                  <span className="text-xs flex-1 font-medium">{item}</span>
                                  <select
                                    value={itemStatus}
                                    onChange={(e) => handleItemStatus(p.id, item, e.target.value)}
                                    disabled={pending}
                                    className="text-[10px] px-1.5 py-0.5 border border-slate-300 rounded bg-white"
                                  >
                                    {ITEM_STATUS_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}

                      <div className="pt-2 border-t border-purple-200">
                        <p className="text-xs font-bold text-purple-800 mb-1">📝 Catatan Internal (tim only)</p>
                        <textarea
                          value={internalNotes}
                          onChange={(e) => setNotesDraft({ ...notesDraft, [p.id]: e.target.value })}
                          placeholder="Catatan internal (mis: 'Diambil sendiri', 'Belum punya alamat tetap', dll)"
                          rows={2}
                          className="w-full px-2 py-1 border border-slate-300 rounded text-xs bg-white"
                        />
                        <div className="flex justify-end mt-1">
                          <button
                            onClick={() => saveNotes(p.id)}
                            disabled={pending}
                            className="text-xs px-3 py-1 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded disabled:opacity-50"
                          >
                            💾 Simpan Catatan
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
