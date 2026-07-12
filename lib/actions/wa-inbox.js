'use server';

// Inbox WhatsApp (Khasanah) — FITUR BARU. Chat room per (nomor PIC × peserta).
// PIC hanya lihat percakapan nomornya; owner/manager lihat semua.
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { metaConfig, sendMetaText, sendMetaTemplate } from '@/lib/utils/waba-meta';
import { logOutbound } from '@/lib/utils/waba-send';
import { revalidatePath } from 'next/cache';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false } });
}
function isKh() { try { return currentBrandCode() === 'khasanah'; } catch { return false; } }

// employee id + role utk user login
async function me(db, user) {
  const role = await resolveAuthoritativeRole(user);
  let empId = null;
  try {
    const { data: e } = await db.from('employees').select('id').ilike('email', (user.email || '').toLowerCase()).maybeSingle();
    empId = e?.id || null;
  } catch {}
  return { role, empId };
}

// Nomor yang boleh dilihat user. PIC -> nomornya; owner/manager -> semua.
async function visibleNumbers(db, role, empId) {
  const { data: nums } = await db.from('wa_numbers').select('id, phone_number_id, display_phone, pic_name, pic_employee_id').eq('active', true);
  const all = nums || [];
  if (role === 'pic') return all.filter((n) => n.pic_employee_id === empId);
  return all;
}

export async function getInboxData({ numberId = '', status = '' } = {}) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/inbox'); if (g.error) return { error: g.error };
  if (!isKh()) return { ok: true, conversations: [], numbers: [], role: 'other', notKhasanah: true };
  const db = svc() || auth;
  const { role, empId } = await me(db, user);
  const numbers = await visibleNumbers(db, role, empId);
  const numIds = numbers.map((n) => n.id);
  if (numIds.length === 0) return { ok: true, conversations: [], numbers: [], role, scoped: role === 'pic' };

  let q = db.from('wa_conversations')
    .select('id, number_id, phone_number_id, customer_phone, customer_name, customer_id, assigned_to, status, pipeline_stage, last_message_at, last_customer_msg_at, last_message_preview, unread_count')
    .in('number_id', numIds)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200);
  if (numberId) q = q.eq('number_id', Number(numberId));
  if (status) q = q.eq('status', status);
  const { data: convs } = await q;
  let agents = [];
  try { const { data: emps } = await db.from('employees').select('id, full_name').eq('status', 'active').order('full_name'); agents = emps || []; } catch {}
  return { ok: true, conversations: convs || [], numbers, role, scoped: role === 'pic', agents, myEmpId: empId };
}

export async function getConversationThread(conversationId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/inbox'); if (g.error) return { error: g.error };
  const db = svc() || auth;
  const { role, empId } = await me(db, user);

  const { data: conv } = await db.from('wa_conversations').select('*').eq('id', conversationId).maybeSingle();
  if (!conv) return { error: 'Percakapan tidak ditemukan' };
  // scope check
  const numbers = await visibleNumbers(db, role, empId);
  if (!numbers.some((n) => n.id === conv.number_id)) return { error: 'Tidak punya akses ke percakapan ini' };

  const { data: msgs } = await db.from('wa_messages').select('id, direction, type, body, template_name, media_url, status, created_at, sent_by')
    .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(500);
  // notes
  const { data: notes } = await db.from('wa_notes').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false });
  const within24 = conv.last_customer_msg_at ? (Date.now() - new Date(conv.last_customer_msg_at).getTime() < 24 * 3600 * 1000) : false;
  return { ok: true, conversation: conv, messages: msgs || [], notes: notes || [], within24 };
}

export async function markInboxRead(conversationId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  try { await db.from('wa_conversations').update({ unread_count: 0 }).eq('id', conversationId); } catch {}
  return { ok: true };
}

async function sendGuard(user) {
  const g = await assertStaff(user, '/inbox'); if (g.error) return { error: g.error };
  if (!isKh()) return { error: 'Inbox WABA khusus Khasanah' };
  const cfg = metaConfig();
  if (!cfg) return { error: 'Meta WABA belum dikonfigurasi (env token belum di-set)' };
  return { cfg };
}

export async function sendInboxReply(conversationId, text) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const gg = await sendGuard(user); if (gg.error) return { error: gg.error };
  const db = svc() || auth;
  const { role, empId } = await me(db, user);
  const { data: conv } = await db.from('wa_conversations').select('*').eq('id', conversationId).maybeSingle();
  if (!conv) return { error: 'Percakapan tidak ditemukan' };
  const numbers = await visibleNumbers(db, role, empId);
  if (!numbers.some((n) => n.id === conv.number_id)) return { error: 'Tidak punya akses' };
  const within24 = conv.last_customer_msg_at ? (Date.now() - new Date(conv.last_customer_msg_at).getTime() < 24 * 3600 * 1000) : false;
  if (!within24) return { error: 'Di luar 24 jam — wajib kirim template.', needTemplate: true };
  if (!text || !text.trim()) return { error: 'Pesan kosong' };

  const r = await sendMetaText(gg.cfg, conv.phone_number_id, conv.customer_phone, text.trim());
  if (!r.ok) return { error: r.error };
  await logOutbound(db, { phoneNumberId: conv.phone_number_id, numberRowId: conv.number_id, toPhone: conv.customer_phone, body: text.trim(), wamid: r.wamid, sentBy: empId });
  revalidatePath('/inbox');
  return { ok: true };
}

export async function sendInboxTemplate(conversationId, templateName, params = []) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const gg = await sendGuard(user); if (gg.error) return { error: gg.error };
  const db = svc() || auth;
  const { role, empId } = await me(db, user);
  const { data: conv } = await db.from('wa_conversations').select('*').eq('id', conversationId).maybeSingle();
  if (!conv) return { error: 'Percakapan tidak ditemukan' };
  const numbers = await visibleNumbers(db, role, empId);
  if (!numbers.some((n) => n.id === conv.number_id)) return { error: 'Tidak punya akses' };
  const r = await sendMetaTemplate(gg.cfg, conv.phone_number_id, conv.customer_phone, templateName, gg.cfg.lang, params);
  if (!r.ok) return { error: r.error };
  await logOutbound(db, { phoneNumberId: conv.phone_number_id, numberRowId: conv.number_id, toPhone: conv.customer_phone, templateName, wamid: r.wamid, sentBy: empId });
  revalidatePath('/inbox');
  return { ok: true };
}

export async function setInboxStatus(conversationId, status) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  try { await db.from('wa_conversations').update({ status }).eq('id', conversationId); } catch (e) { return { error: e?.message }; }
  revalidatePath('/inbox');
  return { ok: true };
}

export async function assignInbox(conversationId, employeeId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  const { empId } = await me(db, user);
  try {
    const { data: prev } = await db.from('wa_conversations').select('assigned_to').eq('id', conversationId).maybeSingle();
    let toName = null;
    if (employeeId) { const { data: e } = await db.from('employees').select('full_name').eq('id', employeeId).maybeSingle(); toName = e?.full_name || null; }
    await db.from('wa_conversations').update({ assigned_to: employeeId || null }).eq('id', conversationId);
    await db.from('wa_assignment_history').insert({ conversation_id: conversationId, from_employee: prev?.assigned_to || null, to_employee: employeeId || null, to_name: toName, changed_by: empId });
  } catch (e) { return { error: e?.message }; }
  revalidatePath('/inbox');
  return { ok: true };
}

export async function addInboxNote(conversationId, body) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!body || !body.trim()) return { error: 'Catatan kosong' };
  const db = svc() || auth;
  const { empId } = await me(db, user);
  let name = user.user_metadata?.full_name || user.email || '';
  try { await db.from('wa_notes').insert({ conversation_id: conversationId, body: body.trim(), created_by: empId, created_by_name: name }); } catch (e) { return { error: e?.message }; }
  revalidatePath('/inbox');
  return { ok: true };
}
