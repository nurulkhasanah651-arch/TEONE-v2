'use server';

// Admin: kelola konten jualan (storefront) untuk sebuah trip.
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

function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}
function intOrNull(v) { const n = parseInt(String(v || '').replace(/[^0-9]/g, '')); return Number.isFinite(n) ? n : null; }

export async function updateTripPublicContent(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const isPublished = formData.get('is_published') === 'on' || formData.get('is_published') === '1';
  let slug = slugify((formData.get('slug') || '').toString()); // selalu slugify (huruf kecil, tanpa spasi)
  const name = (formData.get('_name') || '').toString().trim();
  if (isPublished && !slug && name) slug = slugify(name);

  // Itinerary: utamakan format terstruktur (JSON, ada foto per hari);
  // fallback ke textarea lama "Judul :: Detail".
  let itinerary = [];
  const itinJson = (formData.get('itinerary_json') || '').toString();
  if (itinJson) {
    try {
      const arr = JSON.parse(itinJson);
      if (Array.isArray(arr)) {
        itinerary = arr
          .map((d, i) => ({
            day: i + 1,
            title: String(d?.title || '').trim(),
            detail: String(d?.detail || '').trim(),
            image: (typeof d?.image === 'string' && d.image) ? d.image : null,
          }))
          .filter((d) => d.title || d.detail || d.image);
      }
    } catch { /* abaikan, pakai fallback */ }
  }
  if (!itinerary.length) {
    const itinRaw = (formData.get('itinerary') || '').toString();
    itinerary = itinRaw.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
      const [title, ...rest] = l.split('::');
      return { day: i + 1, title: (title || '').trim(), detail: rest.join('::').trim(), image: null };
    });
  }

  const update = {
    is_published: isPublished,
    is_flash_sale: formData.get('is_flash_sale') === 'on' || formData.get('is_flash_sale') === '1',
    is_best_seller: formData.get('is_best_seller') === 'on' || formData.get('is_best_seller') === '1',
    slug: slug || null,
    cover_image_url: (formData.get('cover_image_url') || '').toString().trim() || null,
    description: (formData.get('description') || '').toString().trim() || null,
    highlights: (formData.get('highlights') || '').toString().trim() || null,
    public_price: intOrNull(formData.get('public_price')),
    dp_amount: intOrNull(formData.get('dp_amount')),
    included: (formData.get('included') || '').toString().trim() || null,
    excluded: (formData.get('excluded') || '').toString().trim() || null,
    itinerary: itinerary.length ? itinerary : null,
    syarat_ketentuan: (formData.get('syarat_ketentuan') || '').toString().trim() || null,
    syarat_visa: (formData.get('syarat_visa') || '').toString().trim() || null,
  };

  // galeri foto (JSON array URL dari hidden field)
  const galRaw = (formData.get('gallery_images') || '').toString();
  if (galRaw) {
    try {
      const arr = JSON.parse(galRaw);
      if (Array.isArray(arr)) update.gallery_images = arr.filter((u) => typeof u === 'string' && u);
    } catch { /* abaikan kalau bukan JSON valid */ }
  }

  const { error } = await supabase.from('trips').update(update).eq('id', tripId);
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return { error: 'Slug sudah dipakai trip lain. Ganti slug.' };
    return { error: 'Gagal simpan: ' + error.message };
  }
  revalidatePath(`/trips/${tripId}/edit`);
  return { ok: true, slug: slug || null };
}


// Upload foto storefront (cover/galeri) langsung dari perangkat → bucket publik.
export async function uploadStorefrontImage(formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const file = formData.get('file');
  const tripId = (formData.get('tripId') || '').toString() || 'misc';
  if (!file || typeof file === 'string') return { error: 'File tidak ada' };
  if (file.size > 8 * 1024 * 1024) return { error: 'Foto terlalu besar (maks 8MB)' };
  if (!/^image\//.test(file.type || '')) return { error: 'File harus berupa gambar' };

  const db = svc();
  if (!db) return { error: 'Storage tidak tersedia' };

  const ext = (file.name || 'foto.jpg').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `trips/${tripId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await db.storage.from('storefront-images').upload(path, buf, {
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (upErr) return { error: 'Gagal upload: ' + upErr.message };

  const { data: pub } = db.storage.from('storefront-images').getPublicUrl(path);
  return { ok: true, url: pub?.publicUrl || null };
}

// ============================================================
// TEMPLATE KONTEN JUALAN — pakai konten trip lain sbg template
// ============================================================
export async function listStorefrontTemplates(excludeTripId) {
  const db = svc() || createClient();
  try {
    const { data } = await db
      .from('trips')
      .select('id, name, kode_trip, itinerary, cover_image_url, description')
      .order('created_at', { ascending: false })
      .limit(300);
    const rows = (data || []).filter((t) => {
      if (excludeTripId && String(t.id) === String(excludeTripId)) return false;
      const hasItin = Array.isArray(t.itinerary) && t.itinerary.length > 0;
      return hasItin || t.cover_image_url || t.description;
    }).map((t) => ({ id: t.id, name: t.name || t.kode_trip || `Trip ${t.id}`, kode_trip: t.kode_trip || '' }));
    return { ok: true, templates: rows };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}

export async function getStorefrontTemplate(sourceTripId) {
  if (!sourceTripId) return { error: 'sumber kosong' };
  const db = svc() || createClient();
  try {
    const { data: t } = await db
      .from('trips')
      .select('cover_image_url, gallery_images, itinerary, highlights, description, included, excluded, syarat_visa, syarat_ketentuan')
      .eq('id', sourceTripId)
      .maybeSingle();
    if (!t) return { error: 'Trip sumber tidak ditemukan' };
    return {
      ok: true,
      data: {
        cover_image_url: t.cover_image_url || '',
        gallery_images: Array.isArray(t.gallery_images) ? t.gallery_images : [],
        itinerary: Array.isArray(t.itinerary)
          ? t.itinerary.map((d) => ({ title: d.title || '', detail: d.detail || '', image: d.image || '' }))
          : [],
        highlights: t.highlights || '',
        description: t.description || '',
        included: t.included || '',
        excluded: t.excluded || '',
        syarat_visa: t.syarat_visa || '',
        syarat_ketentuan: t.syarat_ketentuan || '',
      },
    };
  } catch (e) {
    return { error: e?.message || 'gagal' };
  }
}
