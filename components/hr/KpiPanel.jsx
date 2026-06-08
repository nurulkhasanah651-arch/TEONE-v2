'use client';

// KPI: definisi metrik + matriks realisasi bulanan per karyawan
import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { upsertKpiDefinition, deleteKpiDefinition, saveKpiActual } from '@/lib/actions/kpi';

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

export default function KpiPanel({ year, month, isAdmin, definitions, employees, records, autoByOfficer }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState(null);
  const [empId, setEmpId] = useState(employees[0]?.id ? String(employees[0].id) : '');
  const [showDefForm, setShowDefForm] = useState(false);
  const [editDef, setEditDef] = useState(null);

  const emp = employees.find((e) => String(e.id) === String(empId));
  function gotoMonth(delta) {
    let y = year, m = month + delta;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    router.push(`/hr/kpi?y=${y}&m=${m}`);
  }

  // metrik berlaku utk role karyawan terpilih (atau metrik tanpa role = umum)
  const empDefs = useMemo(() => {
    if (!emp) return [];
    return definitions.filter((d) => !d.role || d.role === emp.role);
  }, [definitions, emp]);

  const recMap = useMemo(() => {
    const m = {};
    for (const r of records) m[`${r.employee_id}_${r.kpi_definition_id}`] = r;
    return m;
  }, [records]);

  function autoVal(def) {
    if ((def.data_source || 'manual') !== 'auto') return null;
    const off = (emp?.full_name || '').trim().toLowerCase();
    const v = autoByOfficer[off];
    if (!v) return 0;
    return Number(v[def.metric_key] || 0);
  }

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`px-4 py-2 rounded text-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>{msg.text}</div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => gotoMonth(-1)} className="px-2 py-1 rounded hover:bg-slate-100">‹</button>
          <span className="font-bold text-slate-700">{MONTHS[month - 1]} {year}</span>
          <button onClick={() => gotoMonth(1)} className="px-2 py-1 rounded hover:bg-slate-100">›</button>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditDef(null); setShowDefForm(true); }}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold rounded">+ Definisi Metrik</button>
        )}
      </div>

      {/* Pilih karyawan */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
        <label className="text-sm font-bold text-slate-600">Karyawan:</label>
        <select value={empId} onChange={(e) => setEmpId(e.target.value)} className="px-3 py-2 border border-slate-300 rounded text-sm bg-white">
          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.role})</option>)}
        </select>
      </div>

      {/* Matriks KPI karyawan */}
      {emp && (
        <KpiMatrix
          emp={emp} defs={empDefs} recMap={recMap} year={year} month={month}
          isAdmin={isAdmin} autoVal={autoVal} pending={pending}
          onSave={(payload) => {
            setMsg(null);
            startTransition(async () => {
              const r = await saveKpiActual(payload);
              if (r?.error) { setMsg({ type: 'error', text: r.error }); return; }
              setMsg({ type: 'ok', text: 'KPI tersimpan' });
              router.refresh();
            });
          }}
        />
      )}

      {/* Daftar definisi metrik */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 text-sm font-bold text-slate-700">Definisi Metrik KPI</div>
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2">Metrik</th><th className="px-2 py-2">Role</th><th className="px-2 py-2">Target</th><th className="px-2 py-2">Bobot</th><th className="px-2 py-2">Sumber</th><th className="px-2 py-2"></th>
            </tr></thead>
            <tbody>
              {definitions.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Belum ada metrik. Klik "+ Definisi Metrik".</td></tr>
              ) : definitions.map((d) => (
                <tr key={d.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-bold text-slate-700">{d.metric_label}{d.unit ? ` (${d.unit})` : ''}</td>
                  <td className="px-2 py-2">{d.role || 'semua'}</td>
                  <td className="px-2 py-2">{d.target_value}</td>
                  <td className="px-2 py-2">{d.weight}</td>
                  <td className="px-2 py-2">{d.data_source === 'auto' ? '⚙ auto' : '✍ manual'}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    <button onClick={() => { setEditDef(d); setShowDefForm(true); }} className="px-2 py-1 hover:bg-slate-100 rounded">✏️</button>
                    <button onClick={() => { if (confirm('Nonaktifkan metrik ini?')) startTransition(async () => { await deleteKpiDefinition(d.id); router.refresh(); }); }} className="px-2 py-1 hover:bg-red-100 rounded">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showDefForm && <DefForm def={editDef} onClose={() => setShowDefForm(false)} onSaved={() => { setShowDefForm(false); router.refresh(); }} />}
    </div>
  );
}

function KpiMatrix({ emp, defs, recMap, year, month, isAdmin, autoVal, onSave, pending }) {
  const [drafts, setDrafts] = useState({});
  let totalW = 0, totalWS = 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 text-sm font-bold text-slate-700">Realisasi KPI · {emp.full_name}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-slate-500 border-b border-slate-100">
            <th className="px-4 py-2">Metrik</th><th className="px-2 py-2">Target</th><th className="px-2 py-2">Realisasi</th><th className="px-2 py-2">Capai %</th><th className="px-2 py-2">Bobot</th><th className="px-2 py-2">Skor×Bobot</th>{isAdmin && <th className="px-2 py-2"></th>}
          </tr></thead>
          <tbody>
            {defs.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-6 text-center text-slate-400">Belum ada metrik untuk role {emp.role}. Tambah di Definisi Metrik.</td></tr>
            ) : defs.map((d) => {
              const rec = recMap[`${emp.id}_${d.id}`];
              const auto = autoVal(d);
              const isAuto = (d.data_source || 'manual') === 'auto';
              const actual = isAuto ? auto : (drafts[d.id] ?? (rec?.actual_value ?? ''));
              const target = d.target_value || 0;
              const a = Number(actual || 0), t = Number(target || 0);
              const pct = t > 0 ? Math.round((d.higher_is_better !== false ? (a / t) : (a > 0 ? t / a : 0)) * 1000) / 10 : 0;
              const score = Math.min(120, Math.max(0, pct));
              const ws = Math.round(score * (Number(d.weight) || 1) * 10) / 10;
              totalW += Number(d.weight) || 1; totalWS += ws;
              return (
                <tr key={d.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-bold text-slate-700">{d.metric_label}{d.unit ? ` (${d.unit})` : ''}{isAuto && <span className="ml-1 text-[10px] text-indigo-500">auto</span>}</td>
                  <td className="px-2 py-2">{target}</td>
                  <td className="px-2 py-2">
                    {isAuto ? <span className="font-bold">{auto}</span> : (
                      <input autoComplete="off" inputMode="numeric" defaultValue={rec?.actual_value ?? ''}
                        onChange={(e) => setDrafts((s) => ({ ...s, [d.id]: e.target.value }))}
                        className="w-20 px-2 py-1 border border-slate-200 rounded text-right" disabled={!isAdmin} />
                    )}
                  </td>
                  <td className="px-2 py-2 font-bold" style={{ color: pct >= 100 ? '#15803d' : pct >= 80 ? '#92400e' : '#b91c1c' }}>{pct}%</td>
                  <td className="px-2 py-2">{d.weight}</td>
                  <td className="px-2 py-2 font-bold">{ws}</td>
                  {isAdmin && (
                    <td className="px-2 py-2">
                      <button disabled={pending}
                        onClick={() => onSave({ employee_id: emp.id, kpi_definition_id: d.id, year, month, target_value: target, actual_value: actual, higher_is_better: d.higher_is_better, weight: d.weight })}
                        className="px-2 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded text-[11px] font-bold">Simpan</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {defs.length > 0 && (
            <tfoot><tr className="bg-slate-50 font-bold">
              <td className="px-4 py-2" colSpan={4}>Total Skor Terbobot</td>
              <td className="px-2 py-2">{Math.round(totalW * 10) / 10}</td>
              <td className="px-2 py-2 text-brand-700">{Math.round(totalWS * 10) / 10}{totalW > 0 ? ` (${Math.round((totalWS / totalW) * 10) / 10} rata2)` : ''}</td>
              {isAdmin && <td></td>}
            </tr></tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function DefForm({ def, onClose, onSaved }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState('');
  const [f, setF] = useState({
    metric_label: def?.metric_label || '', metric_key: def?.metric_key || '',
    role: def?.role || '', target_value: def?.target_value ?? '', weight: def?.weight ?? 1,
    unit: def?.unit || '', data_source: def?.data_source || 'manual',
    higher_is_better: def?.higher_is_better !== false,
  });
  function set(k, v) { setF((s) => ({ ...s, [k]: v })); }
  function submit() {
    setErr('');
    startTransition(async () => {
      const r = await upsertKpiDefinition({ id: def?.id, ...f });
      if (r?.error) { setErr(r.error); return; }
      onSaved();
    });
  }
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">{def ? 'Edit Metrik KPI' : 'Metrik KPI Baru'}</h3>
        <label className="block"><span className="text-xs font-bold text-slate-600">Nama metrik *</span>
          <input autoComplete="off" value={f.metric_label} onChange={(e) => set('metric_label', e.target.value)} placeholder="cth: Jumlah Closing" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Role (kosong=semua)</span>
            <select value={f.role} onChange={(e) => set('role', e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm bg-white">
              <option value="">Semua</option><option value="cs">CS</option><option value="ops">Ops</option><option value="manager">Manager</option><option value="accounting">Accounting</option><option value="pic">PIC</option><option value="other">Other</option>
            </select></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Satuan</span>
            <input autoComplete="off" value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="closing / %" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm" /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Target</span>
            <input autoComplete="off" inputMode="numeric" value={f.target_value} onChange={(e) => set('target_value', e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm text-right" /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Bobot</span>
            <input autoComplete="off" inputMode="numeric" value={f.weight} onChange={(e) => set('weight', e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm text-right" /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Sumber data</span>
            <select value={f.data_source} onChange={(e) => set('data_source', e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm bg-white">
              <option value="manual">Manual (diisi HR)</option><option value="auto">Auto dari data CS</option>
            </select></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Arah baik</span>
            <select value={f.higher_is_better ? '1' : '0'} onChange={(e) => set('higher_is_better', e.target.value === '1')} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm bg-white">
              <option value="1">Makin tinggi makin baik</option><option value="0">Makin rendah makin baik</option>
            </select></label>
        </div>
        {f.data_source === 'auto' && (
          <label className="block"><span className="text-xs font-bold text-slate-600">Kunci auto (metric_key)</span>
            <select value={f.metric_key} onChange={(e) => set('metric_key', e.target.value)} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm bg-white">
              <option value="">— pilih —</option><option value="cs_closing">cs_closing (total closing bulan ini)</option><option value="cs_leads">cs_leads (total leads bulan ini)</option>
            </select>
            <span className="text-[10px] text-slate-400">Dicocokkan dengan nama karyawan = CS Officer di input CS Daily.</span></label>
        )}
        {err && <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded">Batal</button>
          <button onClick={submit} disabled={pending} className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded">{pending ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </div>
    </div>
  );
}
