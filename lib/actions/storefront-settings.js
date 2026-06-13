'use server';

// Kelola konten Etalase (storefront): foto header slider + region (judul + foto).
// Disimpan di tabel storefront_settings (1 row id=1) per brand DB.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvcClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createSvcClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function slugKey(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').slice(0, 40) || `r${Date.now().toString(36)}`;
}

// READ (auth) — untuk panel admin
export async function getStorefrontSettings() {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc();
  if (!db) return { error: 'Storage tidak tersedia' };
  const { data } = await db.from('storefront_settings').select('*').eq('id', 1).maybeSingle();
  return {
    ok: true,
    hero_images: Array.isArray(data?.hero_images) ? data.hero_images : [],
    regions: Array.isArray(data?.regions) ? data.regions : [],
  };
}

async function ensureRow(db) {
  await db.from('storefront_settings').upsert({ id: 1 }, { onConflict: 'id' });
}

// SAVE foto header (array URL)
export async function saveHeroImages(urls) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc();
  if (!db) return { error: 'Storage tidak tersedia' };
  const clean = (Array.isArray(urls) ? urls : []).map((u) => String(u || '').trim()).filter(Boolean).slice(0, 12);
  await ensureRow(db);
  const { error } = await db.from('storefront_settings')
    .update({ hero_images: clean, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) return { error: 'Gagal simpan: ' + error.message };
  revalidatePath('/home');
  revalidatePath('/etalase');
  return { ok: true, count: clean.length };
}

// SAVE region (array of {key,label,icon,image,kw})
export async function saveRegions(regions) {
  const auth = createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const db = svc();
  if (!db) return { error: 'Storage tidak tersedia' };

  const clean = (Array.isArray(regions) ? regions : [])
    .map((r) => {
      const label = String(r?.label || '').trim();
      if (!label) return null;
      let kw = r?.kw;
      if (typeof kw === 'string') kw = kw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
      if (!Array.isArray(kw)) kw = [];
      return {
        key: String(r?.key || '').trim() || slugKey(label),
        label,
        icon: String(r?.icon || '🌍').trim().slice(0, 4) || '🌍',
        image: String(r?.image || '').trim(),
        kw,
      };
    })
    .filter(Boolean)
    .slice(0, 20);

  await ensureRow(db);
  const { error } = await db.from('storefront_settings')
    .update({ regions: clean, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) return { error: 'Gagal simpan: ' + error.message };
  revalidatePath('/home');
  revalidatePath('/trip');
  revalidatePath('/etalase');
  return { ok: true, count: clean.length };
}
