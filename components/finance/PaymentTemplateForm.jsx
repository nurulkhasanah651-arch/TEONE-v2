'use client';

// Round 105: Group Payment Template — P1 sampai P7 + delete per item
// - Standard milestones: DP, P1-P7, Pelunasan, Visa, Asuransi
// - User bisa delete item via tombol ✕ (set ke 0 → otomatis hide dari matrix)
// - Item dengan amount = 0 dianggap "tidak aktif" — tidak muncul di matrix/invoice

import { useState } from 'react';
import { updatePaymentTemplate } from '@/lib/actions/payments';
import { fmtRupiah } from '@/lib/utils/format';

const STANDARD = [
  { key: 'DP',        label: 'DP',        always: true },
  { key: 'P1',        label: 'Payment 1', always: false },
  { key: 'P2',        label: 'Payment 2', always: false },
  { key: 'P3',        label: 'Payment 3', always: false },
  { key: 'P4',        label: 'Payment 4', always: false },
  { key: 'P5',        label: 'Payment 5', always: false },
  { key: 'P6',        label: 'Payment 6', always: false },
  { key: 'P7',        label: 'Payment 7', always: false },
  { key: 'Pelunasan', label: 'Pelunasan', always: true },
  { key: 'Visa',      label: 'Visa',      always: false },
  { key: 'Asuransi',  label: 'Asuransi',  always: false },
];
const STANDARD_KEYS = new Set(STANDARD.map((s) => s.key));

export default function PaymentTemplateForm({ tripId, template = {}, schedule = [] }) {
  const [open, setOpen] = useState(false);
  const _schedAmt = {}; const _schedDue = {};
  for (const r of (Array.isArray(schedule) ? schedule : [])) { if (r && r.type) { if (Number(r.amount) > 0) _schedAmt[r.type] = Number(r.amount); if (r.due) _schedDue[r.type] = r.due; } }
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // Standard amounts — init dari template
  const [stdValues, setStdValues] = useState(() => {
    const v = {};
    for (const m of STANDARD) v[m.key] = (Number(template[m.key]) > 0 ? template[m.key] : (_schedAmt[m.key] || 0));
    return v;
  });

  // Tanggal deadline per termin — init dari jadwal web
  const [dueValues, setDueValues] = useState(() => {
    const d = {};
    for (const m of STANDARD) d[m.key] = _schedDue[m.key] || '';
    return d;
  });

  // Hidden standard items (deleted by user)
  const [hiddenStandard, setHiddenStandard] = useState(() => new Set());

  // Custom items — array of { key, label, amount }
  const [customItems, setCustomItems] = useState(() => {
    const items = [];
    for (const key in template) {
      if (STANDARD_KEYS.has(key)) continue;
      if (Number(template[key]) <= 0) continue;
      items.push({ key, label: key, amount: template[key] || 0 });
    }
    return items;
  });

  // Compute total (exclude hidden standard items)
  const stdTotal = Object.entries(stdValues).reduce((s, [k, v]) => {
    if (hiddenStandard.has(k)) return s;
    return s + (+v || 0);
  }, 0);
  const customTotal = customItems.reduce((s, c) => s + (+c.amount || 0), 0);
  const total = stdTotal + customTotal;

  const action = updatePaymentTemplate.bind(null, tripId);

  function addCustom() {
    const tempKey = `Custom_${Date.now()}`;
    setCustomItems((arr) => [...arr, { key: tempKey, label: '', amount: 0 }]);
  }
  function updCustom(i, key, val) {
    setCustomItems((arr) => arr.map((c, idx) => idx === i ? { ...c, [key]: val } : c));
  }
  function rmCustom(i) {
    setCustomItems((arr) => arr.filter((_, idx) => idx !== i));
  }

  function deleteStandard(key) {
    if (!confirm(`Hapus "${STANDARD.find((s) => s.key === key)?.label || key}" dari template?\n\nSetelah save, milestone ini tidak akan muncul di Payment Matrix.\n(Bisa re-aktivasi nanti dengan klik "+ Tambah Milestone").`)) return;
    setHiddenStandard((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setStdValues((v) => ({ ...v, [key]: 0 }));
  }

  function restoreStandard(key) {
    setHiddenStandard((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }

  async function handleSubmit(formData) {
    setPending(true);
    setError('');

    // Hidden standard items → set to 0 (won't show in matrix because amount = 0)
    for (const k of hiddenStandard) {
      formData.set(`tpl_${k}`, 0);
    }

    // Custom items → form fields
    for (const c of customItems) {
      const lbl = (c.label || '').trim();
      if (!lbl) continue;
      const cleanKey = lbl.replace(/[^a-zA-Z0-9_]/g, '_');
      if (STANDARD_KEYS.has(cleanKey) || STANDARD_KEYS.has(lbl)) continue;
      formData.set(`tpl_${cleanKey}`, c.amount);
    }

    const result = await action(formData);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      setOpen(false);
      setPending(false);
    }
  }

  // Visible standard items (not deleted)
  const visibleStandard = STANDARD.filter((s) => !hiddenStandard.has(s.key));
  const hiddenStandardList = STANDARD.filter((s) => hiddenStandard.has(s.key));

  const isEmpty = total === 0;

  // Collapsed view — hanya tampil milestone aktif (amount > 0)
  if (!open) {
    const activeStandard = STANDARD.filter((m) => Number(stdValues[m.key] || 0) > 0);
    const activeCustom = customItems.filter((c) => Number(c.amount || 0) > 0);

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-xs font-bold text-brand-700 uppercase tracking-wider">Group Payment Template</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Nominal sekali set + custom item. P1-P7 + Pelunasan + opt-in (Visa/Asuransi). Klik Edit untuk hapus/tambah item.
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors">
            ✎ {isEmpty ? 'Set Template' : 'Edit Template'}
          </button>
        </div>

        {isEmpty ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <p className="font-semibold">⚠ Belum set template payment</p>
            <p className="text-xs mt-1">Klik "Set Template" untuk masukkan nominal DP/P1-P7/Pelunasan + custom item.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {activeStandard.map((m) => (
              <div key={m.key} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{m.label}</p>
                <p className="mt-0.5 text-sm font-bold text-brand-700">{fmtRupiah(stdValues[m.key] || 0)}</p>
              </div>
            ))}
            {activeCustom.map((c) => (
              <div key={c.key} className="p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-purple-700">{c.label || '(custom)'}</p>
                <p className="mt-0.5 text-sm font-bold text-brand-700">{fmtRupiah(c.amount || 0)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Total per Peserta</span>
          <span className="text-lg font-bold text-brand-700">{fmtRupiah(total)}</span>
        </div>
      </div>
    );
  }

  // Edit form
  return (
    <form action={handleSubmit} className="bg-white rounded-xl border border-brand-300 shadow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-brand-700">Edit Group Payment Template</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700">Batal</button>
      </div>

      <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
        Standard Milestones <span className="text-slate-400 font-normal normal-case">(klik ✕ untuk hapus item yang tidak dipakai)</span>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {visibleStandard.map((m) => (
          <div key={m.key} className="relative">
            <label className="block">
              <span className="text-xs font-semibold text-slate-700 flex items-center justify-between mb-1">
                <span>{m.label}</span>
                {!m.always && (
                  <button
                    type="button"
                    onClick={() => deleteStandard(m.key)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold"
                    title="Hapus milestone dari template"
                  >
                    ✕ Hapus
                  </button>
                )}
                {m.always && (
                  <span className="text-[9px] text-slate-400 italic">wajib</span>
                )}
              </span>
              <div className="relative">
                <span className="absolute left-2 top-1.5 text-xs text-slate-400">Rp</span>
                <input autoComplete="off"
                  type="number"
                  name={`tpl_${m.key}`}
                  value={stdValues[m.key] || ''}
                  onChange={(e) => setStdValues((v) => ({ ...v, [m.key]: parseInt(e.target.value) || 0 }))}
                  onFocus={(e) => e.target.select()}
                  min="0" placeholder="0"
                  className="w-full pl-7 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                />
              </div>
              {m.key !== 'Visa' && m.key !== 'Asuransi' && (
                <input type="date" name={`due_${m.key}`}
                  value={dueValues[m.key] || ''}
                  onChange={(e) => setDueValues((d) => ({ ...d, [m.key]: e.target.value }))}
                  title="Tanggal deadline (sinkron ke web)"
                  className="w-full mt-1 px-2 py-1.5 border border-slate-300 rounded text-xs focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white text-slate-600"
                />
              )}
            </label>
          </div>
        ))}
      </div>

      {/* Restore hidden milestones */}
      {hiddenStandardList.length > 0 && (
        <div className="mb-4 p-2 bg-slate-50 border border-slate-200 rounded">
          <p className="text-[10px] font-bold text-slate-600 uppercase mb-1.5">
            Milestone yang dihapus ({hiddenStandardList.length}):
          </p>
          <div className="flex flex-wrap gap-1.5">
            {hiddenStandardList.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => restoreStandard(m.key)}
                className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 hover:bg-amber-200 font-semibold"
                title="Restore milestone"
              >
                + {m.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">Custom Items</p>
        <button type="button" onClick={addCustom} className="text-xs font-semibold text-brand-600 hover:text-brand-700">+ Tambah Custom Item</button>
      </div>
      {customItems.length === 0 ? (
        <p className="text-xs text-slate-400 italic mb-4">Belum ada custom item. Klik "+ Tambah Custom Item" untuk tambah milestone non-standard (Tipping, Late Fee, dll).</p>
      ) : (
        <div className="space-y-2 mb-4">
          {customItems.map((c, i) => (
            <div key={c.key} className="flex gap-2 items-center">
              <input autoComplete="off"
                type="text" value={c.label} onChange={(e) => updCustom(i, 'label', e.target.value)}
                placeholder="Nama item (contoh: Tipping)"
                className="flex-1 px-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
              />
              <div className="relative w-40">
                <span className="absolute left-2 top-1.5 text-xs text-slate-400">Rp</span>
                <input autoComplete="off"
                  type="number" value={c.amount || ''} onChange={(e) => updCustom(i, 'amount', parseInt(e.target.value) || 0)}
                  onFocus={(e) => e.target.select()} min="0" placeholder="0"
                  className="w-full pl-7 pr-2 py-1.5 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white"
                />
              </div>
              <button type="button" onClick={() => rmCustom(i)} className="text-xs px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 font-semibold" title="Hapus custom item">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="p-3 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-between">
        <span className="text-xs font-bold text-brand-700 uppercase tracking-wider">Total / Peserta</span>
        <span className="text-xl font-bold text-brand-700">{fmtRupiah(total)}</span>
      </div>

      {error && <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">{error}</div>}

      <button type="submit" disabled={pending} className="w-full mt-4 py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">
        {pending ? 'Menyimpan...' : 'Simpan Template'}
      </button>

      <p className="text-[10px] text-slate-500 mt-2 text-center">
        💡 Milestone dengan nominal 0 (atau yang dihapus) tidak akan muncul di Payment Matrix
      </p>
    </form>
  );
}
