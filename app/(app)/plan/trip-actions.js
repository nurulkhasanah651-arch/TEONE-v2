'use server';

// Plan Trip — aksi publish & jadwal publish untuk trip berstatus "prepare to sell".
// "Sudah Publish" HANYA mengubah status jadi 'open selling' (tidak menyentuh is_published /
// storefront web, sesuai keputusan owner). Jadwal publish disimpan di kolom publish_date.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { resolveAuthoritativeRole } from '@/lib/auth/authoritative-role';
import { getRoleFromUser } from '@/lib/utils/roles';

const CAN_EDIT = ['owner', 'accounting', 'manager', 'ops'];

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function guardEdit() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Belum login' };
  const role = await resolveAuthoritativeRole(user, getRoleFromUser(user));
  if (!CAN_EDIT.includes(role)) return { error: 'Akses ditolak: hanya Owner/Accounting/Manager/Ops.' };
  return { ok: true };
}

// Simpan jadwal publish (tanggal rencana publish) — kolom publish_date.
export async function setTripSchedulePublish(tripId, dateStr) {
  const g = await guardEdit();
  if (g.error) return g;
  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };
  const { error } = await db.from('trips').update({ publish_date: dateStr || null }).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath('/plan');
  revalidatePath('/trips');
  return { ok: true };
}

// Tandai trip sudah dipublish -> status jadi 'open selling'. Hanya dari 'prepare to sell'.
export async function publishTrip(tripId) {
  const g = await guardEdit();
  if (g.error) return g;
  const db = svc();
  if (!db) return { error: 'Service tidak tersedia' };
  const { data: trip } = await db.from('trips').select('id, status, publish_date').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan' };
  const patch = { status: 'open selling' };
  // Kalau jadwal publish belum diisi, stempel tanggal hari ini sebagai tanggal publish.
  if (!trip.publish_date) patch.publish_date = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const { error } = await db.from('trips').update(patch).eq('id', tripId);
  if (error) return { error: error.message };
  revalidatePath('/plan');
  revalidatePath('/trips');
  return { ok: true };
}
