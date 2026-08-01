'use client';

// Template "Harga Tour Non-Umroh" (Khasanah) — dikelola di tab Finance.
// Sistem pakai ini untuk memecah harga pokok di invoice: Paket Umroh + Paket Tour <negara>.
// Path: components/finance/TourTemplateManager.jsx
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveTourTemplate, deleteTourTemplate } from '@/lib/actions/tour-templates';

const fmt = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

export default function TourTemplateManager({ initial = [] }) {
  const router = useRouter();
  const [, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ label: '', keywords: '', amount: '' });
  const [busy, setBusy] = useState(false);

  function beginAdd() { setEditId('new'); setForm({ label: '', keywords: '', amount: '' }); }
  function beginEdit(t) { setEditId(t.id); setForm({ label: t.label || '', keywords: t.keywords || '', amount: String(t.amount || '') }); }
  function cancel() { setEditId(null); }

  function save() {
    if (!form.label.trim()) { alert('Nama paket tour wajib diisi'); return; }
    setBusy(true);
    start(async () => {
      const r = await saveTourTemplate({ id: editId === 'new' ? undefined : editId, label: form.label, keywords: form.keywords, amount: form.amount });
      setBusy(false);
      if (r?.error) alert('Gagal: ' + r.error); else { setEditId(null); router.refresh(); }
    });
  }
  function remove(t) {
    if (!confirm(`Hapus template "${t.label}"?`)) return;
    start(async () => { const r = await deleteTourTemplate(t.id); if (r?.error) alert('Gagal: ' + r.error); else router.refresh(); });
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full px-5 py-3 flex items-center justify-between gap-3 bg-emerald-50 hover:brightness-95 transition text-left">
        <div>
          <h2 className="font-bold text-emerald-800">🕋 Harga Tour Non-Umroh (Umroh Plus)</h2>
          <p className="text-xs text-slate-500 mt-0.5">Template harga paket tour negara lain. Dipakai memecah pokok di invoice jadi Paket Umroh + Paket Tour. {initial.length} paket.</p>
        </div>
        <span className="text-slate-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-slate-500">
            Sistem cocokkan otomatis dari <b>nama trip</b>. <b>Kata kunci</b>: pisah koma = semua wajib ada; pakai <code>|</code> untuk alternatif ejaan.
            Contoh "Turki Dubai Abu Dhabi" → <code>turki,dubai,abudhabi</code>. Kalau kata kunci dikosongkan, otomatis pakai nama paket.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-200">
                  <th className="py-1.5 pr-2">Nama Paket Tour</th>
                  <th className="py-1.5 pr-2">Kata Kunci (dari nama trip)</th>
                  <th className="py-1.5 pr-2 text-right">Harga Tour</th>
                  <th className="py-1.5 pr-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {initial.map((t) => editId === t.id ? (
                  <tr key={t.id} className="bg-amber-50/40">
                    <td className="py-1.5 pr-2"><input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="w-full px-2 py-1 border border-slate-300 rounded text-xs" placeholder="Turki Cappadocia" /></td>
                    <td className="py-1.5 pr-2"><input value={form.keywords} onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))} className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono" placeholder="cappadocia|cappa" /></td>
                    <td className="py-1.5 pr-2"><input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-28 px-2 py-1 border border-slate-300 rounded text-xs text-right" placeholder="6000000" /></td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-right">
                      <button type="button" onClick={save} disabled={busy} className="text-xs font-bold text-emerald-700 mr-2">Simpan</button>
                      <button type="button" onClick={cancel} className="text-xs text-slate-400">Batal</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id}>
                    <td className="py-1.5 pr-2 font-semibold text-slate-800">{t.label}</td>
                    <td className="py-1.5 pr-2 font-mono text-[11px] text-slate-500">{t.keywords}</td>
                    <td className="py-1.5 pr-2 text-right font-bold text-slate-700">{fmt(t.amount)}</td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-right">
                      <button type="button" onClick={() => beginEdit(t)} className="text-xs font-semibold text-brand-600 mr-2">Edit</button>
                      <button type="button" onClick={() => remove(t)} className="text-xs text-red-500">Hapus</button>
                    </td>
                  </tr>
                ))}

                {editId === 'new' && (
                  <tr className="bg-emerald-50/40">
                    <td className="py-1.5 pr-2"><input autoFocus value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} className="w-full px-2 py-1 border border-slate-300 rounded text-xs" placeholder="mis. Uzbekistan" /></td>
                    <td className="py-1.5 pr-2"><input value={form.keywords} onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))} className="w-full px-2 py-1 border border-slate-300 rounded text-xs font-mono" placeholder="kosongkan = pakai nama" /></td>
                    <td className="py-1.5 pr-2"><input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-28 px-2 py-1 border border-slate-300 rounded text-xs text-right" placeholder="4000000" /></td>
                    <td className="py-1.5 pr-2 whitespace-nowrap text-right">
                      <button type="button" onClick={save} disabled={busy} className="text-xs font-bold text-emerald-700 mr-2">Simpan</button>
                      <button type="button" onClick={cancel} className="text-xs text-slate-400">Batal</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {editId !== 'new' && (
            <button type="button" onClick={beginAdd} className="text-xs font-semibold text-emerald-700 border border-emerald-300 rounded-lg px-3 py-1.5 hover:bg-emerald-50">+ Tambah Paket Tour</button>
          )}
        </div>
      )}
    </div>
  );
}
