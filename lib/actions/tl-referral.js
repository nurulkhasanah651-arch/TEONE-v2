'use server';
// Self-report TL: TL input sendiri jumlah peserta yang berhasil dia ajak daftar
// (nama peserta + trip). MURNI untuk penilaian performa TL di Master TL — TIDAK
// masuk Master Trip / data peserta resmi (itu tetap diinput CS).
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { revalidatePath } from 'next/cache';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createSvc(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function currentUser() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const email = (user.email || '').toLowerCase();
  const name = user.user_metadata?.full_name || email.split('@')[0] || 'TL';
  return { email, name, uid: user.id };
}

async function resolveTlId(c, email) {
  try {
    if (!c || !email) return null;
    const { data } = await c.from('tour_leaders').select('id').ilike('email', email).maybeSingle();
    return data?.id ?? null;
  } catch { return null; }
}

async function isInternal(c, email, uid) {
  try {
    let emp = null;
    if (uid) { const r = await c.from('employees').select('role').eq('user_id', uid).maybeSingle(); emp = r.data; }
    if (!emp && email) { const r = await c.from('employees').select('role').ilike('email', email).maybeSingle(); emp = r.data; }
    return !!emp && ['manager', 'owner', 'accounting', 'ops', 'cs', 'pic'].includes(emp.role);
  } catch { return false; }
}

export async function addTlReferral(participantName, tripLabel, proofUrl) {
  const u = await currentUser();
  if (!u) return { error: 'Belum login' };
  const nama = String(participantName || '').trim();
  if (!nama) return { error: 'Nama peserta wajib diisi' };
  const proof = String(proofUrl || '').trim();
  if (!proof) return { error: 'Bukti foto wajib diupload' };
  const c = svc();
  if (!c) return { error: 'Service tidak tersedia' };
  const tlId = await resolveTlId(c, u.email);
  const { error } = await c.from('tl_referrals').insert({
    tl_email: u.email,
    tl_name: u.name,
    tl_id: tlId,
    participant_name: nama,
    trip_label: String(tripLabel || '').trim() || null,
    proof_url: proof,
    created_by: u.email,
  });
  if (error) return { error: error.message };
  revalidatePath('/tl');
  revalidatePath('/tl-master');
  return { ok: true };
}

export async function deleteTlReferral(id) {
  const u = await currentUser();
  if (!u) return { error: 'Belum login' };
  const c = svc();
  if (!c) return { error: 'Service tidak tersedia' };
  const admin = await isInternal(c, u.email, u.uid);
  let q = c.from('tl_referrals').delete().eq('id', id);
  if (!admin) q = q.ilike('tl_email', u.email); // TL hanya boleh hapus miliknya
  const { error } = await q;
  if (error) return { error: error.message };
  revalidatePath('/tl');
  revalidatePath('/tl-master');
  return { ok: true };
}
