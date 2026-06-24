'use client';

// PUBLIC — isi Form Tambahan Visa per anggota keluarga. Draft + Submit.
import { useState } from 'react';
import { saveVisaFormDraft, submitVisaForm } from '@/lib/actions/visa-form';

function Field({ f, value, onChange }) {
  const base = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none bg-white';
  const lbl = <span className="text-xs font-semibold text-slate-700 block mb-1">{f.label}{f.required && <span className="text-red-500 ml-0.5">*</span>}</span>;
  if (f.type === 'textarea')
    return <label className="block">{lbl}<textarea rows={3} value={value || ''} onChange={(e) => onChange(f.key, e.target.value)} className={base} /></label>;
  if (f.type === 'select')
    return <label className="block">{lbl}<select value={value || ''} onChange={(e) => onChange(f.key, e.target.value)} className={base}><option value="">— Pilih —</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
  if (f.type === 'radio')
    return (<div>{lbl}<div className="flex gap-4 pt-1">{f.options.map((o) => (
      <label key={o} className="flex items-center gap-1.5 text-sm cursor-pointer"><input type="radio" name={f.key + value} checked={value === o} onChange={() => onChange(f.key, o)} />{o}</label>
    ))}</div></div>);
  return <label className="block">{lbl}<input type={f.type === 'date' ? 'date' : 'text'} value={value || ''} onChange={(e) => onChange(f.key, e.target.value)} className={base} /></label>;
}

function MemberForm({ token, sections, member }) {
  const [data, setData] = useState(member.data || {});
  const [status, setStatus] = useState(member.status || 'none');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  function upd(k, v) { setData((d) => ({ ...d, [k]: v })); }

  async function save(submit) {
    setBusy(true); setMsg('');
    try {
      const fn = submit ? submitVisaForm : saveVisaFormDraft;
      const r = (await fn(token, member.id, data)) || {};
      if (r.error) setMsg('⚠ ' + r.error);
      else { setStatus(r.status); setMsg(submit ? '✅ Form terkirim. Terima kasih!' : '💾 Draft tersimpan.'); }
    } catch (e) { setMsg('⚠ ' + (e?.message || 'Gagal')); }
    setBusy(false);
  }

  const submitted = status === 'submitted';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card p-5 space-y-4">
      {submitted && <div className="p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold text-center">✅ Form sudah disubmit. Anda masih bisa memperbarui bila perlu.</div>}
      {sections.map((sec) => (
        <div key={sec.title} className="border border-slate-200 rounded-lg p-3">
          <p className="text-[11px] font-bold text-brand-700 uppercase tracking-wider mb-2">{sec.title}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sec.fields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'md:col-span-2' : ''}>
                <Field f={f} value={data[f.key]} onChange={upd} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {msg && <p className={`text-sm font-medium ${msg.startsWith('⚠') ? 'text-red-600' : 'text-emerald-700'}`}>{msg}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => save(false)} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 disabled:opacity-50">{busy ? '...' : '💾 Simpan Draft'}</button>
        <button disabled={busy} onClick={() => save(true)} className="flex-1 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-bold disabled:opacity-50">{busy ? 'Mengirim...' : '✓ Submit Form'}</button>
      </div>
    </div>
  );
}

export default function VisaFormPublicClient({ token, sections = [], members = [] }) {
  const [idx, setIdx] = useState(0);
  const m = members[idx];
  if (!m) return null;
  return (
    <div className="space-y-3">
      {members.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {members.map((mem, i) => (
            <button key={mem.id} onClick={() => setIdx(i)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${i === idx ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-slate-700 border-slate-300'}`}>
              {mem.name}{mem.status === 'submitted' ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}
      <MemberForm key={m.id} token={token} sections={sections} member={m} />
    </div>
  );
}
