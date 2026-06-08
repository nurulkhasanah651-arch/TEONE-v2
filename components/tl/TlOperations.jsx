'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateTlChecklist,
  updateTlPettyCash,
  addTlExpense,
  deleteTlExpense,
  addGmapsReview,
  deleteGmapsReview,
  addVendorReview,
  deleteVendorReview,
  updateTlDocLink,
} from '@/lib/actions/tl';
import { DEFAULT_TL_CHECKLIST, TL_EXPENSE_CATEGORIES, VENDOR_TYPES } from '@/lib/utils/tl-constants';
import { fmtDate, fmtRupiah } from '@/lib/utils/format';

export default function TlOperations({ trip, expenses = [], gmapsReviews = [], vendorReviews = [] }) {
  const tripId = trip.id;
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [openSection, setOpenSection] = useState('checklist');

  // Total expense + sisa saldo
  const totalExpense = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const pettyCash = Number(trip.tl_petty_cash) || 0;
  const sisaSaldo = pettyCash - totalExpense;

  function refresh() { router.refresh(); }

  const sections = [
    { id: 'checklist', label: 'Checklist Predeparture', icon: '📋' },
    { id: 'pettycash', label: 'Petty Cash & Expense', icon: '💵' },
    { id: 'gmaps', label: 'Review GMaps 5★', icon: '⭐' },
    { id: 'vendor', label: 'Review Vendor', icon: '🏨' },
    { id: 'doclink', label: 'Link Dokumentasi', icon: '📸' },
  ];

  return (
    <div className="space-y-4">
      {/* Section toggles */}
      <div className="flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => setOpenSection(openSection === s.id ? null : s.id)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-2 transition-colors ${openSection === s.id ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-brand-300'}`}
          >
            <span className="mr-1">{s.icon}</span>{s.label}
          </button>
        ))}
      </div>

      {/* ========== CHECKLIST ========== */}
      {openSection === 'checklist' && (
        <ChecklistSection
          trip={trip}
          pending={pending}
          startTransition={startTransition}
          refresh={refresh}
        />
      )}

      {/* ========== PETTY CASH + EXPENSE ========== */}
      {openSection === 'pettycash' && (
        <PettyCashSection
          trip={trip}
          tripId={tripId}
          expenses={expenses}
          pettyCash={pettyCash}
          totalExpense={totalExpense}
          sisaSaldo={sisaSaldo}
          pending={pending}
          startTransition={startTransition}
          refresh={refresh}
        />
      )}

      {/* ========== GMAPS REVIEWS ========== */}
      {openSection === 'gmaps' && (
        <GmapsSection
          tripId={tripId}
          reviews={gmapsReviews}
          pending={pending}
          startTransition={startTransition}
          refresh={refresh}
        />
      )}

      {/* ========== VENDOR REVIEWS ========== */}
      {openSection === 'vendor' && (
        <VendorSection
          tripId={tripId}
          reviews={vendorReviews}
          pending={pending}
          startTransition={startTransition}
          refresh={refresh}
        />
      )}

      {/* ========== DOC LINK ========== */}
      {openSection === 'doclink' && (
        <DocLinkSection
          trip={trip}
          tripId={tripId}
          pending={pending}
          startTransition={startTransition}
          refresh={refresh}
        />
      )}
    </div>
  );
}

// ============================================================
// CHECKLIST SECTION
// ============================================================
function ChecklistSection({ trip, pending, startTransition, refresh }) {
  const stored = Array.isArray(trip.tl_checklist) ? trip.tl_checklist : [];
  const storedNames = new Set(stored.map((i) => i.name));

  // Merge default + custom (yang sudah tersimpan)
  const defaults = DEFAULT_TL_CHECKLIST.map((name) => {
    const found = stored.find((s) => s.name === name);
    return found || { name, done: false, custom: false };
  });
  const customs = stored.filter((s) => s.custom);
  const merged = [...defaults, ...customs];

  const [items, setItems] = useState(merged);
  const [newItem, setNewItem] = useState('');

  const doneCount = items.filter((i) => i.done).length;

  function persist(next) {
    setItems(next);
    startTransition(async () => {
      const r = await updateTlChecklist(trip.id, next);
      if (r?.error) alert(r.error);
      else refresh();
    });
  }

  function toggle(idx) {
    const next = items.map((it, i) => i === idx ? { ...it, done: !it.done, done_at: !it.done ? new Date().toISOString() : null } : it);
    persist(next);
  }

  function addCustom() {
    const name = newItem.trim();
    if (!name) return;
    if (items.find((i) => i.name === name)) { setNewItem(''); return; }
    const next = [...items, { name, done: false, custom: true }];
    persist(next);
    setNewItem('');
  }

  function removeCustom(idx) {
    const next = items.filter((_, i) => i !== idx);
    persist(next);
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-brand-700">📋 Checklist Predeparture</h3>
        <span className={`text-sm font-bold ${doneCount === items.length ? 'text-green-700' : 'text-amber-700'}`}>
          {doneCount}/{items.length} done
        </span>
      </div>

      <div className="space-y-1.5">
        {items.map((it, idx) => (
          <div key={idx} className={`flex items-center gap-2 p-2 rounded ${it.done ? 'bg-green-50' : 'bg-slate-50'}`}>
            <button
              onClick={() => toggle(idx)}
              disabled={pending}
              className={`w-6 h-6 rounded font-bold text-xs flex-shrink-0 transition-colors ${
                it.done ? 'bg-green-500 text-white' : 'bg-white border border-slate-300 text-slate-400 hover:bg-slate-100'
              }`}
            >
              {it.done ? '✓' : ''}
            </button>
            <span className={`flex-1 text-sm ${it.done ? 'line-through text-slate-500' : 'text-slate-800'}`}>
              {it.name}
              {it.custom && <span className="ml-1 text-[10px] text-purple-600 font-semibold uppercase">custom</span>}
            </span>
            {it.custom && (
              <button onClick={() => removeCustom(idx)} disabled={pending} className="text-xs text-red-500 hover:underline">Hapus</button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2 border-t border-slate-200">
        <input autoComplete="off"
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="Tambah item custom..."
          className="flex-1 px-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
        />
        <button onClick={addCustom} disabled={pending || !newItem.trim()} className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded disabled:opacity-50">
          + Tambah
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PETTY CASH + EXPENSE SECTION
// ============================================================
function PettyCashSection({ trip, tripId, expenses, pettyCash, totalExpense, sisaSaldo, pending, startTransition, refresh }) {
  const [editingPetty, setEditingPetty] = useState(false);

  function handleSetPettyCash(amount) {
    startTransition(async () => {
      const r = await updateTlPettyCash(tripId, amount);
      if (r?.error) alert(r.error);
      setEditingPetty(false);
      refresh();
    });
  }

  async function handleAddExpense(formData) {
    startTransition(async () => {
      const r = await addTlExpense(tripId, formData);
      if (r?.error) alert(r.error);
      refresh();
    });
  }

  function handleDelete(id) {
    if (!confirm('Hapus expense ini?')) return;
    startTransition(async () => {
      const r = await deleteTlExpense(id, tripId);
      if (r?.error) alert(r.error);
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Saldo summary card */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
          <p className="text-[11px] text-slate-500 font-semibold uppercase">Saldo Awal</p>
          {editingPetty ? (
            <form action={(fd) => { handleSetPettyCash(fd.get('amount')); }} className="mt-1 flex gap-1">
              <input autoComplete="off" type="number" name="amount" defaultValue={pettyCash} min="0" autoFocus className="flex-1 px-2 py-1 border border-brand-500 rounded text-sm" />
              <button type="submit" className="text-xs bg-brand-500 text-white px-2 rounded">✓</button>
            </form>
          ) : (
            <p className="mt-1 text-lg font-bold text-blue-700 cursor-pointer hover:underline" onClick={() => setEditingPetty(true)}>
              {fmtRupiah(pettyCash)}
            </p>
          )}
          <p className="text-[10px] text-slate-400 mt-0.5">Klik untuk edit (Ops)</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
          <p className="text-[11px] text-slate-500 font-semibold uppercase">Total Expense</p>
          <p className="mt-1 text-lg font-bold text-amber-700">{fmtRupiah(totalExpense)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{expenses.length} entries</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-card p-4">
          <p className="text-[11px] text-slate-500 font-semibold uppercase">Sisa Saldo</p>
          <p className={`mt-1 text-lg font-bold ${sisaSaldo < 0 ? 'text-red-700' : 'text-green-700'}`}>{fmtRupiah(sisaSaldo)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{sisaSaldo < 0 ? '⚠ Over budget' : 'Aman'}</p>
        </div>
      </div>

      {/* Form add expense */}
      <form action={handleAddExpense} className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
        <h3 className="font-bold text-brand-700">💵 Tambah Expense TL</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input autoComplete="off" type="date" name="date" defaultValue={new Date().toISOString().slice(0,10)} required className="px-2 py-1.5 border border-slate-300 rounded text-sm" />
          <select name="category" required className="px-2 py-1.5 border border-slate-300 rounded text-sm">
            <option value="">Kategori...</option>
            {TL_EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input autoComplete="off" type="number" name="amount" min="1" required placeholder="Nominal" className="px-2 py-1.5 border border-slate-300 rounded text-sm" />
          <input autoComplete="off" type="text" name="description" required placeholder="Keterangan..." className="px-2 py-1.5 border border-slate-300 rounded text-sm" />
        </div>
        <input autoComplete="off" type="text" name="photo_url" placeholder="Link foto bukti (opsional, paste URL Google Drive/Photos)" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
        <button type="submit" disabled={pending} className="w-full md:w-auto px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded disabled:opacity-50">
          + Tambah Expense
        </button>
      </form>

      {/* List expenses */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h3 className="font-bold text-brand-700">📒 Expense History ({expenses.length})</h3>
        </div>
        {expenses.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Belum ada expense.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {expenses.map((e) => (
              <div key={e.id} className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">{fmtDate(e.date)}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">{e.category || '—'}</span>
                    <span className="text-sm font-semibold text-slate-800">{e.description}</span>
                  </div>
                  {e.photo_url && <a href={e.photo_url} target="_blank" rel="noreferrer" className="text-[11px] text-brand-600 hover:underline mt-0.5 inline-block">📷 Lihat bukti</a>}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-amber-700">{fmtRupiah(e.amount)}</p>
                  <button onClick={() => handleDelete(e.id)} className="text-[11px] text-red-500 hover:underline">Hapus</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// GMAPS REVIEW SECTION
// ============================================================
function GmapsSection({ tripId, reviews, pending, startTransition, refresh }) {
  async function handleAdd(formData) {
    startTransition(async () => {
      const r = await addGmapsReview(tripId, formData);
      if (r?.error) alert(r.error);
      refresh();
    });
  }

  function handleDelete(id) {
    if (!confirm('Hapus review ini?')) return;
    startTransition(async () => {
      const r = await deleteGmapsReview(id, tripId);
      if (r?.error) alert(r.error);
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form action={handleAdd} className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
        <h3 className="font-bold text-brand-700">⭐ Tambah Bukti Review GMaps 5★</h3>
        <p className="text-xs text-slate-500">Input nama peserta yang sudah review + link screenshot bukti (paste link Google Drive/Photo).</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input autoComplete="off" type="text" name="passenger_name" placeholder="Nama peserta yang review..." className="px-2 py-1.5 border border-slate-300 rounded text-sm" />
          <input autoComplete="off" type="text" name="photo_url" placeholder="Link screenshot bukti..." className="px-2 py-1.5 border border-slate-300 rounded text-sm" />
        </div>
        <input autoComplete="off" type="text" name="notes" placeholder="Catatan (opsional)" className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" />
        <button type="submit" disabled={pending} className="w-full md:w-auto px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded disabled:opacity-50">
          + Tambah Bukti Review
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-yellow-50">
          <h3 className="font-bold text-yellow-700">⭐ Daftar Bukti Review ({reviews.length})</h3>
        </div>
        {reviews.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Belum ada bukti review.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reviews.map((r) => (
              <div key={r.id} className="px-5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{r.passenger_name || '—'}</p>
                  {r.notes && <p className="text-xs text-slate-500 mt-0.5">{r.notes}</p>}
                  {r.photo_url && <a href={r.photo_url} target="_blank" rel="noreferrer" className="text-[11px] text-brand-600 hover:underline mt-0.5 inline-block">📷 Lihat screenshot</a>}
                  <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(r.created_at)} · {r.created_by}</p>
                </div>
                <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:underline flex-shrink-0">Hapus</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// VENDOR REVIEW SECTION
// ============================================================
function VendorSection({ tripId, reviews, pending, startTransition, refresh }) {
  async function handleAdd(formData) {
    startTransition(async () => {
      const r = await addVendorReview(tripId, formData);
      if (r?.error) alert(r.error);
      refresh();
    });
  }

  function handleDelete(id) {
    if (!confirm('Hapus review vendor?')) return;
    startTransition(async () => {
      const r = await deleteVendorReview(id, tripId);
      if (r?.error) alert(r.error);
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form action={handleAdd} className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
        <h3 className="font-bold text-brand-700">🏨 Review Vendor</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <select name="vendor_type" required className="px-2 py-1.5 border border-slate-300 rounded text-sm">
            <option value="">Jenis vendor...</option>
            {VENDOR_TYPES.map((v) => <option key={v.value} value={v.value}>{v.icon} {v.label}</option>)}
          </select>
          <input autoComplete="off" type="text" name="vendor_name" required placeholder="Nama vendor..." className="px-2 py-1.5 border border-slate-300 rounded text-sm" />
          <select name="rating" required className="px-2 py-1.5 border border-slate-300 rounded text-sm">
            <option value="">Rating...</option>
            <option value="5">★★★★★ Sangat Baik</option>
            <option value="4">★★★★☆ Baik</option>
            <option value="3">★★★☆☆ Cukup</option>
            <option value="2">★★☆☆☆ Kurang</option>
            <option value="1">★☆☆☆☆ Buruk</option>
          </select>
        </div>
        <textarea autoComplete="off" name="notes" rows="2" placeholder="Catatan (kelebihan/kekurangan vendor)..." className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm resize-none" />
        <button type="submit" disabled={pending} className="w-full md:w-auto px-5 py-2 bg-purple-500 hover:bg-purple-600 text-white text-sm font-semibold rounded disabled:opacity-50">
          + Tambah Review Vendor
        </button>
      </form>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-purple-50">
          <h3 className="font-bold text-purple-700">🏨 Vendor Reviews ({reviews.length})</h3>
        </div>
        {reviews.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">Belum ada review vendor.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {reviews.map((r) => {
              const vt = VENDOR_TYPES.find((v) => v.value === r.vendor_type);
              return (
                <div key={r.id} className="px-5 py-2.5 flex items-start justify-between gap-3 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">{vt?.icon} {vt?.label || r.vendor_type}</span>
                      <span className="text-sm font-bold text-slate-800">{r.vendor_name}</span>
                      <span className="text-sm text-yellow-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    </div>
                    {r.notes && <p className="text-xs text-slate-600 mt-1">{r.notes}</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(r.created_at)} · {r.created_by}</p>
                  </div>
                  <button onClick={() => handleDelete(r.id)} className="text-xs text-red-500 hover:underline flex-shrink-0">Hapus</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// DOC LINK SECTION
// ============================================================
function DocLinkSection({ trip, tripId, pending, startTransition, refresh }) {
  const [url, setUrl] = useState(trip.tl_doc_link || '');

  function handleSave() {
    startTransition(async () => {
      const r = await updateTlDocLink(tripId, url);
      if (r?.error) alert(r.error);
      refresh();
    });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-3">
      <h3 className="font-bold text-brand-700">📸 Link Dokumentasi Trip</h3>
      <p className="text-xs text-slate-500">Paste link Google Drive / Dropbox folder yang berisi foto & video dokumentasi trip. TL bisa upload ke link ini.</p>
      <div className="flex gap-2">
        <input autoComplete="off"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
          className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
        />
        <button onClick={handleSave} disabled={pending} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded disabled:opacity-50">
          Save
        </button>
      </div>
      {trip.tl_doc_link && (
        <a
          href={trip.tl_doc_link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 mt-2 px-4 py-2 bg-green-50 border border-green-200 rounded text-sm font-semibold text-green-700 hover:bg-green-100"
        >
          📂 Buka Folder Dokumentasi →
        </a>
      )}
    </div>
  );
}
