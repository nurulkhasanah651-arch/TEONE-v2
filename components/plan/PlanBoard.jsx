'use client';

// Board rencana trip per region + modal tambah/edit
import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTripPlan, updateTripPlan, deleteTripPlan, setTripPlanStatus } from '@/lib/actions/trip-plans';

const REGIONS = [
  { value: 'asia', label: 'Asia', icon: '🗾' },
  { value: 'europe', label: 'Eropa', icon: '🗼' },
  { value: 'newzealand', label: 'New Zealand', icon: '🥝' },
  { value: 'australia', label: 'Australia', icon: '🦘' },
  { value: 'turkey', label: 'Turki', icon: '🕌' },
  { value: 'us', label: 'Amerika (US/Canada)', icon: '🗽' },
  { value: 'umroh', label: 'Umroh & Religi', icon: '🕋' },
  { value: 'other', label: 'Lainnya', icon: '🌏' },
];
const STATUS = {
  ide:     { label: 'Ide',    cls: 'bg-slate-100 text-slate-600' },
  rencana: { label: 'Rencana',cls: 'bg-amber-100 text-amber-700' },
  rilis:   { label: 'Rilis',  cls: 'bg-green-100 text-green-700' },
  batal:   { label: 'Batal',  cls: 'bg-red-100 text-red-600' },
};
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function rupiah(n) { return n == null ? '—' : 'Rp ' + new Intl.NumberFormat('id-ID').format(n); }
function tgl(d) { if (!d) return null; const x = new Date(d + 'T00:00:00'); return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; }
function daysTo(d) { if (!d) return null; return Math.ceil((new Date(d) - new Date()) / 86400000); }

export default function PlanBoard({ plans, canEdit }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState(null);

  const byRegion = useMemo(() => {
    const m = {}; REGIONS.forEach((r) => (m[r.value] = []));
    for (const p of plans) (m[p.region] || (m.other)).push(p);
    return m;
  }, [plans]);

  function onDelete(id) {
    if (!confirm('Hapus rencana ini?')) return;
    startTransition(async () => { await deleteTripPlan(id); router.refresh(); });
  }
  function cycleStatus(p) {
    const order = ['ide', 'rencana', 'rilis', 'batal'];
    const next = order[(order.indexOf(p.status) + 1) % order.length];
    startTransition(async () => { await setTripPlanStatus(p.id, next); router.refresh(); });
  }

  return (
    <div className="space-y-3">
      {msg && <div className={`px-4 py-2 rounded text-sm ${msg.t === 'e' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.x}</div>}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-500">{plans.length} rencana · klik badge status untuk ganti tahap</p>
        {canEdit && (
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg">+ Rencana Trip</button>
        )}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {REGIONS.map((r) => {
          const items = byRegion[r.value] || [];
          return (
            <div key={r.value} className="min-w-[270px] w-[270px] flex-shrink-0 bg-slate-50 rounded-xl border border-slate-200">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-slate-50 rounded-t-xl">
                <span className="font-bold text-sm text-slate-700">{r.icon} {r.label}</span>
                <span className="text-[11px] text-slate-400">{items.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[60px]">
                {items.length === 0 && <p className="text-[11px] text-slate-300 text-center py-3">—</p>}
                {items.map((p) => {
                  const dd = daysTo(p.release_deadline);
                  return (
                    <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-2.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-slate-800 leading-tight">{p.title}</p>
                        <button onClick={() => cycleStatus(p)} disabled={!canEdit || pending}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS[p.status]?.cls}`} title="Klik untuk ganti status">
                          {STATUS[p.status]?.label}
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-500 space-y-0.5">
                        {p.planned_departure && <div>✈ {tgl(p.planned_departure)}{p.duration_days ? ` · ${p.duration_days} hari` : ''}</div>}
                        {p.price != null && <div>💰 {rupiah(p.price)}{p.target_pax ? ` · target ${p.target_pax} pax` : ''}</div>}
                        {p.release_deadline && (
                          <div className={dd != null && dd < 30 && p.status !== 'rilis' ? 'text-red-600 font-semibold' : ''}>
                            🚀 Release: {tgl(p.release_deadline)}{dd != null && dd >= 0 ? ` (${dd} hari lagi)` : ''}
                          </div>
                        )}
                        {p.notes && <div className="text-slate-400 line-clamp-2">📝 {p.notes}</div>}
                      </div>
                      {canEdit && (
                        <div className="flex gap-1 pt-0.5">
                          <button onClick={() => { setEditing(p); setShowForm(true); }} className="text-[11px] px-2 py-0.5 rounded hover:bg-slate-100">✏️ Edit</button>
                          <button onClick={() => onDelete(p.id)} className="text-[11px] px-2 py-0.5 rounded hover:bg-red-50 text-red-500">🗑</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && <PlanForm plan={editing} onClose={() => setShowForm(false)} onSaved={(m) => { setShowForm(false); if (m) setMsg(m); router.refresh(); }} />}
    </div>
  );
}

function PlanForm({ plan, onClose, onSaved }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState('');
  function submit(e) {
    e.preventDefault();
    setErr('');
    const fd = new FormData(e.target);
    startTransition(async () => {
      const r = plan ? await updateTripPlan(plan.id, fd) : await createTripPlan(fd);
      if (r?.error) { setErr(r.error); return; }
      onSaved({ t: 'ok', x: plan ? 'Rencana diperbarui' : 'Rencana ditambahkan' });
    });
  }
  const inp = 'w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm';
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">{plan ? 'Edit Rencana Trip' : 'Rencana Trip Baru'}</h3>
        <form onSubmit={submit} className="space-y-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Judul *</span>
            <input autoComplete="off" name="title" defaultValue={plan?.title || ''} required placeholder="cth: Eropa Timur Winter 12D" className={inp} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="text-xs font-bold text-slate-600">Region</span>
              <select name="region" defaultValue={plan?.region || 'asia'} className={inp + ' bg-white'}>
                {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.icon} {r.label}</option>)}
              </select></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Status</span>
              <select name="status" defaultValue={plan?.status || 'ide'} className={inp + ' bg-white'}>
                <option value="ide">Ide</option><option value="rencana">Rencana</option><option value="rilis">Rilis</option><option value="batal">Batal</option>
              </select></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Tanggal keberangkatan</span>
              <input autoComplete="off" type="date" name="planned_departure" defaultValue={plan?.planned_departure || ''} className={inp} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Deadline release</span>
              <input autoComplete="off" type="date" name="release_deadline" defaultValue={plan?.release_deadline || ''} className={inp} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Estimasi harga (Rp)</span>
              <input autoComplete="off" inputMode="numeric" name="price" defaultValue={plan?.price ?? ''} placeholder="cth: 35000000" className={inp + ' text-right'} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Durasi (hari)</span>
              <input autoComplete="off" type="number" name="duration_days" defaultValue={plan?.duration_days ?? ''} className={inp} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Target pax</span>
              <input autoComplete="off" type="number" name="target_pax" defaultValue={plan?.target_pax ?? ''} className={inp} /></label>
          </div>
          <label className="block"><span className="text-xs font-bold text-slate-600">Catatan / konsep</span>
            <textarea name="notes" defaultValue={plan?.notes || ''} rows={2} className={inp} /></label>
          {err && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{err}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded">Batal</button>
            <button type="submit" disabled={pending} className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded">{pending ? 'Menyimpan…' : 'Simpan'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
