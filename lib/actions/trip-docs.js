'use server';

// Trip documents — upload metadata, URL paste, or Supabase Storage

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export const DOC_CATEGORIES = [
  { value: 'hotel_voucher',  label: 'Hotel Voucher',     icon: '🏨' },
  { value: 'flight_ticket',  label: 'Tiket Pesawat',     icon: '✈️' },
  { value: 'vendor_contact', label: 'Kontak Vendor',     icon: '📞' },
  { value: 'transport',      label: 'Transport / Bus',   icon: '🚌' },
  { value: 'itinerary',      label: 'Itinerary',         icon: '📋' },
  { value: 'manifest',       label: 'Manifest',          icon: '👥' },
  { value: 'roomlist',       label: 'Roomlist',          icon: '🛏️' },
  { value: 'visa_invitation',label: 'Visa Invitation',   icon: '🛂' },
  { value: 'insurance',      label: 'Asuransi Polis',    icon: '🏥' },
  { value: 'other',          label: 'Dokumen Lain',      icon: '📄' },
];

// Add document — kalau pakai file: gunakan client-side upload, action ini cuma save metadata
export async function addTripDocument(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const category = formData.get('category') || 'other';
  const title = (formData.get('title') || '').trim();
  const description = (formData.get('description') || '').trim() || null;
  const file_url = (formData.get('file_url') || '').trim() || null;
  const file_path = (formData.get('file_path') || '').trim() || null;
  const file_type = (formData.get('file_type') || 'link').trim();

  if (!title) return { error: 'Judul dokumen wajib' };
  if (!file_url) return { error: 'Upload file atau paste URL dulu' };

  const uploaded_by = user.user_metadata?.full_name || user.email || 'unknown';

  const { error } = await supabase.from('trip_documents').insert({
    trip_id: tripId,
    category,
    title,
    description,
    file_url,
    file_path,
    file_type,
    uploaded_by,
  });

  if (error) return { error: error.message };

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}

export async function deleteTripDocument(docId, tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Get doc untuk dapat file_path (kalau dari Supabase Storage)
  const { data: doc } = await supabase.from('trip_documents').select('file_path').eq('id', docId).maybeSingle();

  // Delete dari storage kalau ada file_path
  if (doc?.file_path) {
    try {
      await supabase.storage.from('trip-docs').remove([doc.file_path]);
    } catch {
      // Skip kalau gagal — tetap delete record
    }
  }

  const { error } = await supabase.from('trip_documents').delete().eq('id', docId);
  if (error) return { error: error.message };

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}
