'use server';

// Round 131: tlreport actions — add googleReviewLink, remove totalPettyCashSpent
// Path: lib/actions/tlreport.js

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { revalidatePath } from 'next/cache';
import { runWithBrand } from '@/lib/supabase/service-env';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// PRE-DEPARTURE CHECKLIST
export async function toggleChecklistItem(...args) {
  const __brand = args[4];
  return runWithBrand(__brand, () => _toggleChecklistItem(...args));
}
async function _toggleChecklistItem(tripId, field, value, userEmail = '') {
  if (!tripId || !field) return { error: 'tripId & field wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  const validFields = [
    'briefing_done', 'documents_complete', 'manifest_received',
    'roomlist_received', 'petty_cash_received', 'emergency_contact_confirmed',
    'flight_ticket_confirmed', 'group_chat_created', 'vouchers_received',
  ];
  if (!validFields.includes(field)) return { error: 'field invalid' };

  try {
    const { data: existing } = await supabase
      .from('tl_checklist').select('id').eq('trip_id', tripId).maybeSingle();

    const updateData = {
      [field]: value,
      [`${field}_at`]: value ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      const { error } = await supabase.from('tl_checklist').update(updateData).eq('id', existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from('tl_checklist').insert({ trip_id: tripId, ...updateData });
      if (error) return { error: error.message };
    }

    revalidatePath(`/tl/${tripId}`);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function saveChecklistNotes(...args) {
  const __brand = args[2];
  return runWithBrand(__brand, () => _saveChecklistNotes(...args));
}
async function _saveChecklistNotes(tripId, notes) {
  if (!tripId) return { error: 'tripId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: existing } = await supabase
      .from('tl_checklist').select('id').eq('trip_id', tripId).maybeSingle();

    if (existing) {
      await supabase.from('tl_checklist').update({
        pre_departure_notes: notes,
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id);
    } else {
      await supabase.from('tl_checklist').insert({ trip_id: tripId, pre_departure_notes: notes });
    }
    revalidatePath(`/tl/${tripId}`);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

// FINAL REPORT — ROUND 131: googleReviewLink added, totalPettyCashSpent removed from params
export async function saveFinalReport(...args) {
  const __brand = args[0] && args[0].brand;
  return runWithBrand(__brand, () => _saveFinalReport(...args));
}
async function _saveFinalReport({
  tripId,
  documentationLink,
  reviewUploadLink,
  googleReviewLink,
  overallRating,
  highlights,
  issuesEncountered,
  suggestions,
  submitted = false,
  userEmail = '',
}) {
  if (!tripId) return { error: 'tripId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data: existing } = await supabase
      .from('tl_final_report').select('id').eq('trip_id', tripId).maybeSingle();

    const reportData = {
      documentation_link: documentationLink,
      review_upload_link: reviewUploadLink,
      google_review_link: googleReviewLink,
      overall_rating: overallRating ? Number(overallRating) : null,
      highlights,
      issues_encountered: issuesEncountered,
      suggestions,
      updated_at: new Date().toISOString(),
    };

    if (submitted) {
      reportData.submitted = true;
      reportData.submitted_at = new Date().toISOString();
      reportData.submitted_by = userEmail;
    }

    if (existing) {
      const { error } = await supabase.from('tl_final_report').update(reportData).eq('id', existing.id);
      if (error) {
        // Retry without google_review_link kalau column belum ada
        if (error.message?.includes('google_review_link')) {
          delete reportData.google_review_link;
          const r2 = await supabase.from('tl_final_report').update(reportData).eq('id', existing.id);
          if (r2.error) return { error: r2.error.message };
        } else {
          return { error: error.message };
        }
      }
    } else {
      const { error } = await supabase.from('tl_final_report').insert({ trip_id: tripId, ...reportData });
      if (error) {
        if (error.message?.includes('google_review_link')) {
          delete reportData.google_review_link;
          const r2 = await supabase.from('tl_final_report').insert({ trip_id: tripId, ...reportData });
          if (r2.error) return { error: r2.error.message };
        } else {
          return { error: error.message };
        }
      }
    }

    revalidatePath(`/tl/${tripId}`);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function reviewReportByOps(tripId, opsNotes, userEmail = '') {
  if (!tripId) return { error: 'tripId wajib' };
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { error } = await supabase.from('tl_final_report').update({
      reviewed_by_ops: true,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userEmail,
      ops_notes: opsNotes,
    }).eq('trip_id', tripId);
    if (error) return { error: error.message };

    revalidatePath(`/tl/${tripId}`);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}

// VENDOR REVIEWS
export async function addVendorReview(...args) {
  const __brand = args[0] && args[0].brand;
  return runWithBrand(__brand, () => _addVendorReview(...args));
}
async function _addVendorReview({
  tripId, vendorType, vendorName, cityCountry,
  rating, serviceRating, cleanlinessRating, valueRating,
  pros, cons, recommendation, notes, userEmail = '',
}) {
  if (!tripId || !vendorType || !vendorName) return { error: 'tripId/vendorType/vendorName wajib' };
  if (!rating || rating < 1 || rating > 5) return { error: 'rating 1-5' };

  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };

  try {
    const { data, error } = await supabase.from('tl_vendor_reviews').insert({
      trip_id: tripId,
      vendor_type: vendorType,
      vendor_name: vendorName,
      city_country: cityCountry,
      rating: Number(rating),
      service_rating: serviceRating ? Number(serviceRating) : null,
      cleanliness_rating: cleanlinessRating ? Number(cleanlinessRating) : null,
      value_rating: valueRating ? Number(valueRating) : null,
      pros, cons, recommendation, notes,
      reviewed_by: userEmail,
    }).select().single();
    if (error) return { error: error.message };

    revalidatePath(`/tl/${tripId}`);
    return { ok: true, review: data };
  } catch (e) {
    return { error: e?.message };
  }
}

export async function deleteVendorReview(...args) {
  const __brand = args[2];
  return runWithBrand(__brand, () => _deleteVendorReview(...args));
}
async function _deleteVendorReview(reviewId, tripId) {
  const supabase = getServiceClient();
  if (!supabase) return { error: 'Service role belum di-set' };
  try {
    const { error } = await supabase.from('tl_vendor_reviews').delete().eq('id', reviewId);
    if (error) return { error: error.message };
    if (tripId) revalidatePath(`/tl/${tripId}`);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}
