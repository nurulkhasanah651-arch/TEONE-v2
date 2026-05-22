'use server';

// Trip documents server actions — Round 57: DOC_CATEGORIES moved to lib/utils/trip-doc-categories.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

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
    trip_id: tripId, category, title, description,
    file_url, file_path, file_type, uploaded_by,
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

  const { data: doc } = await supabase.from('trip_documents').select('file_path').eq('id', docId).maybeSingle();
  if (doc?.file_path) {
    try { await supabase.storage.from('trip-docs').remove([doc.file_path]); } catch {}
  }

  const { error } = await supabase.from('trip_documents').delete().eq('id', docId);
  if (error) return { error: error.message };

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/tl/${tripId}`);
  return { ok: true };
}
