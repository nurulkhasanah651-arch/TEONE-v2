'use server';

// Admin: kelola konten jualan (storefront) untuk sebuah trip.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}
function intOrNull(v) { const n = parseInt(String(v || '').replace(/[^0-9]/g, '')); return Number.isFinite(n) ? n : null; }

export async function updateTripPublicContent(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const isPublished = formData.get('is_published') === 'on' || formData.get('is_published') === '1';
  let slug = (formData.get('slug') || '').toString().trim();
  const name = (formData.get('_name') || '').toString().trim();
  if (isPublished && !slug && name) slug = slugify(name);

  // parse itinerary: tiap baris "Judul :: Detail"
  const itinRaw = (formData.get('itinerary') || '').toString();
  const itinerary = itinRaw.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const [title, ...rest] = l.split('::');
    return { day: i + 1, title: (title || '').trim(), detail: rest.join('::').trim() };
  });

  const update = {
    is_published: isPublished,
    slug: slug || null,
    cover_image_url: (formData.get('cover_image_url') || '').toString().trim() || null,
    description: (formData.get('description') || '').toString().trim() || null,
    highlights: (formData.get('highlights') || '').toString().trim() || null,
    public_price: intOrNull(formData.get('public_price')),
    dp_amount: intOrNull(formData.get('dp_amount')),
    included: (formData.get('included') || '').toString().trim() || null,
    excluded: (formData.get('excluded') || '').toString().trim() || null,
    itinerary: itinerary.length ? itinerary : null,
  };

  const { error } = await supabase.from('trips').update(update).eq('id', tripId);
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) return { error: 'Slug sudah dipakai trip lain. Ganti slug.' };
    return { error: 'Gagal simpan: ' + error.message };
  }
  revalidatePath(`/trips/${tripId}/edit`);
  return { ok: true, slug: slug || null };
}
