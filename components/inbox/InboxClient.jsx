'use client';

// Inbox WhatsApp (Khasanah). Daftar percakapan + thread + panel CRM. Polling (5-10s).
import { useState, useEffect, useRef, useTransition } from 'react';
import {
  getInboxData, getConversationThread, sendInboxReply, sendInboxTemplate,
  markInboxRead, setInboxStatus, assignInbox, addInboxNote,
  createInboxTag, addTagToConv, removeTagFromConv, setPipelineStage,
} from '@/lib/actions/wa-inbox';

const PIPELINE_STAGES = ['Lead', 'Follow-up', 'Nego', 'Closing', 'DP', 'Lunas', 'Selesai'];

function fmtTime(iso) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}
const STATUS = [['open', 'Open'], ['pending', 'Pending'], ['resolved', 'Selesai']];
const EMOJIS = ['😀','😁','😂','🤣','😊','😍','🥰','😘','👍','🙏','❤️','🔥','✅','🎉','😢','😭','😅','🤝','👌','💯','🙌','😎','🤔','🙈'];
function MsgMedia({ m }) {
  if (!m.media_url) return null;
  const t = m.type || '';
  const isImg = t === 'image' || t === 'sticker';
  const isVid = t === 'video';
  const isAud = t === 'audio' || t === 'voice' || t === 'ptt';
  return (
    <div className="mt-1">
      {isImg && <a href={m.media_url} target="_blank" rel="noreferrer"><img src={m.media_url} alt="media" className="rounded-lg max-w-full max-h-64 object-contain" /></a>}
      {isVid && <video src={m.media_url} controls className="rounded-lg max-w-full max-h-64" />}
      {isAud && <audio src={m.media_url} controls className="max-w-full" />}
      {!isImg && !isVid && !isAud && <a href={m.media_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">📎 Buka dokumen</a>}
      <div><a href={m.media_url} target="_blank" rel="noreferrer" download className="text-[10px] text-slate-500 underline">Unduh</a></div>
    </div>
  );
}

export default function InboxClient({ initial }) {
  const [numbers] = useState(initial?.numbers || []);
  const [agents] = useState(initial?.agents || []);
  const [role] = useState(initial?.role || '');
  const [numberId, setNumberId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [convs, setConvs] = useState(initial?.conversations || []);
  const [selId, setSelId] = useState(null);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState('');
  const [tplName, setTplName] = useState('');
  const [tplParams, setTplParams] = useState('');
  const [note, setNote] = useState('');
  const [newTag, setNewTag] = useState('');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const threadEndRef = useRef(null);

  async function loadConvs() {
    const r = await getInboxData({ numberId, status: statusFilter });
    if (r?.ok) setConvs(r.conversations || []);
  }
  async function loadThread(id) {
    if (!id) return;
    const r = await getConversationThread(id);
    if (r?.ok) { setThread(r); }
    else setErr(r?.error || '');
  }

  // filter change -> reload list
  useEffect(() => { loadConvs(); /* eslint-disable-next-line */ }, [numberId, statusFilter]);
  // polling
  useEffect(() => {
    const t1 = setInterval(loadConvs, 10000);
    const t2 = setInterval(() => { if (selId) loadThread(selId); }, 5000);
    return () => { clearInterval(t1); clearInterval(t2); };
    /* eslint-disable-next-line */
  }, [selId, numberId, statusFilter]);
  useEffect(() => { if (threadEndRef.current) threadEndRef.current.scrollIntoView(); }, [thread?.messages?.length]);

  function openConv(c) {
    setSelId(c.id); setErr(''); setThread(null);
    loadThread(c.id);
    if (c.unread_count > 0) { markInboxRead(c.id); setConvs((p) => p.map((x) => x.id === c.id ? { ...x, unread_count: 0 } : x)); }
  }

  function doSend() {
    if (!text.trim() || !selId) return;
    startTransition(async () => {
      const r = await sendInboxReply(selId, text);
      if (r?.error) { setErr(r.error); return; }
      setText(''); setErr(''); await loadThread(selId); await loadConvs();
    });
  }
  function doTemplate() {
    if (!tplName.trim() || !selId) return;
    const params = tplParams.split('|').map((x) => x.trim()).filter(Boolean);
    startTransition(async () => {
      const r = await sendInboxTemplate(selId, tplName.trim(), params);
      if (r?.error) { setErr(r.error); return; }
      setTplName(''); setTplParams(''); setErr(''); await loadThread(selId); await loadConvs();
    });
  }
  function doStatus(s) { startTransition(async () => { await setInboxStatus(selId, s); await loadThread(selId); await loadConvs(); }); }
  function doAssign(eid) { startTransition(async () => { await assignInbox(selId, eid ? Number(eid) : null); await loadThread(selId); }); }
  function doNote() { if (!note.trim()) return; startTransition(async () => { await addInboxNote(selId, note); setNote(''); await loadThread(selId); }); }
  function doAddTag(tagId) { if (!tagId) return; startTransition(async () => { await addTagToConv(selId, Number(tagId)); await loadThread(selId); }); }
  function doRemoveTag(tagId) { startTransition(async () => { await removeTagFromConv(selId, tagId); await loadThread(selId); }); }
  function doCreateTag() { if (!newTag.trim()) return; startTransition(async () => { const r = await createInboxTag(newTag.trim()); if (r?.ok && r.tag) await addTagToConv(selId, r.tag.id); setNewTag(''); await loadThread(selId); }); }
  function doStage(stg) { startTransition(async () => { await setPipelineStage(selId, stg); await loadThread(selId); }); }

  const conv = thread?.conversation;
  const within24 = thread?.within24;

  return (
    <div className="flex h-[calc(100vh-140px)] gap-0 border border-slate-200 rounded-xl overflow-hidden bg-white">
      {/* LEFT: daftar percakapan */}
      <div className="w-72 shrink-0 border-r border-slate-200 flex flex-col">
        <div className="p-2 border-b border-slate-200 space-y-2">
          <p className="font-bold text-brand-700 text-sm px-1">💬 Inbox WhatsApp</p>
          {numbers.length > 1 && (
            <select value={numberId} onChange={(e) => setNumberId(e.target.value)} className="w-full text-xs px-2 py-1 border border-slate-300 rounded">
              <option value="">Semua nomor</option>
              {numbers.map((n) => <option key={n.id} value={n.id}>{n.pic_name || n.display_phone || n.phone_number_id}</option>)}
            </select>
          )}
          <div className="flex gap-1 text-[11px]">
            <button onClick={() => setStatusFilter('')} className={`px-2 py-0.5 rounded ${statusFilter === '' ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>Semua</button>
            {STATUS.map(([v, l]) => <button key={v} onClick={() => setStatusFilter(v)} className={`px-2 py-0.5 rounded ${statusFilter === v ? 'bg-brand-500 text-white' : 'bg-slate-100'}`}>{l}</button>)}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {convs.length === 0 && <p className="p-4 text-center text-xs text-slate-400">Belum ada percakapan.</p>}
          {convs.map((c) => (
            <button key={c.id} onClick={() => openConv(c)} className={`w-full text-left px-3 py-2 hover:bg-slate-50 ${selId === c.id ? 'bg-brand-50' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-slate-800 truncate">{c.customer_name || c.customer_phone}</span>
                <div className="flex items-center gap-1 shrink-0">
                  {!c.within24 && <span title="Window 24 jam tutup — hanya bisa kirim template" className="text-[9px] bg-amber-100 text-amber-700 rounded px-1 py-0.5 font-bold">⏰ tutup</span>}
                  {c.unread_count > 0 && <span className="text-[10px] bg-green-500 text-white rounded-full px-1.5 py-0.5 font-bold">{c.unread_count}</span>}
                </div>
              </div>
              {c.customer_name && <p className="text-[10px] text-slate-400 truncate">{c.customer_phone}</p>}
              <p className="text-[11px] text-slate-500 truncate">{c.last_message_preview || '—'}</p>
              <p className="text-[10px] text-slate-400">{fmtTime(c.last_message_at)}{c.status && c.status !== 'open' ? ` · ${c.status}` : ''}</p>
            </button>
          ))}
        </div>
      </div>

      {/* CENTER: thread */}
      <div className="flex-1 flex flex-col min-w-0">
        {!conv ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Pilih percakapan</div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="font-bold text-slate-800 truncate">{conv.customer_name || conv.customer_phone}</p>
                <p className="text-[11px] text-slate-500">{conv.customer_phone}</p>
              </div>
              <div className="flex gap-1 text-[11px]">
                {STATUS.map(([v, l]) => <button key={v} onClick={() => doStatus(v)} className={`px-2 py-0.5 rounded font-semibold ${conv.status === v ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>)}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
              {(thread?.messages || []).map((m) => (
                <div key={m.id} className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.direction === 'out' ? 'ml-auto bg-green-100' : 'bg-white border border-slate-200'}`}>
                  {m.template_name && <p className="text-[10px] font-bold text-slate-400 mb-0.5">📋 {m.template_name}</p>}
                  <MsgMedia m={m} />
                  {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  {!m.body && !m.media_url && m.template_name && <p className="italic text-slate-400">(template terkirim)</p>}
                  <p className="text-[10px] text-slate-400 mt-0.5 text-right">{fmtTime(m.created_at)}{m.direction === 'out' && m.status ? ` · ${m.status}` : ''}</p>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>
            {err && <div className="px-4 py-1 text-xs text-red-600 bg-red-50">{err}</div>}
            <div className="p-2 border-t border-slate-200">
              {within24 ? (
                <div className="space-y-1">
                  {showEmoji && (
                    <div className="flex flex-wrap gap-1 p-1 bg-slate-50 rounded border border-slate-200">
                      {EMOJIS.map((e) => <button key={e} type="button" onClick={() => setText((t) => t + e)} className="text-lg leading-none hover:bg-slate-200 rounded px-0.5">{e}</button>)}
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <button type="button" onClick={() => setShowEmoji((v) => !v)} title="Emoji" className="text-xl leading-none px-1">😊</button>
                    <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doSend(); }}
                      placeholder="Ketik balasan…" className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg" />
                    <button onClick={doSend} disabled={pending} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg disabled:opacity-50">Kirim</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-amber-700">⏰ Di luar 24 jam — balas via template Meta.</p>
                  <div className="flex gap-2">
                    <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="nama_template" className="w-40 px-2 py-1.5 text-xs border border-slate-300 rounded" />
                    <input value={tplParams} onChange={(e) => setTplParams(e.target.value)} placeholder="var1 | var2 | var3" className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded" />
                    <button onClick={doTemplate} disabled={pending} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded disabled:opacity-50">Kirim Template</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* RIGHT: CRM panel */}
      {conv && (
        <div className="w-64 shrink-0 border-l border-slate-200 p-3 overflow-y-auto space-y-4 text-sm">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase">Kontak</p>
            <p className="font-semibold text-slate-800">{conv.customer_name || '—'}</p>
            <p className="text-xs text-slate-500">{conv.customer_phone}</p>
          </div>
          {/* Info pelanggan (CRM) */}
          {thread?.customer && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2">
              <p className="text-[11px] font-bold text-emerald-700 uppercase">Pelanggan CRM</p>
              <p className="font-semibold text-slate-800 text-sm">{thread.customer.name}</p>
              {thread.customer.email && <p className="text-[11px] text-slate-500">{thread.customer.email}</p>}
              {(thread.trips || []).length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {thread.trips.map((t) => <p key={t.id} className="text-[11px] text-slate-600">🎫 {t.kode_trip} — {t.name}</p>)}
                </div>
              )}
            </div>
          )}
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Ditugaskan ke</p>
            <select value={conv.assigned_to || ''} onChange={(e) => doAssign(e.target.value)} className="w-full text-xs px-2 py-1 border border-slate-300 rounded">
              <option value="">— Belum ditugaskan —</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Pipeline stage</p>
            <select value={conv.pipeline_stage || ''} onChange={(e) => doStage(e.target.value)} className="w-full text-xs px-2 py-1 border border-slate-300 rounded">
              <option value="">— Belum ada —</option>
              {PIPELINE_STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Tags</p>
            <div className="flex flex-wrap gap-1 mb-1">
              {(thread?.tags || []).map((t) => (
                <span key={t.id} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold flex items-center gap-1">
                  {t.name}<button onClick={() => doRemoveTag(t.id)} className="text-indigo-400 hover:text-indigo-700">×</button>
                </span>
              ))}
              {(thread?.tags || []).length === 0 && <span className="text-[10px] text-slate-400">Belum ada tag</span>}
            </div>
            <select value="" onChange={(e) => doAddTag(e.target.value)} className="w-full text-[11px] px-2 py-1 border border-slate-300 rounded mb-1">
              <option value="">+ Tempel tag…</option>
              {(thread?.allTags || []).filter((t) => !(thread?.tags || []).some((x) => x.id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div className="flex gap-1">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Tag baru…" className="flex-1 text-[11px] px-2 py-1 border border-slate-300 rounded" />
              <button onClick={doCreateTag} disabled={pending} className="px-2 py-1 bg-indigo-500 text-white text-[11px] rounded disabled:opacity-50">+</button>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Catatan internal</p>
            <div className="flex gap-1 mb-2">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tulis catatan…" className="flex-1 text-xs px-2 py-1 border border-slate-300 rounded" />
              <button onClick={doNote} disabled={pending} className="px-2 py-1 bg-slate-700 text-white text-xs rounded disabled:opacity-50">+</button>
            </div>
            <div className="space-y-1">
              {(thread?.notes || []).map((n) => (
                <div key={n.id} className="text-[11px] bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  <p className="text-slate-700">{n.body}</p>
                  <p className="text-slate-400">{n.created_by_name || ''} · {fmtTime(n.created_at)}</p>
                </div>
              ))}
            </div>
          </div>
          {(thread?.history || []).length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Riwayat penugasan</p>
              <div className="space-y-0.5">
                {(thread.history || []).map((h) => (
                  <p key={h.id} className="text-[10px] text-slate-500">→ {h.to_name || 'dilepas'} · {fmtTime(h.created_at)}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
