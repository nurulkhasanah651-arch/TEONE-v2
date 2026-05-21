'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTourLeader, updateTourLeader, toggleTourLeaderActive, deleteTourLeader } from '@/lib/actions/tour-leaders';

export default function TLMasterTable({ tourLeaders = [] }) {
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);
  const router = useRouter();

  async function handleAdd(formData) {
    startTransition(async () => {
      const r = await createTourLeader(formData);
      if (r?.error) { alert(r.error); return; }
      setShowForm(false);
      router.refresh();
    });
  }

  async function handleUpdate(formData) {
    if (!editingId) return;
    startTransition(async () => {
      const r = await updateTourLeader(editingId, formData);
      if (r?.error) { alert(r.error); return; }
      setEditingId(null);
      setEditData(null);
      router.refresh();
    });
  }

  function handleToggleActive(tl) {
    startTransition(async () => {
      const r = await toggleTourLeaderActive(tl.id, !tl.active);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  function handleDelete(tl) {
    if (!confirm(`Hapus TL "${tl.name}"? Trip yang sudah pakai TL ini tidak akan terhapus, tapi link-nya hilang.`)) return;
    startTransition(async () => {
      const r = await deleteTourLeader(tl.id);
      if (r?.error) { alert(r.error); return; }
      router.refresh();
    });
  }

  function startEdit(tl) {
    setEditingId(tl.id);
    setEditData(tl);
  }

  const inhouse = tourLeaders.filter((t) => t.type === 'inhouse');
  const freelance = tourLeaders.filter((t) => t.type === 'freelance');

  return (
    <div className="space-y-4">
      {/* Add button */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 text-xs">
          <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 font-semibold">{inhouse.length} Inhouse</span>
          <span className="px-2 py-1 rounded bg-purple-100 text-purple-700 font-semibold">{freelance.length} Freelance</span>
          <span className="px-2 py-1 rounded bg-slate-100 text-slate-700 font-semibold">{tourLeaders.length} Total</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg"
        >
          {showForm ? '× Tutup' : '+ Tambah TL'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form action={handleAdd} className="bg-white border-2 border-brand-300 rounded-xl p-5 space-y-3">
          <h3 className="font-bold text-brand-700">+ Tambah Tour Leader Baru</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nama Lengkap" required>
              <input name="name" required className={inputCls} placeholder="Misal: Budi Santoso" />
            </Field>
            <Field label="Tipe">
              <select name="type" className={inputCls}>
                <option value="inhouse">Inhouse (staff TE)</option>
                <option value="freelance">Freelance</option>
              </select>
            </Field>
            <Field label="Email">
              <input type="email" name="email" className={inputCls} placeholder="budi@example.com" />
            </Field>
            <Field label="No HP/WhatsApp">
              <input name="phone" className={inputCls} placeholder="081234567890" />
            </Field>
          </div>
          <Field label="Catatan">
            <textarea name="notes" rows="2" className={inputCls + ' resize-none'} placeholder="Pengalaman, area spesialisasi, dll" />
          </Field>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded font-semibold">Batal</button>
            <button type="submit" disabled={pending} className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded disabled:opacity-50">
              {pending ? 'Menyimpan...' : 'Simpan TL'}
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
        {tourLeaders.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">👤</p>
            <p className="text-lg font-bold text-slate-700">Belum ada Tour Leader</p>
            <p className="text-sm text-slate-500 mt-1">Klik "+ Tambah TL" untuk daftarkan TL pertama.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tourLeaders.map((tl) => (
              <div key={tl.id} className={`px-5 py-3 hover:bg-slate-50 ${!tl.active ? 'opacity-60' : ''}`}>
                {editingId === tl.id ? (
                  <form action={handleUpdate} className="space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input name="name" defaultValue={editData?.name || ''} required placeholder="Nama" className={inputCls} />
                      <select name="type" defaultValue={editData?.type || 'inhouse'} className={inputCls}>
                        <option value="inhouse">Inhouse</option>
                        <option value="freelance">Freelance</option>
                      </select>
                      <input type="email" name="email" defaultValue={editData?.email || ''} placeholder="Email" className={inputCls} />
                      <input name="phone" defaultValue={editData?.phone || ''} placeholder="HP" className={inputCls} />
                    </div>
                    <input name="notes" defaultValue={editData?.notes || ''} placeholder="Catatan" className={inputCls} />
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" name="active" defaultChecked={editData?.active !== false} />
                      Aktif (bisa di-assign ke trip)
                    </label>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => { setEditingId(null); setEditData(null); }} className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded font-semibold">Batal</button>
                      <button type="submit" disabled={pending} className="px-4 py-1 bg-brand-500 text-white text-xs font-semibold rounded disabled:opacity-50">Save</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-brand-700">{tl.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${tl.type === 'inhouse' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {tl.type === 'inhouse' ? 'INHOUSE' : 'FREELANCE'}
                        </span>
                        {!tl.active && <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-500">NON-AKTIF</span>}
                      </div>
                      <div className="mt-1 text-xs text-slate-600 flex flex-wrap gap-x-3">
                        {tl.email && <span>📧 {tl.email}</span>}
                        {tl.phone && <span>📞 {tl.phone}</span>}
                      </div>
                      {tl.notes && <p className="mt-1 text-xs text-slate-500 italic">{tl.notes}</p>}
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => startEdit(tl)} className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold">Edit</button>
                      <button onClick={() => handleToggleActive(tl)} className={`text-xs px-2 py-1 rounded font-semibold ${tl.active ? 'bg-amber-100 hover:bg-amber-200 text-amber-700' : 'bg-green-100 hover:bg-green-200 text-green-700'}`}>
                        {tl.active ? 'Non-aktif' : 'Aktifkan'}
                      </button>
                      <button onClick={() => handleDelete(tl)} className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 font-semibold">🗑</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 block mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls = 'w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none bg-white';
