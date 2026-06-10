'use client';

// Jadwal Konten — tabel mirip spreadsheet, nyambung ke list trip
import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createContentPost, updateContentPost, deleteContentPost } from '@/lib/actions/content';

const PROGRESS = [
  { v: 'brief', l: 'Brief', cls: 'bg-slate-100 text-slate-600' },
  { v: 'brief_done', l: 'Brief Done', cls: 'bg-blue-100 text-blue-700' },
  { v: 'design_done', l: 'Design Done', cls: 'bg-indigo-100 text-indigo-700' },
  { v: 'copywriting_done', l: 'Copywriting Done', cls: 'bg-purple-100 text-purple-700' },
  { v: 'content_done', l: 'Content Done', cls: 'bg-amber-100 text-amber-700' },
  { v: 'uploaded', l: 'Uploaded', cls: 'bg-green-100 text-green-700' },
];
const PLATFORMS = ['Feed Instagram', 'Reels Instagram', 'Reels + Tiktok', 'Story Instagram', 'Tiktok', 'Carousel'];
const PILLARS = ['Awareness', 'Engagement', 'Conversion', 'Promo dan Penawaran', 'Emotional', 'Storytelling', 'Edukasi', 'Experienced', 'Konten Viral & Tren'];
const OBJECTIVES = ['Awareness', 'Consideration', 'Conversion'];
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

function progressMeta(v) { return PROGRESS.find((p) => p.v === v) || PROGRESS[0]; }
function fdate(d) { if (!d) return '—'; const x = new Date(d + 'T00:00:00'); return `${x.getDate()} ${MONTHS[x.getMonth()]}`; }
function ftime(t) { return t ? String(t).slice(0, 5) : ''; }

export default function ContentScheduleTable({ posts, trips, canEdit }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fMonth, setFMonth] = useState('');
  const [fProgress, setFProgress] = useState('');
  const [msg, setMsg] = useState(null);

  const filtered = useMemo(() => {
    return posts
      .filter((p) => !fMonth || (p.scheduled_date || '').slice(0, 7) === fMonth)
      .filter((p) => !fProgress || p.progress === fProgress)
      .sort((a, b) => String(a.scheduled_date || '9999').localeCompare(String(b.scheduled_date || '9999')) || String(a.posting_time || '').localeCompare(String(b.posting_time || '')));
  }, [posts, fMonth, fProgress]);

  const months = useMemo(() => {
    const set = new Set(posts.map((p) => (p.scheduled_date || '').slice(0, 7)).filter(Boolean));
    return [...set].sort();
  }, [posts]);

  function onDelete(id) {
    if (!confirm('Hapus jadwal konten ini?')) return;
    startTransition(async () => { await deleteContentPost(id); router.refresh(); });
  }

  return (
    <div className="space-y-3">
      {msg && <div className={`px-4 py-2 rounded text-sm ${msg.t === 'e' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{msg.x}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={fMonth} onChange={(e) => setFMonth(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white">
          <option value="">Semua bulan</option>
          {months.map((m) => <option key={m} value={m}>{MONTHS[parseInt(m.slice(5)) - 1]} {m.slice(0, 4)}</option>)}
        </select>
        <select value={fProgress} onChange={(e) => setFProgress(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded text-sm bg-white">
          <option value="">Semua progress</option>
          {PROGRESS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
        <span className="text-xs text-slate-400">{filtered.length} konten</span>
        {canEdit && (
          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="ml-auto px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg">+ Jadwal Konten</button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap">
          <thead><tr className="text-left text-slate-500 border-b border-slate-200 bg-slate-50">
            <th className="px-2 py-2">Tgl</th><th className="px-2 py-2">Jam</th><th className="px-2 py-2">Platform</th>
            <th className="px-2 py-2">Pillar</th><th className="px-2 py-2">Objective</th><th className="px-2 py-2">Kode Trip</th>
            <th className="px-2 py-2">Judul / Brief</th><th className="px-2 py-2">Progress</th><th className="px-2 py-2">PIC</th>
            <th className="px-2 py-2">Deadline</th><th className="px-2 py-2">Link</th><th className="px-2 py-2">Ads</th><th className="px-2 py-2"></th>
          </tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={13} className="px-3 py-10 text-center text-slate-400">Belum ada jadwal konten. Klik "+ Jadwal Konten".</td></tr>
            ) : filtered.map((p) => {
              const pm = progressMeta(p.progress);
              return (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 align-top">
                  <td className="px-2 py-2 font-semibold">{fdate(p.scheduled_date)}</td>
                  <td className="px-2 py-2">{ftime(p.posting_time)}</td>
                  <td className="px-2 py-2">{p.platform || '—'}</td>
                  <td className="px-2 py-2">{p.content_pillar || '—'}</td>
                  <td className="px-2 py-2">{p.objective || '—'}</td>
                  <td className="px-2 py-2 font-mono text-brand-700">{p.kode_trip || (p.trip_id ? p.trip_id : '—')}</td>
                  <td className="px-2 py-2 max-w-[220px] whitespace-normal">
                    <div className="font-bold text-slate-800">{p.title}</div>
                    {p.brief && <div className="text-slate-400 text-[11px] line-clamp-2">{p.brief}</div>}
                  </td>
                  <td className="px-2 py-2"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pm.cls}`}>{pm.l}</span></td>
                  <td className="px-2 py-2">{p.assignee || '—'}</td>
                  <td className="px-2 py-2">{fdate(p.deadline)}</td>
                  <td className="px-2 py-2 space-x-1">
                    {p.link_draft && <a href={p.link_draft} target="_blank" className="text-brand-600 hover:underline">draft</a>}
                    {p.link_trello && <a href={p.link_trello} target="_blank" className="text-sky-600 hover:underline">trello</a>}
                    {p.ig_permalink && <a href={p.ig_permalink} target="_blank" className="text-pink-600 hover:underline">IG</a>}
                  </td>
                  <td className="px-2 py-2 text-center">{p.boost_ads ? '🚀' : ''}</td>
                  <td className="px-2 py-2 text-right">
                    {canEdit && (
                      <>
                        <button onClick={() => { setEditing(p); setShowForm(true); }} className="px-1.5 py-0.5 hover:bg-slate-200 rounded">✏️</button>
                        <button onClick={() => onDelete(p.id)} disabled={pending} className="px-1.5 py-0.5 hover:bg-red-100 rounded">🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showForm && <ScheduleForm post={editing} trips={trips} onClose={() => setShowForm(false)} onSaved={(m) => { setShowForm(false); if (m) setMsg(m); router.refresh(); }} />}
    </div>
  );
}

function ScheduleForm({ post, trips, onClose, onSaved }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState('');
  const [kodeTrip, setKodeTrip] = useState(post?.kode_trip || (post?.trip_id || ''));
  const inp = 'w-full mt-1 px-3 py-2 border border-slate-300 rounded text-sm';

  function submit(e) {
    e.preventDefault();
    setErr('');
    const fd = new FormData(e.target);
    // cocokkan kode_trip ke trip_id kalau ada di list
    const matched = trips.find((t) => (t.kode_trip || '').toLowerCase() === kodeTrip.trim().toLowerCase() || String(t.id) === kodeTrip.trim());
    fd.set('kode_trip', kodeTrip.trim());
    fd.set('trip_id', matched ? matched.id : '');
    startTransition(async () => {
      const r = post ? await updateContentPost(post.id, fd) : await createContentPost(fd);
      if (r?.error) { setErr(r.error); return; }
      onSaved({ t: 'ok', x: post ? 'Jadwal diperbarui' : 'Jadwal ditambahkan' });
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">{post ? 'Edit Jadwal Konten' : 'Jadwal Konten Baru'}</h3>
        <form onSubmit={submit} className="space-y-3">
          <label className="block"><span className="text-xs font-bold text-slate-600">Judul konten *</span>
            <input autoComplete="off" name="title" defaultValue={post?.title || ''} required placeholder="cth: Soft Selling Winter Jepang" className={inp} /></label>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block"><span className="text-xs font-bold text-slate-600">Tgl posting</span>
              <input autoComplete="off" type="date" name="scheduled_date" defaultValue={post?.scheduled_date || ''} className={inp} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Jam</span>
              <input autoComplete="off" type="time" name="posting_time" defaultValue={post?.posting_time ? String(post.posting_time).slice(0,5) : ''} className={inp} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Deadline</span>
              <input autoComplete="off" type="date" name="deadline" defaultValue={post?.deadline || ''} className={inp} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Progress</span>
              <select name="progress" defaultValue={post?.progress || 'brief'} className={inp + ' bg-white'}>
                {PROGRESS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Platform</span>
              <select name="platform" defaultValue={post?.platform || ''} className={inp + ' bg-white'}>
                <option value="">—</option>{PLATFORMS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Content Pillar</span>
              <select name="content_pillar" defaultValue={post?.content_pillar || ''} className={inp + ' bg-white'}>
                <option value="">—</option>{PILLARS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Objective</span>
              <select name="objective" defaultValue={post?.objective || ''} className={inp + ' bg-white'}>
                <option value="">—</option>{OBJECTIVES.map((x) => <option key={x} value={x}>{x}</option>)}
              </select></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">PIC Multimedia</span>
              <input autoComplete="off" name="assignee" defaultValue={post?.assignee || ''} placeholder="nama PIC" className={inp} /></label>
          </div>

          <label className="block"><span className="text-xs font-bold text-slate-600">Kode Trip (pilih atau ketik bebas)</span>
            <input autoComplete="off" list="trip-codes" value={kodeTrip} onChange={(e) => setKodeTrip(e.target.value)} placeholder="cth: 420 / UNITRIP" className={inp} />
            <datalist id="trip-codes">
              {trips.map((t) => <option key={t.id} value={t.kode_trip || t.id}>{t.name}</option>)}
            </datalist></label>

          <label className="block"><span className="text-xs font-bold text-slate-600">Brief / Spesifikasi konten</span>
            <textarea name="brief" defaultValue={post?.brief || ''} rows={2} placeholder="rasio, durasi, target audience, konsep…" className={inp} /></label>
          <label className="block"><span className="text-xs font-bold text-slate-600">Copywriting / Headline & Caption</span>
            <textarea name="caption" defaultValue={post?.caption || ''} rows={2} className={inp} /></label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block"><span className="text-xs font-bold text-slate-600">Link Draft (GDrive)</span>
              <input autoComplete="off" name="link_draft" defaultValue={post?.link_draft || ''} placeholder="https://drive.google.com/…" className={inp} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Link Trello</span>
              <input autoComplete="off" name="link_trello" defaultValue={post?.link_trello || ''} placeholder="https://trello.com/…" className={inp} /></label>
            <label className="block"><span className="text-xs font-bold text-slate-600">Link Instagram</span>
              <input autoComplete="off" name="ig_permalink" defaultValue={post?.ig_permalink || ''} placeholder="https://instagram.com/…" className={inp} /></label>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="boost_ads" value="1" defaultChecked={post?.boost_ads} /> 🚀 Boost Ads</label>
            <label className="block flex-1"><span className="text-xs font-bold text-slate-600">Brand tag (opsional)</span>
              <input autoComplete="off" name="brand_tag" defaultValue={post?.brand_tag || ''} placeholder="cth: COL TE>TA, KT JOG" className={inp} /></label>
          </div>

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
