'use server';

// E-Ticket per PNR (Inventory). Upload maks 4 dokumen, lihat & download.
// File disimpan di bucket privat 'trip-docs' path etickets/<pnrId>/...
// Akses: semua staf internal (bukan Tour Leader / Mitra).

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';

const BUCKET = 'trip-docs';
const MAX_DOCS = 4;
const MAX_MB = 15;

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function guard() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const g = await assertStaff(user, '/finance/pnr');
  if (g.error) return { error: g.error };
  return { user, name: user.user_metadata?.full_name || user.email || 'staff' };
}

// Upload 1 dokumen e-ticket ke sebuah PNR.
export async function uploadEticket(pnrId, formData) {
  const g = await guard();
  if (g.error) return { error: g.error };
  if (!pnrId) return { error: 'PNR tidak valid.' };

  const file = formData.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') return { error: 'Pilih file dulu.' };
  const sizeMb = (file.size || 0) / (1024 * 1024);
  if (sizeMb > MAX_MB) return { error: `File terlalu besar (maks ${MAX_MB}MB).` };

  const db = svc();
  if (!db) return { error: 'Service tidak tersedia.' };

  const { data: pnr } = await db.from('flight_inventory').select('id, eticket_docs').eq('id', pnrId).maybeSingle();
  if (!pnr) return { error: 'PNR tidak ditemukan.' };
  const docs = Array.isArray(pnr.eticket_docs) ? pnr.eticket_docs : [];
  if (docs.length >= MAX_DOCS) return { error: `Maksimal ${MAX_DOCS} dokumen per PNR.` };

  const safe = String(file.name || 'eticket').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  const path = `etickets/${pnrId}/${Date.now()}_${safe}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db.storage.from(BUCKET).upload(path, buf, {
    contentType: file.type || 'application/octet-stream', upsert: false,
  });
  if (upErr) return { error: 'Upload gagal: ' + upErr.message };

  const next = [...docs, { path, name: file.name || safe, size: file.size || 0, uploaded_at: new Date().toISOString(), uploaded_by: g.name }];
  const { error } = await db.from('flight_inventory')
    .update({ eticket_docs: next, ticket_issued: true, ticket_issued_at: new Date().toISOString(), ticket_issued_by: g.name })
    .eq('id', pnrId);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  return { ok: true, docs: next };
}

// Hapus 1 dokumen e-ticket.
export async function deleteEticket(pnrId, path) {
  const g = await guard();
  if (g.error) return { error: g.error };
  const db = svc();
  if (!db) return { error: 'Service tidak tersedia.' };

  const { data: pnr } = await db.from('flight_inventory').select('id, eticket_docs').eq('id', pnrId).maybeSingle();
  if (!pnr) return { error: 'PNR tidak ditemukan.' };
  const docs = Array.isArray(pnr.eticket_docs) ? pnr.eticket_docs : [];
  const next = docs.filter((d) => d.path !== path);
  if (next.length === docs.length) return { error: 'Dokumen tidak ditemukan.' };

  try { await db.storage.from(BUCKET).remove([path]); } catch {}
  const patch = { eticket_docs: next };
  if (next.length === 0) patch.ticket_issued = false;
  const { error } = await db.from('flight_inventory').update(patch).eq('id', pnrId);
  if (error) return { error: error.message };

  revalidatePath('/finance/pnr');
  return { ok: true, docs: next };
}

// Signed URL: lihat (inline) atau download (attachment, nama asli).
export async function getEticketUrl(pnrId, path, download = false) {
  const g = await guard();
  if (g.error) return { error: g.error };
  const db = svc();
  if (!db) return { error: 'Service tidak tersedia.' };

  const { data: pnr } = await db.from('flight_inventory').select('eticket_docs').eq('id', pnrId).maybeSingle();
  const docs = Array.isArray(pnr?.eticket_docs) ? pnr.eticket_docs : [];
  const doc = docs.find((d) => d.path === path);
  if (!doc) return { error: 'Dokumen tidak ditemukan.' };

  const opts = download ? { download: doc.name || 'eticket' } : undefined;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 300, opts);
  if (error || !data?.signedUrl) return { error: 'Gagal membuat link: ' + (error?.message || 'unknown') };
  return { ok: true, url: data.signedUrl };
}
