'use client';

// Round 183: ChatBox + Supabase Realtime — chat masuk tanpa refresh
// Path: components/chat/ChatBox.jsx

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { sendPublicMessage, sendPersonalMessage } from '@/lib/actions/team-collab';
import { ROLE_BADGE_COLOR, ROLE_LABELS } from '@/lib/utils/roles';
import { createClient } from '@/lib/supabase/client';

export default function ChatBox({
  currentUserId,
  currentUserName,
  currentUserRole,
  members = [],
  publicMessages: initialPublic = [],
  dmWith,
  personalMessages: initialPersonal = []
}) {
  const isTL = currentUserRole === 'tour_leader';
  const [tab, setTab] = useState(isTL ? 'personal' : (dmWith ? 'personal' : 'public'));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const publicEndRef = useRef(null);
  const personalEndRef = useRef(null);

  // R183: local state untuk realtime updates
  const [publicMessages, setPublicMessages] = useState(initialPublic);
  const [personalMessages, setPersonalMessages] = useState(initialPersonal);
  const [liveDot, setLiveDot] = useState(false); // pulse indicator saat ada message baru

  // Sync ke initial saat prop berubah (mis. ganti DM target / navigate)
  useEffect(() => { setPublicMessages(initialPublic); }, [initialPublic]);
  useEffect(() => { setPersonalMessages(initialPersonal); }, [initialPersonal, dmWith]);

  // R183: Supabase Realtime subscription
  useEffect(() => {
    if (!currentUserId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`team_chats_${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_chats' },
        (payload) => {
          const msg = payload.new;
          if (!msg) return;

          // PUBLIC message → tambah ke publicMessages kalau bukan TL
          if (msg.type === 'public') {
            if (!isTL) {
              setPublicMessages((prev) => {
                // De-dupe by id
                if (prev.some((p) => p.id === msg.id)) return prev;
                return [...prev, msg];
              });
              if (msg.sender_id !== currentUserId) {
                setLiveDot(true);
                setTimeout(() => setLiveDot(false), 2000);
              }
            }
            return;
          }

          // PERSONAL message — relevan kalau (sender == me && recipient == dmWith) ATAU (sender == dmWith && recipient == me)
          if (msg.type === 'personal') {
            const isRelevant = dmWith && (
              (msg.sender_id === currentUserId && msg.recipient_id === dmWith) ||
              (msg.sender_id === dmWith && msg.recipient_id === currentUserId)
            );
            if (isRelevant) {
              setPersonalMessages((prev) => {
                if (prev.some((p) => p.id === msg.id)) return prev;
                return [...prev, msg];
              });
              if (msg.sender_id !== currentUserId) {
                setLiveDot(true);
                setTimeout(() => setLiveDot(false), 2000);
              }
            }
            // Kalau bukan untuk current chat tapi DM ke saya dari user lain → router refresh untuk update sidebar count
            else if (msg.recipient_id === currentUserId) {
              router.refresh();
            }
          }
        }
      )
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [currentUserId, dmWith, isTL, router]);

  useEffect(() => {
    if (tab === 'public') publicEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (tab === 'personal') personalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tab, publicMessages.length, personalMessages.length]);

  const otherMembers = members.filter((m) => m.user_id !== currentUserId);
  const dmRecipient = dmWith ? members.find((m) => m.user_id === dmWith) : null;

  async function handleSendPublic(formData) {
    if (isTL) {
      alert('TL tidak boleh kirim chat umum. Pakai DM personal.');
      return;
    }
    const content = formData.get('content')?.toString().trim();
    if (!content) return;

    // R183: Optimistic update — tampilkan langsung
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      type: 'public',
      sender_id: currentUserId,
      sender_name: currentUserName,
      sender_role: currentUserRole,
      content,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setPublicMessages((prev) => [...prev, optimisticMsg]);
    document.getElementById('public-msg-input').value = '';

    startTransition(async () => {
      const r = await sendPublicMessage(formData);
      if (r?.error) {
        // Rollback
        setPublicMessages((prev) => prev.filter((m) => m.id !== tempId));
        alert(r.error);
        return;
      }
      // Replace temp dengan real (akan datang via realtime atau router refresh)
      // Hapus optimistic — biar realtime yg push (dedupe by id)
      setPublicMessages((prev) => prev.filter((m) => m.id !== tempId));
    });
  }

  async function handleSendPersonal(formData) {
    if (!dmWith) { alert('Pilih penerima dulu'); return; }
    const content = formData.get('content')?.toString().trim();
    if (!content) return;

    const tempId = `temp_${Date.now()}`;
    const optimisticMsg = {
      id: tempId,
      type: 'personal',
      sender_id: currentUserId,
      sender_name: currentUserName,
      sender_role: currentUserRole,
      recipient_id: dmWith,
      content,
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setPersonalMessages((prev) => [...prev, optimisticMsg]);
    document.getElementById('personal-msg-input').value = '';

    startTransition(async () => {
      const r = await sendPersonalMessage(dmWith, formData);
      if (r?.error) {
        setPersonalMessages((prev) => prev.filter((m) => m.id !== tempId));
        alert(r.error);
        return;
      }
      setPersonalMessages((prev) => prev.filter((m) => m.id !== tempId));
    });
  }

  function handleStartDm(userId) {
    router.push(`/chat?dm=${userId}`);
    setTab('personal');
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-slate-50">
        {!isTL && (
          <button
            onClick={() => setTab('public')}
            className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-1 ${
              tab === 'public' ? 'border-brand-500 text-brand-700 bg-white' : 'border-transparent text-slate-500 hover:text-brand-600'
            }`}
          >
            📢 Chat Umum ({publicMessages.length})
            {liveDot && tab !== 'public' && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
          </button>
        )}
        <button
          onClick={() => setTab('personal')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-1 ${
            tab === 'personal' ? 'border-brand-500 text-brand-700 bg-white' : 'border-transparent text-slate-500 hover:text-brand-600'
          }`}
        >
          💬 DM Personal
          {liveDot && tab !== 'personal' && <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
        </button>

        {/* R183: live indicator */}
        <div className="ml-auto px-3 flex items-center text-[10px] text-green-600">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1" />
          Live
        </div>
      </div>

      {/* PUBLIC TAB */}
      {tab === 'public' && !isTL && (
        <>
          <div className="h-[500px] overflow-y-auto p-4 space-y-2 bg-slate-50/50">
            {publicMessages.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-12">Belum ada chat. Mulai obrolan!</p>
            ) : (
              publicMessages.map((m) => (
                <MessageBubble key={m.id} message={m} isMine={m.sender_id === currentUserId} />
              ))
            )}
            <div ref={publicEndRef} />
          </div>
          <form action={handleSendPublic} className="p-3 border-t border-slate-200 flex gap-2">
            <input autoComplete="off"
              id="public-msg-input"
              name="content"
              required
              maxLength={2000}
              placeholder="Ketik pesan ke semua tim..."
              className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
            />
            <button type="submit" disabled={pending} className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded disabled:opacity-50">
              {pending ? '...' : 'Kirim'}
            </button>
          </form>
        </>
      )}

      {/* PERSONAL TAB */}
      {tab === 'personal' && (
        <div className="flex h-[560px]">
          <div className="w-56 border-r border-slate-200 overflow-y-auto bg-slate-50">
            <div className="px-3 py-2 border-b border-slate-200">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pilih Tim Member</p>
            </div>
            {otherMembers.length === 0 ? (
              <p className="text-xs text-slate-400 p-4">Belum ada member lain login</p>
            ) : (
              otherMembers.map((m) => {
                const active = m.user_id === dmWith;
                const initial = (m.name || m.email || '?').charAt(0).toUpperCase();
                return (
                  <button
                    key={m.user_id}
                    onClick={() => handleStartDm(m.user_id)}
                    className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${active ? 'bg-brand-100' : 'hover:bg-slate-100'}`}
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">{initial}</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold truncate ${active ? 'text-brand-700' : 'text-slate-700'}`}>{m.name || m.email}</p>
                      <p className="text-[10px] text-slate-500 truncate">{ROLE_LABELS[m.role] || m.role}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex-1 flex flex-col">
            {!dmWith ? (
              <div className="flex-1 flex items-center justify-center text-center p-8">
                <div>
                  <p className="text-4xl mb-2">💬</p>
                  <p className="text-sm text-slate-500">Pilih tim member di kiri untuk mulai chat personal</p>
                </div>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 border-b border-slate-200 bg-white flex items-center justify-between">
                  <p className="text-sm font-bold text-brand-700">
                    💬 {dmRecipient?.name || dmRecipient?.email || 'User'}
                  </p>
                  <Link href="/chat?dm=" className="text-xs text-slate-500 hover:underline">× Tutup</Link>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/50">
                  {personalMessages.length === 0 ? (
                    <p className="text-center text-sm text-slate-500 py-12">Belum ada chat. Sapa dulu!</p>
                  ) : (
                    personalMessages.map((m) => (
                      <MessageBubble key={m.id} message={m} isMine={m.sender_id === currentUserId} />
                    ))
                  )}
                  <div ref={personalEndRef} />
                </div>
                <form action={handleSendPersonal} className="p-3 border-t border-slate-200 flex gap-2">
                  <input autoComplete="off"
                    id="personal-msg-input"
                    name="content"
                    required
                    maxLength={2000}
                    placeholder={`Pesan ke ${dmRecipient?.name || 'user'}...`}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded text-sm focus:ring-1 focus:ring-brand-500 outline-none"
                  />
                  <button type="submit" disabled={pending} className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded disabled:opacity-50">
                    {pending ? '...' : 'Kirim'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, isMine }) {
  const time = new Date(message.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const date = new Date(message.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const roleBadge = ROLE_BADGE_COLOR?.[message.sender_role] || 'bg-slate-100 text-slate-700';

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[75%] ${isMine ? 'bg-brand-500 text-white' : 'bg-white border border-slate-200'} rounded-2xl px-3 py-2 shadow-sm ${message._optimistic ? 'opacity-70' : ''}`}>
        {!isMine && (
          <div className="flex items-center gap-1 mb-1">
            <p className="text-[11px] font-bold text-brand-700">{message.sender_name}</p>
            {message.sender_role && <span className={`text-[9px] font-bold uppercase px-1 rounded ${roleBadge}`}>{message.sender_role}</span>}
          </div>
        )}
        <p className={`text-sm whitespace-pre-wrap ${isMine ? 'text-white' : 'text-slate-800'}`}>{message.content}</p>
        <p className={`text-[10px] mt-1 ${isMine ? 'text-white/70' : 'text-slate-400'} text-right`}>
          {date} · {time}
          {message._optimistic && ' ✓'}
        </p>
      </div>
    </div>
  );
}
