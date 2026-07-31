'use server';

// To-Do List Harian manager/ops — dilaporkan ke owner, update tiap hari.
// Path: lib/actions/daily-todo.js
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { ROLE_LABELS } from '@/lib/utils/roles';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const ROLES_SEE_ALL = ['owner', 'accounting']; // owner & accounting lihat semua laporan; manager (dll) hanya list sendiri
const todayWIB = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// Format durasi kerja (dari dibuat s/d dicentang selesai).
function fmtDur(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso) - new Date(fromIso);
  if (!(ms > 0)) return null;
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return '<1 mnt';
  if (totalMin < 60) return `${totalMin} mnt`;
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  if (h < 24) return m ? `${h} jam ${m} mnt` : `${h} jam`;
  const dd = Math.floor(h / 24), hh = h % 24;
  return hh ? `${dd} hr ${hh} jam` : `${dd} hr`;
}

async function guard() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/daily-todo'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  return { user, role: g.role, db };
}

async function authorNameOf(db, user) {
  try {
    let emp = (await db.from('employees').select('full_name, nickname').eq('user_id', user.id).maybeSingle()).data;
    if (!emp && user.email) emp = (await db.from('employees').select('full_name, nickname').ilike('email', user.email).maybeSingle()).data;
    return emp?.nickname || emp?.full_name || user.email || 'Staf';
  } catch { return user.email || 'Staf'; }
}

// Ambil daftar to-do untuk satu tanggal: milik sendiri + (kalau manajemen) semua laporan.
export async function getDailyTodos(dateStr) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { user, role, db } = g;
  const date = isValidDate(dateStr) ? dateStr : todayWIB();
  const canSeeAll = ROLES_SEE_ALL.includes(role);

  const { data: rows, error } = await db.from('daily_todos')
    .select('id, author_id, author_name, author_role, content, done, note, created_at, done_at')
    .eq('todo_date', date)
    .order('created_at', { ascending: true });
  if (error) return { error: error.message };

  const mapItem = (r) => ({ id: r.id, content: r.content, done: r.done === true, note: r.note || '', authorId: r.author_id, createdAt: r.created_at, doneAt: r.done_at, durasi: r.done === true ? fmtDur(r.created_at, r.done_at) : null });
  const mine = (rows || []).filter((r) => r.author_id === user.id).map(mapItem);

  let others = [];
  if (canSeeAll) {
    const byAuthor = {};
    for (const r of (rows || [])) {
      if (r.author_id === user.id) continue;
      const a = byAuthor[r.author_id] = byAuthor[r.author_id] || { authorId: r.author_id, authorName: r.author_name || 'Staf', authorRole: r.author_role || '', roleLabel: ROLE_LABELS[r.author_role] || r.author_role || '', items: [] };
      a.items.push(mapItem(r));
    }
    others = Object.values(byAuthor).sort((a, b) => String(a.authorName).localeCompare(String(b.authorName)));
  }

  return { ok: true, date, today: todayWIB(), canSeeAll, myName: await authorNameOf(db, user), mine, others };
}

export async function addTodo(dateStr, content) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { user, role, db } = g;
  const date = isValidDate(dateStr) ? dateStr : todayWIB();
  const text = String(content || '').trim(); if (!text) return { error: 'Isi to-do kosong' };
  if (text.length > 1000) return { error: 'To-do terlalu panjang' };
  const author_name = await authorNameOf(db, user);
  const { error } = await db.from('daily_todos').insert({ author_id: user.id, author_name, author_role: role, todo_date: date, content: text });
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

// Hanya boleh ubah item milik sendiri.
async function ownRow(db, id, userId) {
  const { data } = await db.from('daily_todos').select('author_id').eq('id', id).maybeSingle();
  return data && data.author_id === userId;
}

export async function toggleTodo(id, done) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { user, db } = g;
  const rid = parseInt(id); if (!rid) return { error: 'Item tidak valid' };
  if (!(await ownRow(db, rid, user.id))) return { error: 'Hanya bisa ubah to-do sendiri' };
  const now = new Date().toISOString();
  const { error } = await db.from('daily_todos').update({ done: !!done, done_at: done ? now : null, updated_at: now }).eq('id', rid);
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

export async function updateTodo(id, fields) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { user, db } = g;
  const rid = parseInt(id); if (!rid) return { error: 'Item tidak valid' };
  if (!(await ownRow(db, rid, user.id))) return { error: 'Hanya bisa ubah to-do sendiri' };
  const upd = { updated_at: new Date().toISOString() };
  if (typeof fields?.content === 'string') { const t = fields.content.trim(); if (!t) return { error: 'Isi to-do kosong' }; upd.content = t.slice(0, 1000); }
  if (typeof fields?.note === 'string') upd.note = fields.note.slice(0, 1000);
  const { error } = await db.from('daily_todos').update(upd).eq('id', rid);
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

export async function deleteTodo(id) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { user, db } = g;
  const rid = parseInt(id); if (!rid) return { error: 'Item tidak valid' };
  if (!(await ownRow(db, rid, user.id))) return { error: 'Hanya bisa hapus to-do sendiri' };
  const { error } = await db.from('daily_todos').delete().eq('id', rid);
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true };
}

// Tarik item BELUM SELESAI dari hari sebelumnya (punya sendiri) ke tanggal ini.
export async function carryOverUndone(dateStr) {
  const g = await guard(); if (g.error) return { error: g.error };
  const { user, role, db } = g;
  const date = isValidDate(dateStr) ? dateStr : todayWIB();
  const prev = new Date(`${date}T00:00:00+07:00`); prev.setUTCDate(prev.getUTCDate() - 1);
  const prevStr = prev.toISOString().slice(0, 10);
  const { data: undone } = await db.from('daily_todos')
    .select('content, note').eq('author_id', user.id).eq('todo_date', prevStr).eq('done', false).order('created_at', { ascending: true });
  if (!undone || !undone.length) return { ok: true, moved: 0 };
  // Hindari duplikat kalau sudah pernah ditarik
  const { data: existing } = await db.from('daily_todos').select('content').eq('author_id', user.id).eq('todo_date', date);
  const have = new Set((existing || []).map((r) => (r.content || '').trim().toLowerCase()));
  const author_name = await authorNameOf(db, user);
  const toInsert = undone
    .filter((r) => !have.has((r.content || '').trim().toLowerCase()))
    .map((r) => ({ author_id: user.id, author_name, author_role: role, todo_date: date, content: r.content, note: r.note || null, done: false }));
  if (!toInsert.length) return { ok: true, moved: 0 };
  const { error } = await db.from('daily_todos').insert(toInsert);
  if (error) return { error: error.message };
  revalidatePath('/manager-dashboard');
  return { ok: true, moved: toInsert.length };
}
