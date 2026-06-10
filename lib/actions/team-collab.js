'use server';

// Team collaboration: member sync, chat (public + DM), tasks, notifications

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// TEAM MEMBER SYNC — dipanggil dari layout setiap kali user akses
// ============================================================
export async function syncCurrentTeamMember() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { skipped: true };

  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0];
  const role = user.app_metadata?.role || user.user_metadata?.role || 'pending';
  const avatar_url = user.user_metadata?.avatar_url || null;

  await supabase.from('team_members').upsert({
    user_id: user.id,
    email: user.email,
    name,
    role,
    avatar_url,
    last_active: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  return { ok: true };
}

export async function listTeamMembers() {
  const supabase = createClient();
  const { data } = await supabase
    .from('team_members')
    .select('user_id, email, name, role, avatar_url')
    .order('name');
  return data || [];
}

// ============================================================
// CHAT — public + personal DM
// ============================================================
export async function sendPublicMessage(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const content = (formData.get('content') || '').trim();
  if (!content) return { error: 'Pesan kosong' };
  if (content.length > 2000) return { error: 'Pesan terlalu panjang (max 2000 char)' };

  const sender_name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonim';
  const sender_role = user.app_metadata?.role || user.user_metadata?.role || 'pending';

  const { error } = await supabase.from('team_chats').insert({
    type: 'public',
    sender_id: user.id,
    sender_name,
    sender_role,
    content,
  });

  if (error) return { error: error.message };

  revalidatePath('/chat');
  return { ok: true };
}

export async function sendPersonalMessage(recipientId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const content = (formData.get('content') || '').trim();
  if (!content) return { error: 'Pesan kosong' };
  if (!recipientId) return { error: 'Pilih penerima' };

  const sender_name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonim';
  const sender_role = user.app_metadata?.role || user.user_metadata?.role || 'pending';

  // Ambil nama recipient
  const { data: recipient } = await supabase.from('team_members').select('name, email').eq('user_id', recipientId).maybeSingle();
  const recipient_name = recipient?.name || recipient?.email || 'User';

  const { error } = await supabase.from('team_chats').insert({
    type: 'personal',
    sender_id: user.id,
    sender_name,
    sender_role,
    recipient_id: recipientId,
    recipient_name,
    content,
  });

  if (error) return { error: error.message };

  // Notify recipient
  await supabase.from('team_notifications').insert({
    user_id: recipientId,
    type: 'chat_dm',
    title: `Pesan dari ${sender_name}`,
    message: content.length > 100 ? content.slice(0, 100) + '...' : content,
    link: `/chat?dm=${user.id}`,
  });

  revalidatePath('/chat');
  return { ok: true };
}

// ============================================================
// TASKS
// ============================================================
export async function createTask(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const title = (formData.get('title') || '').trim();
  const description = (formData.get('description') || '').trim() || null;
  const assignee_id = formData.get('assignee_id');
  const deadline = formData.get('deadline') || null;
  const priority = formData.get('priority') || 'normal';

  if (!title) return { error: 'Judul tugas wajib' };
  if (!assignee_id) return { error: 'Pilih siapa yang dapat tugas' };

  const assigner_name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonim';

  // Ambil nama assignee
  const { data: assignee } = await supabase.from('team_members').select('name, email').eq('user_id', assignee_id).maybeSingle();
  const assignee_name = assignee?.name || assignee?.email || 'User';

  const { data: task, error } = await supabase.from('team_tasks').insert({
    title,
    description,
    assigner_id: user.id,
    assigner_name,
    assignee_id,
    assignee_name,
    deadline,
    priority,
  }).select().maybeSingle();

  if (error) return { error: error.message };

  // Notify assignee
  await supabase.from('team_notifications').insert({
    user_id: assignee_id,
    type: 'task_new',
    title: `Tugas baru dari ${assigner_name}`,
    message: title + (deadline ? ` (deadline: ${deadline})` : ''),
    link: '/tasks',
  });

  revalidatePath('/tasks');
  return { ok: true };
}

export async function markTaskDone(taskId, note) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Get task untuk notify assigner
  const { data: task } = await supabase
    .from('team_tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (!task) return { error: 'Tugas tidak ditemukan' };
  if (String(task.assignee_id) !== String(user.id) && task.assigner_id !== user.id) {
    return { error: 'Kamu bukan assignee atau assigner tugas ini' };
  }

  const { error } = await supabase
    .from('team_tasks')
    .update({
      status: 'done',
      completed_at: new Date().toISOString(),
      completed_note: (note || '').trim() || null,
    })
    .eq('id', taskId);

  if (error) return { error: error.message };

  // Notify assigner
  const completedBy = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
  if (task.assigner_id !== user.id) {
    await supabase.from('team_notifications').insert({
      user_id: task.assigner_id,
      type: 'task_done',
      title: `✓ Tugas selesai: "${task.title}"`,
      message: `${completedBy} sudah selesai${note ? ` — "${note}"` : ''}`,
      link: '/tasks',
    });
  }

  revalidatePath('/tasks');
  return { ok: true };
}

export async function reopenTask(taskId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('team_tasks')
    .update({ status: 'pending', completed_at: null, completed_note: null })
    .eq('id', taskId);

  if (error) return { error: error.message };

  revalidatePath('/tasks');
  return { ok: true };
}

export async function deleteTask(taskId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase.from('team_tasks').delete().eq('id', taskId);
  if (error) return { error: error.message };

  revalidatePath('/tasks');
  return { ok: true };
}

// ============================================================
// NOTIFICATIONS
// ============================================================
export async function markNotificationRead(notifId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  await supabase
    .from('team_notifications')
    .update({ read: true })
    .eq('id', notifId)
    .eq('user_id', user.id);

  return { ok: true };
}

export async function markAllNotificationsRead() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  await supabase
    .from('team_notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);

  return { ok: true };
}
