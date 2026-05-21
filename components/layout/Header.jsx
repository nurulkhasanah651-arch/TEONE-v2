// Header with role badge + notification bell + logout
// NOTE: this is now a SERVER component yang fetch notifications
// Then renders HeaderClient

import { createClient } from '@/lib/supabase/server';
import HeaderClient from './HeaderClient';

export default async function Header({ user, role = null }) {
  const supabase = createClient();

  let notifications = [];
  let unreadCount = 0;
  if (user?.id) {
    try {
      const { data } = await supabase
        .from('team_notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      notifications = data || [];
      unreadCount = notifications.filter((n) => !n.read).length;
    } catch {
      // table belum ada / RLS issue — skip
    }
  }

  return <HeaderClient user={user} role={role} notifications={notifications} unreadCount={unreadCount} />;
}
