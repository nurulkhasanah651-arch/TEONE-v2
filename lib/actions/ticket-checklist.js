'use server';

// Checklist issued tiket per peserta (di PNR Inventory). Path: lib/actions/ticket-checklist.js
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';

function svc() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function setTicketIssued(passengerId, issued) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const g = await assertStaff(user, '/finance/pnr'); if (g.error) return { error: g.error };
  const db = svc(); if (!db) return { error: 'Service tidak tersedia' };
  const pid = parseInt(passengerId); if (!pid) return { error: 'Peserta tidak valid' };
  const upd = issued ? { ticket_issued: true, ticket_issued_at: new Date().toISOString() } : { ticket_issued: false, ticket_issued_at: null };
  const { error } = await db.from('trip_passengers').update(upd).eq('id', pid);
  if (error) return { error: error.message };
  revalidatePath('/finance/pnr');
  revalidatePath('/manager-dashboard');
  return { ok: true };
}
