'use client';

// Konten Manager UI — 3 bagian: Kalender Konten, Performa IG, Koneksi IG
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createContentPost, updateContentPost, deleteContentPost,
  generateCaption, saveIgConnection, refreshIgData, disconnectIg, linkIgMedia,
} from '@/lib/actions/content';
import { resolveBrandCodeBrowser } from '@/lib/brand-shared';
import ContentScheduleTable from './ContentScheduleTable';

const STATUS_UI = {
  draft:     { label: 'Draft',     cls: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'Scheduled', cls: 'bg-amber-100 text-amber-700' },
  posted:    { label: 'Posted',    cls: 'bg-green-100 text-green-700' },
};
const TYPE_ICON = { feed: '🖼', reel: '🎬', story: '⭕', carousel: '🃏' };

function fmtNum(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('id-ID').format(n);
}
function fmtRp(n) {
  return 'Rp ' + new Intl.NumberFormat('id-ID').format(n || 0);
}

export default function ContentClient({ posts, trips, ig, igFetchedAt, igConnected, campaignStats }) {
  const router = useRouter();
  const [tab, setTab] = useState('jadwal');
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">📱 Konten Manager</h1>
          <p className="text-xs text-slate-500">Rencanakan konten per trip & campaign, pantau performa Instagram</p>
        </div>
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1 overflow-x-auto max-w-full">
          {[['jadwal', '🗓 Jadwal Konten'], ['kalender', '📅 Kalender'], ['ig', '📈 Performa IG'], ['koneksi', '⚙️ Koneksi']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap shrink-0 transition-colors ${tab === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'jadwal' && <ContentScheduleTable posts={posts} trips={trips} canEdit={true} />}
      {tab === 'kalender' && <CalendarTab posts={posts} trips={trips} campaignStats={campaignStats} />}
      {tab === 'ig' && <IgTab ig={ig} igFetchedAt={igFetchedAt} posts={posts} campaignStats={campaignStats} pending={pending} onRefresh={() => startTransition(async () => { await refreshIgData(true); router.refresh(); })} />}
      {tab === 'koneksi' && <ConnectTab igConnected={igConnected} ig={ig} />}
    </div>
  );
}

// ═══════════════ TAB KALENDER ═══════════════

function CalendarTab({ posts, trips, campaignStats }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterTrip, setFilterTrip] = useState('');
  const [pending, startTransition] = useTransition();

  const tripName = (id) => {
    const t = trips.find((x) => x.id === id);
    return t ? `${t.kode_trip || ''} ${t.name || ''}`.trim() : id;
  };

  const filtered = filterTrip ? posts.filter((p) => p.trip_id === filterTrip) : posts;
  const grouped = {};
  for (const p of filtered) {
    const key = p.scheduled_date ? p.scheduled_date.slice(0, 7) : 'Tanpa tanggal';
    (grouped[key] = grouped[key] || []).push(p);
  }
  const monthLabel = (k) => k === 'Tanpa tanggal' ? k :
    new Date(k + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  function onDelete(id) {
    if (!confirm('Hapus rencana konten ini?')) return;
    startTransition(async () => { await deleteContentPost(id); router.refresh(); });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select value={filterTrip} onChange={(e) => setFilterTrip(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
          <option value="">Semua trip</option>
          {trips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip} — {t.name}</option>)}
        </select>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-lg">
          + Rencana Konten
        </button>
      </div>

      {Object.keys(grouped).length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">
          Belum ada rencana konten. Klik <b>+ Rencana Konten</b> untuk mulai.
        </div>
      )}

      {Object.entries(grouped).map(([month, items]) => (
        <div key={month} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">{monthLabel(month)}</div>
          <div className="divide-y divide-slate-100">
            {items.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-start justify-between gap-3 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span>{TYPE_ICON[p.content_type] || '🖼'}</span>
                    <span className="font-bold text-sm text-slate-800">{p.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_UI[p.status]?.cls}`}>{STATUS_UI[p.status]?.label}</span>
                    {p.scheduled_date && <span className="text-[11px] text-slate-500">{new Date(p.scheduled_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex gap-2 flex-wrap">
                    {p.trip_id && <span>✈ {tripName(p.trip_id)}</span>}
                    {p.campaign_name && <span>📢 {p.campaign_name}{campaignStats[p.campaign_name] ? ` · ${fmtNum(campaignStats[p.campaign_name].leads)} leads` : ''}</span>}
                    {p.assignee && <span>👤 {p.assignee}</span>}
                    {p.ig_permalink && <a href={p.ig_permalink} target="_blank" className="text-brand-600 hover:underline">↗ lihat post</a>}
                  </div>
                  {p.caption && <p className="text-xs text-slate-600 mt-1 line-clamp-2 whitespace-pre-line">{p.caption}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => { setEditing(p); setShowForm(true); }} className="text-xs px-2 py-1 rounded hover:bg-slate-200" title="Edit">✏️</button>
                  <button onClick={() => onDelete(p.id)} disabled={pending} className="text-xs px-2 py-1 rounded hover:bg-red-100" title="Hapus">🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showForm && <PostForm post={editing} trips={trips} campaigns={Object.keys(campaignStats)} onClose={() => setShowForm(false)} />}
    </div>
  );
}

// ═══════════════ FORM + AI CAPTION ═══════════════

function PostForm({ post, trips, campaigns, onClose }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [aiPending, startAi] = useTransition();
  const [error, setError] = useState('');
  const [caption, setCaption] = useState(post?.caption || '');
  const [tripId, setTripId] = useState(post?.trip_id || '');
  const [contentType, setContentType] = useState(post?.content_type || 'feed');
  const [aiExtra, setAiExtra] = useState('');
  const [aiResult, setAiResult] = useState(null);

  function submit(e) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.target);
    fd.set('caption', caption);
    startTransition(async () => {
      const res = post ? await updateContentPost(post.id, fd) : await createContentPost(fd);
      if (res?.error) { setError(res.error); return; }
      router.refresh();
      onClose();
    });
  }

  function runAi() {
    setError('');
    const t = trips.find((x) => x.id === tripId);
    startAi(async () => {
      const res = await generateCaption({
        brand: resolveBrandCodeBrowser(),
        tripName: t ? `${t.kode_trip} ${t.name}` : '',
        departure: t?.departure || '',
        contentType,
        extra: aiExtra,
      });
      if (res?.error) { setError(res.error); return; }
      setAiResult(res.result);
      const r = res.result;
      setCaption(`${r.hook}\n\n${r.caption}\n\n${r.hashtags}`);
    });
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-bold text-slate-800">{post ? 'Edit Rencana Konten' : 'Rencana Konten Baru'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block md:col-span-2">
              <span className="text-xs font-bold text-slate-600">Judul konten *</span>
              <input autoComplete="off" name="title" defaultValue={post?.title || ''} required placeholder="cth: Teaser umroh Ramadhan batch 3"
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Trip</span>
              <select name="trip_id" value={tripId} onChange={(e) => setTripId(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="">— Tidak terkait trip —</option>
                {trips.map((t) => <option key={t.id} value={t.id}>{t.kode_trip} — {t.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Campaign (Ads Manager)</span>
              <input autoComplete="off" name="campaign_name" defaultValue={post?.campaign_name || ''} list="campaign-list" placeholder="nama campaign"
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
              <datalist id="campaign-list">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Tipe konten</span>
              <select name="content_type" value={contentType} onChange={(e) => setContentType(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="feed">🖼 Feed</option><option value="reel">🎬 Reel</option>
                <option value="story">⭕ Story</option><option value="carousel">🃏 Carousel</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Tanggal tayang</span>
              <input autoComplete="off" type="date" name="scheduled_date" defaultValue={post?.scheduled_date || ''}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">Status</span>
              <select name="status" defaultValue={post?.status || 'draft'}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
                <option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="posted">Posted</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600">PJ / Assignee</span>
              <input autoComplete="off" name="assignee" defaultValue={post?.assignee || ''} placeholder="nama penanggung jawab"
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-bold text-slate-600">Link post IG (kalau sudah tayang)</span>
              <input autoComplete="off" name="ig_permalink" defaultValue={post?.ig_permalink || ''} placeholder="https://www.instagram.com/p/..."
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
            </label>
          </div>

          {/* AI caption */}
          <div className="border border-purple-200 bg-purple-50/50 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-purple-700">✨ AI Caption Generator</span>
              <button type="button" onClick={runAi} disabled={aiPending}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg">
                {aiPending ? 'Membuat…' : 'Generate dari data trip'}
              </button>
            </div>
            <input autoComplete="off" value={aiExtra} onChange={(e) => setAiExtra(e.target.value)}
              placeholder="catatan gaya/angle (opsional): cth fokus promo early bird"
              className="w-full px-3 py-2 border border-purple-200 rounded-lg text-xs bg-white" />
            {aiResult?.ide_visual && (
              <div className="text-[11px] text-purple-700">
                <b>Ide visual:</b> {aiResult.ide_visual.join(' · ')}
              </div>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">Caption</span>
            <textarea autoComplete="off" value={caption} onChange={(e) => setCaption(e.target.value)} rows={7}
              placeholder="Caption Instagram…" className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </label>
          {/* Performa manual (diisi dari IG Insights) */}
          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <span className="text-xs font-bold text-slate-600">📊 Performa (isi manual dari Instagram Insights)</span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <label className="block"><span className="text-[11px] text-slate-500">❤️ Likes</span>
                <input autoComplete="off" name="ig_likes" type="number" min="0" defaultValue={post?.ig_likes ?? ''} className="w-full mt-0.5 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" /></label>
              <label className="block"><span className="text-[11px] text-slate-500">💬 Komentar</span>
                <input autoComplete="off" name="ig_comments" type="number" min="0" defaultValue={post?.ig_comments ?? ''} className="w-full mt-0.5 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" /></label>
              <label className="block"><span className="text-[11px] text-slate-500">👁 Reach</span>
                <input autoComplete="off" name="ig_reach" type="number" min="0" defaultValue={post?.ig_reach ?? ''} className="w-full mt-0.5 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" /></label>
              <label className="block"><span className="text-[11px] text-slate-500">🔖 Saves</span>
                <input autoComplete="off" name="ig_saved" type="number" min="0" defaultValue={post?.ig_saved ?? ''} className="w-full mt-0.5 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" /></label>
            </div>
            <label className="block"><span className="text-[11px] text-slate-500">Tanggal tayang aktual</span>
              <input autoComplete="off" name="posted_date" type="date" defaultValue={post?.posted_date || ''} className="w-full mt-0.5 px-2 py-1.5 border border-slate-300 rounded-lg text-sm" /></label>
          </div>

          <label className="block">
            <span className="text-xs font-bold text-slate-600">Catatan internal</span>
            <input autoComplete="off" name="notes" defaultValue={post?.notes || ''} className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          </label>

          {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {error}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" disabled={pending}
              className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
              {pending ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════ TAB PERFORMA IG ═══════════════

function IgTab({ ig, igFetchedAt, posts, campaignStats, onRefresh, pending }) {
  const router = useRouter();
  const [linkTarget, setLinkTarget] = useState(null); // media yg mau ditautkan
  const [, startTransition] = useTransition();

  if (!ig) {
    return <ManualPerformance posts={posts} campaignStats={campaignStats} />;
  }

  const media = ig.media || [];
  const totalEngagement = media.reduce((s, m) => s + (m.like_count || 0) + (m.comments_count || 0), 0);
  const plannedByMediaId = Object.fromEntries(posts.filter((p) => p.ig_media_id).map((p) => [p.ig_media_id, p]));

  function doLink(mediaItem, postId) {
    startTransition(async () => {
      await linkIgMedia(postId, mediaItem.id, mediaItem.permalink);
      setLinkTarget(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Profil & ringkasan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Followers', fmtNum(ig.profile?.followers)],
          ['Reach 28 hari', fmtNum(ig.reach30)],
          ['Total post', fmtNum(ig.profile?.media_count)],
          ['Engagement 24 post terakhir', fmtNum(totalEngagement)],
        ].map(([label, val]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] text-slate-500 font-bold uppercase">{label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{val}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          @{ig.profile?.username} · diperbarui {igFetchedAt ? new Date(igFetchedAt).toLocaleString('id-ID') : '—'}
        </p>
        <button onClick={onRefresh} disabled={pending}
          className="px-3 py-1.5 text-xs font-bold border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50">
          {pending ? 'Memuat…' : '🔄 Refresh data'}
        </button>
      </div>

      <TopIgMediaPerforma media={media} />

      {/* Grid media */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {media.map((m) => {
          const linked = plannedByMediaId[m.id];
          return (
            <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">{new Date(m.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })} · {m.media_type?.toLowerCase()}</span>
                <a href={m.permalink} target="_blank" className="text-[11px] text-brand-600 hover:underline">buka ↗</a>
              </div>
              <p className="text-xs text-slate-700 line-clamp-2">{m.caption || '(tanpa caption)'}</p>
              <div className="flex gap-3 text-[11px] text-slate-600 font-bold flex-wrap">
                <span>❤️ {fmtNum(m.like_count)}</span>
                <span>💬 {fmtNum(m.comments_count)}</span>
                {m.reach != null && <span>👁 {fmtNum(m.reach)}</span>}
                {m.saved != null && <span>🔖 {fmtNum(m.saved)}</span>}
                {m.plays != null && <span>▶️ {fmtNum(m.plays)}</span>}
              </div>
              {linked ? (
                <div className="text-[11px] bg-green-50 border border-green-200 text-green-700 rounded-lg px-2 py-1">
                  ✓ {linked.title}{linked.campaign_name ? ` · 📢 ${linked.campaign_name}` : ''}{linked.trip_id ? ' · ✈ trip' : ''}
                </div>
              ) : (
                <button onClick={() => setLinkTarget(m)}
                  className="text-[11px] text-slate-500 hover:text-brand-600 underline">+ tautkan ke rencana konten</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Performa campaign gabungan */}
      {Object.keys(campaignStats).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">📢 Campaign × Konten</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs whitespace-nowrap">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2">Campaign</th><th className="px-2 py-2">Spend</th><th className="px-2 py-2">Leads</th><th className="px-2 py-2">Konten tertaut</th><th className="px-2 py-2">Engagement IG</th>
            </tr></thead>
            <tbody>
              {Object.entries(campaignStats).map(([name, st]) => {
                const linkedPosts = posts.filter((p) => p.campaign_name === name);
                const eng = linkedPosts.reduce((s, p) => {
                  const m = media.find((x) => x.id === p.ig_media_id);
                  return s + (m ? (m.like_count || 0) + (m.comments_count || 0) : 0);
                }, 0);
                return (
                  <tr key={name} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-bold text-slate-700">{name}</td>
                    <td className="px-2 py-2">{fmtRp(st.spend)}</td>
                    <td className="px-2 py-2">{fmtNum(st.leads)}</td>
                    <td className="px-2 py-2">{linkedPosts.length} konten</td>
                    <td className="px-2 py-2">{fmtNum(eng)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Modal tautkan media → rencana konten */}
      {linkTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setLinkTarget(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 text-sm">Tautkan post IG ke rencana konten</h3>
            <p className="text-xs text-slate-500 line-clamp-2">{linkTarget.caption || linkTarget.permalink}</p>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
              {posts.filter((p) => !p.ig_media_id).map((p) => (
                <button key={p.id} onClick={() => doLink(linkTarget, p.id)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-brand-50">
                  <b>{p.title}</b>{p.campaign_name ? ` · 📢 ${p.campaign_name}` : ''}
                </button>
              ))}
              {posts.filter((p) => !p.ig_media_id).length === 0 && (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">Semua rencana konten sudah tertaut / belum ada rencana.</p>
              )}
            </div>
            <button onClick={() => setLinkTarget(null)} className="w-full py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Batal</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════ TAB KONEKSI ═══════════════

function ConnectTab({ igConnected, ig }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  function submit(e) {
    e.preventDefault();
    setError(''); setOk('');
    const fd = new FormData(e.target);
    startTransition(async () => {
      const res = await saveIgConnection(fd);
      if (res?.error) { setError(res.error); return; }
      setOk(`Terhubung sebagai @${res.username} ✓`);
      router.refresh();
    });
  }

  function doDisconnect() {
    if (!confirm('Putuskan koneksi Instagram?')) return;
    startTransition(async () => { await disconnectIg(); router.refresh(); });
  }

  return (
    <div className="max-w-2xl space-y-4">
      {igConnected && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-green-800 font-bold">✓ Terhubung sebagai @{ig?.profile?.username}</p>
          <button onClick={doDisconnect} disabled={pending} className="text-xs text-red-600 hover:underline">Putuskan</button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-bold text-slate-800 text-sm">⚙️ Hubungkan Instagram Business</h3>
          <p className="text-xs text-slate-500 mt-1">Sekali setup, data performa otomatis tersedia untuk semua tim.</p>
        </div>

        <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside bg-slate-50 rounded-lg p-3">
          <li>Pastikan akun IG sudah <b>Business/Creator</b> dan tertaut ke <b>Facebook Page</b> (Settings IG → Account → Switch to professional account).</li>
          <li>Buka <a href="https://developers.facebook.com/apps/" target="_blank" className="text-brand-600 underline">developers.facebook.com/apps</a> → <b>Create App</b> → tipe <b>Business</b>.</li>
          <li>Di app → <b>Tools → Graph API Explorer</b>: pilih app kamu, klik <b>Generate Access Token</b>, centang permission: <code className="bg-white px-1 rounded">instagram_basic</code>, <code className="bg-white px-1 rounded">instagram_manage_insights</code>, <code className="bg-white px-1 rounded">pages_show_list</code>, <code className="bg-white px-1 rounded">pages_read_engagement</code> → login & pilih Page kamu.</li>
          <li>Salin token yang muncul, tempel di bawah. (Token akan diverifikasi & disimpan aman di server.)</li>
        </ol>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold text-slate-600">Access Token</span>
            <textarea autoComplete="off" name="token" rows={3} required placeholder="EAAB... (tempel token dari Graph API Explorer)"
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono" />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600">IG User ID (opsional — otomatis dideteksi)</span>
            <input autoComplete="off" name="ig_user_id" placeholder="kosongkan saja kalau tidak tahu"
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono" />
          </label>

          {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {error}</div>}
          {ok && <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">{ok}</div>}

          <button type="submit" disabled={pending}
            className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-lg">
            {pending ? 'Memverifikasi…' : '🔗 Hubungkan'}
          </button>
        </form>

        <p className="text-[11px] text-slate-400">
          💡 Token dari Graph API Explorer berumur pendek (±1-2 jam). Untuk token panjang (60 hari), buka <b>Tools → Access Token Debugger</b> → klik <b>Extend Access Token</b>, lalu tempel token hasil extend di sini. Hanya owner/manager yang bisa mengubah koneksi.
        </p>
      </div>
    </div>
  );
}


// ═══════════════ TOP PERFORMA (IG tersambung — dari media asli) ═══════════════
function TopIgMediaPerforma({ media }) {
  const [period, setPeriod] = useState('week');
  const days = period === 'week' ? 7 : period === 'month' ? 30 : null;
  const cutoff = days ? Date.now() - days * 86400000 : null;
  const eng = (m) => (m.like_count || 0) + (m.comments_count || 0) + (m.saved || 0);
  const ranked = (media || [])
    .filter((m) => { if (!cutoff) return true; if (!m.timestamp) return false; return new Date(m.timestamp).getTime() >= cutoff; })
    .sort((a, b) => eng(b) - eng(a) || (b.reach || 0) - (a.reach || 0))
    .slice(0, 8);
  const periods = [['week', '7 Hari'], ['month', '30 Hari'], ['all', 'Semua']];
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-gradient-to-r from-amber-50 to-pink-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold text-slate-700 uppercase">🏆 Top Performa Konten</span>
        <div className="flex gap-1">
          {periods.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`px-2.5 py-1 rounded text-[11px] font-bold ${period === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
          ))}
        </div>
      </div>
      {ranked.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">Belum ada post IG di periode ini.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs whitespace-nowrap">
          <thead><tr className="text-left text-slate-500 border-b border-slate-100">
            <th className="px-4 py-2">#</th><th className="px-2 py-2">Konten</th><th className="px-2 py-2">Tgl</th>
            <th className="px-2 py-2 text-right">Interaksi</th><th className="px-2 py-2 text-right">👁 Reach</th><th className="px-2 py-2"></th>
          </tr></thead>
          <tbody>
            {ranked.map((m, i) => (
              <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2 font-bold text-amber-600">{i + 1}</td>
                <td className="px-2 py-2 text-slate-700 max-w-[260px] truncate">{m.caption || `(${(m.media_type || 'post').toLowerCase()})`}</td>
                <td className="px-2 py-2 text-slate-400">{m.timestamp ? new Date(m.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—'}</td>
                <td className="px-2 py-2 text-right font-bold text-pink-600">{fmtNum(eng(m))}</td>
                <td className="px-2 py-2 text-right">{m.reach != null ? fmtNum(m.reach) : '—'}</td>
                <td className="px-2 py-2">{m.permalink && <a href={m.permalink} target="_blank" className="text-brand-600 hover:underline">↗</a>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <p className="px-4 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">Interaksi = likes + komentar + saves. Diambil dari post IG terbaru.</p>
    </div>
  );
}

// ═══════════════ TOP PERFORMA KONTEN (mingguan / bulanan) ═══════════════
function TopContentPerforma({ posts }) {
  const [period, setPeriod] = useState('week');
  const days = period === 'week' ? 7 : period === 'month' ? 30 : null;
  const cutoff = days ? Date.now() - days * 86400000 : null;
  const eng = (p) => (p.ig_likes || 0) + (p.ig_comments || 0) + (p.ig_saved || 0);
  const dOf = (p) => p.posted_date || p.scheduled_date || null;
  const ranked = (posts || [])
    .filter((p) => eng(p) > 0 || (p.ig_reach || 0) > 0)
    .filter((p) => {
      if (!cutoff) return true;
      const d = dOf(p);
      if (!d) return false;
      return new Date(d + 'T00:00:00').getTime() >= cutoff;
    })
    .sort((a, b) => eng(b) - eng(a) || (b.ig_reach || 0) - (a.ig_reach || 0))
    .slice(0, 8);
  const periods = [['week', '7 Hari'], ['month', '30 Hari'], ['all', 'Semua']];
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-gradient-to-r from-amber-50 to-pink-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold text-slate-700 uppercase">🏆 Top Performa Konten</span>
        <div className="flex gap-1">
          {periods.map(([k, l]) => (
            <button key={k} onClick={() => setPeriod(k)} className={`px-2.5 py-1 rounded text-[11px] font-bold ${period === k ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
          ))}
        </div>
      </div>
      {ranked.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-slate-400">Belum ada konten dengan angka performa di periode ini. Isi performa di tab 📅 Kalender (tombol ✏️ Edit).</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs whitespace-nowrap">
          <thead><tr className="text-left text-slate-500 border-b border-slate-100">
            <th className="px-4 py-2">#</th><th className="px-2 py-2">Konten</th><th className="px-2 py-2">Tgl</th>
            <th className="px-2 py-2 text-right">Interaksi</th><th className="px-2 py-2 text-right">👁 Reach</th><th className="px-2 py-2"></th>
          </tr></thead>
          <tbody>
            {ranked.map((p, i) => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2 font-bold text-amber-600">{i + 1}</td>
                <td className="px-2 py-2 font-bold text-slate-700 max-w-[220px] truncate">{p.title || '—'}</td>
                <td className="px-2 py-2 text-slate-400">{dOf(p) ? new Date(dOf(p) + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '—'}</td>
                <td className="px-2 py-2 text-right font-bold text-pink-600">{fmtNum(eng(p))}</td>
                <td className="px-2 py-2 text-right">{fmtNum(p.ig_reach)}</td>
                <td className="px-2 py-2">{p.ig_permalink && <a href={p.ig_permalink} target="_blank" className="text-brand-600 hover:underline">↗</a>}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <p className="px-4 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">Interaksi = likes + komentar + saves. Periode dihitung dari tanggal posting (atau jadwal).</p>
    </div>
  );
}

// ═══════════════ PERFORMA MANUAL (saat IG belum terhubung) ═══════════════

function ManualPerformance({ posts, campaignStats }) {
  const withMetrics = posts.filter((p) => p.ig_likes != null || p.ig_comments != null || p.ig_reach != null || p.ig_saved != null);
  const totals = withMetrics.reduce((a, p) => ({
    likes: a.likes + (p.ig_likes || 0),
    comments: a.comments + (p.ig_comments || 0),
    reach: a.reach + (p.ig_reach || 0),
    saved: a.saved + (p.ig_saved || 0),
  }), { likes: 0, comments: 0, reach: 0, saved: 0 });

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        📊 <b>Mode manual.</b> Instagram API belum terhubung — angka di sini diisi tangan dari Instagram Insights lewat tombol ✏️ Edit di tiap konten (kolom Performa). Begitu koneksi IG resmi aktif di tab ⚙️ Koneksi, data akan otomatis.
      </div>

      <TopContentPerforma posts={posts} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['❤️ Total Likes', totals.likes], ['💬 Total Komentar', totals.comments], ['👁 Total Reach', totals.reach], ['🔖 Total Saves', totals.saved]].map(([label, val]) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-[11px] text-slate-500 font-bold uppercase">{label}</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{fmtNum(val)}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">Performa per Konten</div>
        {withMetrics.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-slate-400">Belum ada konten dengan angka performa. Edit konten di tab 📅 Kalender, isi bagian 📊 Performa.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs whitespace-nowrap">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2">Konten</th><th className="px-2 py-2">Campaign</th>
              <th className="px-2 py-2">❤️</th><th className="px-2 py-2">💬</th><th className="px-2 py-2">👁</th><th className="px-2 py-2">🔖</th>
            </tr></thead>
            <tbody>
              {withMetrics.map((p) => (
                <tr key={p.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-bold text-slate-700">{p.title}</td>
                  <td className="px-2 py-2 text-slate-500">{p.campaign_name || '—'}</td>
                  <td className="px-2 py-2">{fmtNum(p.ig_likes)}</td>
                  <td className="px-2 py-2">{fmtNum(p.ig_comments)}</td>
                  <td className="px-2 py-2">{fmtNum(p.ig_reach)}</td>
                  <td className="px-2 py-2">{fmtNum(p.ig_saved)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Campaign × Konten (manual) */}
      {Object.keys(campaignStats).length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase">📢 Campaign × Konten</div>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-xs whitespace-nowrap">
            <thead><tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="px-4 py-2">Campaign</th><th className="px-2 py-2">Spend</th><th className="px-2 py-2">Leads</th><th className="px-2 py-2">Konten</th><th className="px-2 py-2">Engagement</th>
            </tr></thead>
            <tbody>
              {Object.entries(campaignStats).map(([name, st]) => {
                const linked = posts.filter((p) => p.campaign_name === name);
                const eng = linked.reduce((a, p) => a + (p.ig_likes || 0) + (p.ig_comments || 0), 0);
                return (
                  <tr key={name} className="border-b border-slate-50">
                    <td className="px-4 py-2 font-bold text-slate-700">{name}</td>
                    <td className="px-2 py-2">{fmtRp(st.spend)}</td>
                    <td className="px-2 py-2">{fmtNum(st.leads)}</td>
                    <td className="px-2 py-2">{linked.length}</td>
                    <td className="px-2 py-2">{fmtNum(eng)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
