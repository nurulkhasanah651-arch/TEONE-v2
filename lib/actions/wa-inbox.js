'use server';

// Inbox WhatsApp (Khasanah) — FITUR BARU. Chat room per (nomor PIC × peserta).
// PIC hanya lihat percakapan nomornya; owner/manager lihat semua.
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { metaConfig, sendMetaText, sendMetaTemplate } from '@/lib/utils/waba-meta';
import { apicoidConfig, sendApicoidText, sendApicoidTemplate, getApicoidCustomerName } from '@/lib/utils/waba-apicoid';
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
  const { data: nums } = await db.from('wa_numbers').select('id, phone_number_id, display_phone, pic_name, pic_employee_id, access_role').eq('active', true);
  const all = nums || [];
  // PIC: hanya nomornya sendiri. CS: hanya nomor CS (lead tracking, bukan chat PIC).
  // owner/manager/accounting/ops: semua nomor.
  if (role === 'pic') return all.filter((n) => n.pic_employee_id === empId);
  if (role === 'cs') return all.filter((n) => n.access_role === 'cs');
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
  const list = convs || [];

  // Enrich: nama peserta dari CRM (customers) berdasarkan nomor + status window 24 jam.
  const _norm = (x) => { let d = String(x || '').replace(/[^0-9]/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); return d; };
  const nameByDigits = {};
  try {
    const forms = new Set();
    for (const c of list) {
      const d = _norm(c.customer_phone); if (!d) continue;
      forms.add(d); forms.add('0' + d.slice(2));
    }
    const uForms = [...forms].filter(Boolean);
    if (uForms.length) {
      const [byPhone, byWa] = await Promise.all([
        db.from('customers').select('name, phone, whatsapp').in('phone', uForms),
        db.from('customers').select('name, phone, whatsapp').in('whatsapp', uForms),
      ]);
      for (const r of [...(byPhone.data || []), ...(byWa.data || [])]) {
        for (const v of [r.phone, r.whatsapp]) { const d = _norm(v); if (d && !nameByDigits[d]) nameByDigits[d] = r.name; }
      }
    }
  } catch {}

  const nowMs = Date.now();
  const conversations = list.map((c) => {
    const d = _norm(c.customer_phone);
    const within24 = c.last_customer_msg_at ? (nowMs - new Date(c.last_customer_msg_at).getTime() < 24 * 3600 * 1000) : false;
    return { ...c, customer_name: c.customer_name || nameByDigits[d] || null, within24 };
  });

  let agents = [];
  try { const { data: emps } = await db.from('employees').select('id, full_name').eq('status', 'active').order('full_name'); agents = emps || []; } catch {}
  return { ok: true, conversations, numbers, role, scoped: role === 'pic', agents, myEmpId: empId };
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
  // Nama profil WA (push name) dari Api.co.id kalau belum ada namanya — sekali saat dibuka.
  if (!conv.customer_name) {
    try {
      const nm = await getApicoidCustomerName(conv.customer_phone);
      if (nm) { conv.customer_name = nm; await db.from('wa_conversations').update({ customer_name: nm }).eq('id', conv.id); }
    } catch {}
  }
  // scope check
  const numbers = await visibleNumbers(db, role, empId);
  if (!numbers.some((n) => n.id === conv.number_id)) return { error: 'Tidak punya akses ke percakapan ini' };

  const { data: msgs } = await db.from('wa_messages').select('id, direction, type, body, template_name, media_url, status, created_at, sent_by')
    .eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(500);
  // notes
  const { data: notes } = await db.from('wa_notes').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false });
  // tags
  const { data: ctags } = await db.from('wa_conversation_tags').select('tag_id, wa_tags(id, name, color)').eq('conversation_id', conversationId);
  const tags = (ctags || []).map((x) => x.wa_tags).filter(Boolean);
  const { data: allTags } = await db.from('wa_tags').select('id, name, color').order('name');
  // assignment history
  const { data: history } = await db.from('wa_assignment_history').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(20);
  // pelanggan (CRM): cocokkan nomor -> customers -> trip
  let customer = null; let trips = [];
  try {
    const p = conv.customer_phone;
    const p0 = p.startsWith('62') ? '0' + p.slice(2) : p;
    const { data: cust } = await db.from('customers').select('id, name, phone, whatsapp, email')
      .or(`phone.eq.${p},whatsapp.eq.${p},phone.eq.${p0},whatsapp.eq.${p0}`).limit(1);
    if (cust && cust[0]) {
      customer = cust[0];
      const { data: pax } = await db.from('trip_passengers').select('trip_id').eq('customer_id', customer.id).limit(20);
      const tripIds = [...new Set((pax || []).map((x) => x.trip_id).filter(Boolean))];
      if (tripIds.length) {
        const { data: tr } = await db.from('trips').select('id, kode_trip, name').in('id', tripIds);
        trips = tr || [];
      }
    }
  } catch {}
  let allTrips = [];
  try { const { data: at } = await db.from('trips').select('id, kode_trip, name').limit(500); allTrips = at || []; } catch {}
  const within24 = conv.last_customer_msg_at ? (Date.now() - new Date(conv.last_customer_msg_at).getTime() < 24 * 3600 * 1000) : false;
  return { ok: true, conversation: conv, messages: msgs || [], notes: notes || [], tags, allTags: allTags || [], history: history || [], customer, trips, allTrips, within24 };
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
  const acfg = apicoidConfig();
  if (acfg) return { cfg: acfg, via: 'apicoid' };
  const cfg = metaConfig();
  if (!cfg) return { error: 'WABA belum dikonfigurasi (env belum di-set)' };
  return { cfg, via: 'meta' };
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

  const r = gg.via === 'apicoid'
    ? await sendApicoidText(gg.cfg, conv.phone_number_id, conv.customer_phone, text.trim())
    : await sendMetaText(gg.cfg, conv.phone_number_id, conv.customer_phone, text.trim());
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
  const r = gg.via === 'apicoid'
    ? await sendApicoidTemplate(gg.cfg, conv.phone_number_id, conv.customer_phone, templateName, gg.cfg.lang, params)
    : await sendMetaTemplate(gg.cfg, conv.phone_number_id, conv.customer_phone, templateName, gg.cfg.lang, params);
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

// ---------- Tags ----------
export async function listInboxTags() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  const { data } = await db.from('wa_tags').select('id, name, color').order('name');
  return { ok: true, tags: data || [] };
}

export async function createInboxTag(name, color = 'slate') {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  if (!name || !name.trim()) return { error: 'Nama tag kosong' };
  const db = svc() || auth;
  try {
    const { data, error } = await db.from('wa_tags').insert({ brand: currentBrandCode(), name: name.trim(), color }).select('id, name, color').maybeSingle();
    if (error) return { error: error.message };
    return { ok: true, tag: data };
  } catch (e) { return { error: e?.message }; }
}

export async function addTagToConv(conversationId, tagId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  try { await db.from('wa_conversation_tags').insert({ conversation_id: conversationId, tag_id: tagId }); } catch {}
  revalidatePath('/inbox');
  return { ok: true };
}

export async function removeTagFromConv(conversationId, tagId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  try { await db.from('wa_conversation_tags').delete().eq('conversation_id', conversationId).eq('tag_id', tagId); } catch {}
  revalidatePath('/inbox');
  return { ok: true };
}

// ---------- Pipeline stage ----------
const CLOSING_STAGES = ['Closing', 'DP', 'Lunas'];
export async function setPipelineStage(conversationId, stage) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  const patch = { pipeline_stage: stage || null };
  try {
    if (stage && CLOSING_STAGES.includes(stage)) {
      const { data: c } = await db.from('wa_conversations').select('closed_at').eq('id', conversationId).maybeSingle();
      if (!c?.closed_at) patch.closed_at = new Date().toISOString();
    }
    await db.from('wa_conversations').update(patch).eq('id', conversationId);
  } catch (e) { return { error: e?.message }; }
  revalidatePath('/inbox');
  return { ok: true };
}

export async function setConversationTrip(conversationId, tripId) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  try { await db.from('wa_conversations').update({ trip_id: tripId || null }).eq('id', conversationId); } catch (e) { return { error: e?.message }; }
  revalidatePath('/inbox');
  return { ok: true };
}

export async function setLeadSource(conversationId, source) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc() || auth;
  const val = source === 'ads' ? 'ads' : 'regular';
  try { await db.from('wa_conversations').update({ lead_source: val }).eq('id', conversationId); } catch (e) { return { error: e?.message }; }
  revalidatePath('/inbox');
  return { ok: true };
}

// ── INSIGHTS (khusus owner/manager/accounting) ──────────────────────────────
export async function getInsights({ days = 14 } = {}) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/inbox'); if (g.error) return { error: g.error };
  if (!isKh()) return { ok: true, notKhasanah: true };
  const db = svc() || auth;
  const { role } = await me(db, user);
  if (!['owner', 'manager', 'accounting'].includes(role)) return { error: 'Akses khusus owner/manager/accounting' };

  const { data: numbers } = await db.from('wa_numbers').select('id, pic_name, display_phone, access_role');
  const numById = {}; (numbers || []).forEach((n) => { numById[n.id] = n; });

  const { data: convs } = await db.from('wa_conversations')
    .select('id, number_id, pipeline_stage, lead_source, trip_id, first_msg_at, first_reply_at, closed_at, status')
    .limit(5000);
  const list = convs || [];

  const tripIds = [...new Set(list.map((c) => c.trip_id).filter(Boolean))];
  const tripById = {};
  if (tripIds.length) { const { data: tr } = await db.from('trips').select('id, kode_trip, name').in('id', tripIds); (tr || []).forEach((t) => { tripById[t.id] = t; }); }

  const secs = (a, b) => (a && b) ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000) : null;
  const nowMs = Date.now();

  // Per-agent (per nomor)
  const agentMap = {};
  for (const c of list) {
    const n = numById[c.number_id]; if (!n) continue;
    if (!agentMap[n.id]) agentMap[n.id] = { name: n.pic_name || n.display_phone, role: n.access_role || 'pic', convs: 0, replied: 0, respTimes: [], closed: 0 };
    const a = agentMap[n.id];
    a.convs++;
    if (c.first_reply_at) { a.replied++; const rt = secs(c.first_msg_at, c.first_reply_at); if (rt != null) a.respTimes.push(rt); }
    if (c.closed_at) a.closed++;
  }
  const agents = Object.values(agentMap).map((a) => ({
    name: a.name, role: a.role, convs: a.convs, replied: a.replied, closed: a.closed,
    avgRespSec: a.respTimes.length ? Math.round(a.respTimes.reduce((x, y) => x + y, 0) / a.respTimes.length) : null,
  })).sort((x, y) => y.convs - x.convs);

  // Leads harian
  const csNumberIds = new Set((numbers || []).filter((n) => n.access_role === 'cs').map((n) => n.id));
  const dayKey = (iso) => iso ? new Date(iso).toISOString().slice(0, 10) : null;
  const daily = {};
  for (const c of list) {
    const dk = dayKey(c.first_msg_at); if (!dk) continue;
    if (!daily[dk]) daily[dk] = { date: dk, total: 0, replied: 0, cs: 0, csReplied: 0, ads: 0, regular: 0 };
    const d = daily[dk];
    d.total++; if (c.first_reply_at) d.replied++;
    if (csNumberIds.has(c.number_id)) { d.cs++; if (c.first_reply_at) d.csReplied++; }
    if (c.lead_source === 'ads') d.ads++; else d.regular++;
  }
  const cutoff = new Date(nowMs - days * 86400000).toISOString().slice(0, 10);
  const dailyArr = Object.values(daily).filter((d) => d.date >= cutoff).sort((a, b) => (a.date < b.date ? 1 : -1));

  const source = { ads: list.filter((c) => c.lead_source === 'ads').length, regular: list.filter((c) => c.lead_source !== 'ads').length };

  // Time-to-close overall + per trip
  const closeTimes = []; const tripClose = {};
  for (const c of list) {
    if (!c.closed_at || !c.first_msg_at) continue;
    const s = secs(c.first_msg_at, c.closed_at); if (s == null) continue;
    closeTimes.push(s);
    const tk = c.trip_id || '(tanpa trip)';
    const label = tripById[c.trip_id] ? `${tripById[c.trip_id].kode_trip} — ${tripById[c.trip_id].name}` : tk;
    if (!tripClose[tk]) tripClose[tk] = { trip: label, count: 0, times: [] };
    tripClose[tk].count++; tripClose[tk].times.push(s);
  }
  const avgCloseSec = closeTimes.length ? Math.round(closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length) : null;
  const perTrip = Object.values(tripClose).map((t) => ({ trip: t.trip, count: t.count, avgSec: Math.round(t.times.reduce((a, b) => a + b, 0) / t.times.length) })).sort((a, b) => b.count - a.count);

  const pipeline = {};
  for (const c of list) { const st = c.pipeline_stage || '(belum)'; pipeline[st] = (pipeline[st] || 0) + 1; }

  return {
    ok: true, role, agents, daily: dailyArr, source, avgCloseSec, perTrip, pipeline,
    totals: { totalLeads: list.length, totalClosed: list.filter((c) => c.closed_at).length, adsToday: (daily[dayKey(new Date().toISOString())]?.ads) || 0 },
  };
}

// Leads harian nomor CS dari inbox (untuk ditampilkan di CS Daily) — original vs ads.
export async function getCsWaDailyLeads({ days = 30 } = {}) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { ok: false };
  const g = await assertStaff(user, '/inbox'); if (g.error) return { ok: false };
  if (!isKh()) return { ok: true, notKhasanah: true, daily: [], today: { original: 0, ads: 0 } };
  const db = svc() || auth;
  const { data: nums } = await db.from('wa_numbers').select('id').eq('access_role', 'cs');
  const csIds = (nums || []).map((n) => n.id);
  if (!csIds.length) return { ok: true, daily: [], today: { original: 0, ads: 0 } };
  const { data: convs } = await db.from('wa_conversations').select('number_id, lead_source, first_msg_at').in('number_id', csIds).limit(5000);
  const dayKey = (iso) => iso ? new Date(iso).toISOString().slice(0, 10) : null;
  const map = {};
  for (const c of (convs || [])) {
    const dk = dayKey(c.first_msg_at); if (!dk) continue;
    if (!map[dk]) map[dk] = { date: dk, original: 0, ads: 0 };
    if (c.lead_source === 'ads') map[dk].ads++; else map[dk].original++;
  }
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const daily = Object.values(map).filter((d) => d.date >= cutoff).sort((a, b) => (a.date < b.date ? 1 : -1));
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = map[todayKey] || { original: 0, ads: 0 };
  return { ok: true, daily, today };
}
