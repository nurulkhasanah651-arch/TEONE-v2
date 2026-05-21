'use server';

// Visa server actions — trip-level info (negara+catatan) + per-participant status/docs

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

// Group info — HANYA negara tujuan & catatan group (status & biometric per peserta)
export async function updateVisaGroupInfo(tripId, formData) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const visa_country = (formData.get('visa_country') || '').trim() || null;
  const visa_notes = (formData.get('visa_notes') || '').trim() || null;

  const { error } = await supabase.from('trips').update({
    visa_country, visa_notes,
  }).eq('id', tripId);

  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}`);
  revalidatePath('/visa');
  return { ok: true };
}

export async function updateDocTemplate(tripId, docs) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!Array.isArray(docs)) return { error: 'Format invalid' };
  const template = docs.filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim());

  const { error } = await supabase.from('trips').update({ visa_doc_template: template }).eq('id', tripId);
  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}`);
  return { ok: true };
}

export async function toggleParticipantDoc(passengerId, tripId, docName, currentDocs) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const existing = Array.isArray(currentDocs) ? [...currentDocs] : [];
  const idx = existing.findIndex((d) => d.name === docName);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], complete: !existing[idx].complete };
  } else {
    existing.push({ name: docName, complete: true, notes: '' });
  }

  const { error } = await supabase.from('trip_passengers').update({ visa_docs: existing }).eq('id', passengerId);
  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}`);
  return { ok: true };
}

export async function updateParticipantDocNotes(passengerId, tripId, docName, notes, currentDocs) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const existing = Array.isArray(currentDocs) ? [...currentDocs] : [];
  const idx = existing.findIndex((d) => d.name === docName);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], notes };
  } else {
    existing.push({ name: docName, complete: false, notes });
  }

  const { error } = await supabase.from('trip_passengers').update({ visa_docs: existing }).eq('id', passengerId);
  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}`);
  return { ok: true };
}

export async function updateParticipantVisaNotes(passengerId, tripId, notes) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { error } = await supabase
    .from('trip_passengers')
    .update({ visa_personal_notes: notes || null })
    .eq('id', passengerId);

  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}`);
  return { ok: true };
}

// Update per-passenger visa status & biometric date
export async function updateParticipantVisaStatus(passengerId, tripId, status, biometricDate) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const updates = {};
  if (status !== undefined) updates.visa_status = status;
  if (biometricDate !== undefined) updates.visa_biometric_date = biometricDate || null;

  const { error } = await supabase
    .from('trip_passengers')
    .update(updates)
    .eq('id', passengerId);

  if (error) return { error: error.message };

  revalidatePath(`/visa/${tripId}`);
  return { ok: true };
}
