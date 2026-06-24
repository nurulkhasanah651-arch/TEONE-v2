'use client';

// ADDITIVE — panel Form Tambahan Visa di tab Visa per trip.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendVisaFormWA, sendVisaFormWABulk, getVisaFormResponse } from '@/lib/actions/visa-form';
import { VISA_FORM_TYPES, VISA_FORMS } from '@/lib/utils/visa-form-defs';

function fmt(s) { if (!s) return ''; try { return new Date(s).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }); } catch { return ''; } }

export default function VisaFormManager({ tripId, passengers = [] }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [formType, setFormType] = useState('france');
  const [msg, setMsg] = useState('');
  const [acting, setActing] = useState(null);
  const [review, setReview] = useState(null); // {name, type, response}

  const families = {}; const solos = [];
  for (const p of passengers) { if (p.familyId) (families[p.familyId] ||= []).push(p); else solos.push(p); }
  function notify(t) { setMsg(t); setTimeout(() => setMsg(''), 5000); }

  function kirim(headId) {
    setActing('wa-' + headId);
    startTransition(async () => {
      const r = await sendVisaFormWA(headId, formType);
      setActing(null);
      notify(r?.error ? `⚠ ${r.error}` : `✅ Form (${VISA_FORMS[formType].label}) terkirim ke ${r.sentTo}`);
      if (r?.ok) router.refresh();
    });
  }
  function kirimSemua() {
    setActing('bulk');
    startTransition(async () => {
      const r = await sendVisaFormWABulk(tripId, formType);
      setActing(null);
      notify(r?.error ? `⚠ ${r.error}` : r.message);
      if (r?.ok) router.refresh();
    });
  }
  async function lihat(p) {
    setActing('view-' + p.id);
    const r = await getVisaFormResponse(p.id, p.formType || formType);
    setActing(null);
    if (r?.ok && r.response) setReview({ name: p.name, type: p.formType || formType, response: r.response });
    else notify('⚠ Belum ada jawaban form untuk peserta ini');
  }

  function Badge({ p }) {
    if (p.formStatus === 'submitted') return <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">📝 Form submitted {fmt(p.formSubmittedAt)}</span>;
    if (p.formStatus === 'draft') return <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700">✏ Draft</span>;
    return <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">— Form belum diisi</span>;
  }
  function Actions({ p, head }) {
    return (
      <div className="flex gap-1.5 flex-wrap">
        {head && <button onClick={() => kirim(p.id)} disabled={busy} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50">{acting === 'wa-' + p.id ? 'Kirim…' : '📤 Kirim Form'}</button>}
        {p.formStatus && p.formStatus !== 'none' && <>
          <button onClick={() => lihat(p)} disabled={busy} className="text-[11px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 disabled:opacity-50">{acting === 'view-' + p.id ? '…' : '👁 Lihat'}</button>
          <a href={`/api/visa-form/export?passenger=${p.id}&type=${p.formType || formType}&fmt=xlsx`} className="text-[11px] px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200 hover:bg-green-100">Excel</a>
          <a href={`/api/visa-form/export?passenger=${p.id}&type=${p.formType || formType}&fmt=docx`} className="text-[11px] px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">Word</a>
        </>}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-bold text-brand-700">📝 Form Tambahan Visa</p>
          <p className="text-[11px] text-slate-500">Khusus negara tertentu. Kirim link form ke peserta (per keluarga ke kepala kel.). Peserta isi via web, lalu submit.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={formType} onChange={(e) => setFormType(e.target.value)} className="text-xs px-2 py-1.5 border border-slate-300 rounded bg-white">
            {VISA_FORM_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <button onClick={kirimSemua} disabled={busy} className="text-xs font-semibold px-3 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50">{acting === 'bulk' ? 'Mengirim…' : '📤 Kirim ke Semua'}</button>
        </div>
      </div>

      {msg && <div className="px-5 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-100">{msg}</div>}

      <div className="divide-y divide-slate-100">
        {Object.entries(families).map(([fid, members]) => {
          const head = members.find((m) => m.isHead) || members[0];
          return (
            <div key={'f' + fid} className="px-5 py-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <p className="text-xs font-bold text-slate-600">👨‍👩‍👧 Keluarga {head?.name} <span className="font-normal text-slate-400">({members.length} pax)</span></p>
                <button onClick={() => kirim(head.id)} disabled={busy} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50">{acting === 'wa-' + head.id ? 'Kirim…' : '📤 Kirim Form (kepala kel.)'}</button>
              </div>
              <div className="pl-2 space-y-1.5">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap"><span className="text-sm text-slate-700">{m.name}</span><Badge p={m} /></div>
                    <Actions p={m} head={false} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {solos.map((p) => (
          <div key={'s' + p.id} className="px-5 py-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap"><span className="text-sm font-medium text-slate-700">{p.name}</span><Badge p={p} /></div>
            <Actions p={p} head={true} />
          </div>
        ))}
      </div>

      {review && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setReview(null)}>
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-brand-700">Jawaban Form — {review.name}</p>
              <button onClick={() => setReview(null)} className="text-slate-400 hover:text-slate-700 text-xl">×</button>
            </div>
            <p className="text-[11px] text-slate-500 mb-2">{VISA_FORMS[review.type]?.label} · Status: {review.response.status}</p>
            {(VISA_FORMS[review.type]?.sections || []).map((sec) => (
              <div key={sec.title} className="mb-3">
                <p className="text-[11px] font-bold text-brand-700 uppercase mb-1">{sec.title}</p>
                {sec.fields.map((f) => {
                  const v = review.response.data?.[f.key];
                  if (!v) return null;
                  return <p key={f.key} className="text-xs text-slate-700 mb-0.5"><span className="text-slate-500">{f.label}:</span> <b>{String(v)}</b></p>;
                })}
              </div>
            ))}
            <div className="flex gap-2 pt-2 border-t">
              <a href={`/api/visa-form/export?passenger=${review.responseId || ''}`} className="hidden" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
