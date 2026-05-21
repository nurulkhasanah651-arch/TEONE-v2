// Chat page — public + personal DM

import { createClient } from '@/lib/supabase/server';
import { syncCurrentTeamMember, listTeamMembers } from '@/lib/actions/team-collab';
import ChatBox from '@/components/chat/ChatBox';

export const dynamic = 'force-dynamic';

async function safeQuery(promise, fallback = []) {
  try {
    const r = await promise;
    return r.data || fallback;
  } catch {
    return fallback;
  }
}

export default async function ChatPage({ searchParams }) {
  const sp = await searchParams;
  const dmWith = sp?.dm || null;

  await syncCurrentTeamMember();

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const members = await listTeamMembers();

  // Public messages (last 100)
  const publicMessages = await safeQuery(
    supabase.from('team_chats')
      .select('*')
      .eq('type', 'public')
      .order('created_at', { ascending: false })
      .limit(100)
  );

  // Personal messages — kalau dmWith ada
  let personalMessages = [];
  if (dmWith && user) {
    const r = await supabase
      .from('team_chats')
      .select('*')
      .eq('type', 'personal')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${dmWith}),and(sender_id.eq.${dmWith},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: true })
      .limit(100);
    personalMessages = r.data || [];
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-brand-700">Chat Tim</h1>
        <p className="mt-1 text-slate-600">Chat umum (semua bisa lihat) + DM personal antar tim.</p>
      </div>

      <ChatBox
        currentUserId={user?.id}
        currentUserName={user?.user_metadata?.full_name || user?.email?.split('@')[0]}
        members={members}
        publicMessages={publicMessages.reverse()}
        dmWith={dmWith}
        personalMessages={personalMessages}
      />
    </div>
  );
}
