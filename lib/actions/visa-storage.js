// R215o: Visa result file upload (langsung ke Supabase storage)
// Path: lib/actions/visa-storage.js

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const BUCKET = 'visa-results';

// R215o: Upload visa result file (foto/PDF) langsung ke Supabase storage
// Return: public URL untuk dipake di WA attachment + visa_result_photo_url
export async function uploadVisaResultFile(passengerId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const file = formData.get('visa_file');
  if (!file || typeof file === 'string') return { error: 'File gak ada' };
  if (file.size === 0) return { error: 'File kosong' };
  if (file.size > 10 * 1024 * 1024) return { error: 'File terlalu besar (max 10MB)' };

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return { error: 'Format harus JPG/PNG/WEBP/PDF' };
  }

  // Fetch peserta untuk dapat trip_id
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  // R215o: File path = visa-results/{trip_id}/{passenger_id}-{timestamp}.ext
  const ext = file.name.split('.').pop().toLowerCase();
  const filePath = `${pax.trip_id}/${passengerId}-${Date.now()}.${ext}`;

  try {
    // Upload to Supabase storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { data: uploadData, error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) return { error: 'Upload failed: ' + uploadErr.message };

    // Get public URL
    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    const publicUrl = publicData?.publicUrl;
    if (!publicUrl) return { error: 'Gak bisa get public URL' };

    revalidatePath(`/visa/${pax.trip_id}`);
    return { ok: true, file_url: publicUrl, file_path: filePath };
  } catch (e) {
    return { error: 'Upload error: ' + (e?.message || String(e)) };
  }
}

// R215o: Delete visa result file (kalau mau replace)
export async function deleteVisaResultFile(passengerId, filePath) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  if (!filePath) return { error: 'File path kosong' };

  const { error } = await supabase.storage.from(BUCKET).remove([filePath]);
  if (error) return { error: 'Delete failed: ' + error.message };

  return { ok: true };
}

// R215o: Update trip message template override
export async function updateTripMessageTemplate(tripId, templateKey, customText) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  // Fetch current overrides
  const { data: trip } = await supabase
    .from('trips')
    .select('visa_message_templates')
    .eq('id', tripId)
    .maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };

  const current = trip.visa_message_templates || {};
  const next = { ...current };
  if (customText && customText.trim()) {
    next[templateKey] = customText;
  } else {
    delete next[templateKey]; // Empty = reset ke default
  }

  const { error } = await supabase
    .from('trips')
    .update({ visa_message_templates: next })
    .eq('id', tripId);

  if (error) {
    if (/visa_message_templates/.test(error.message)) {
      return { error: 'Kolom visa_message_templates belum ada — jalankan SQL R215o dulu' };
    }
    return { error: 'Update failed: ' + error.message };
  }

  revalidatePath(`/visa/${tripId}`);
  return { ok: true, is_default: !customText || !customText.trim() };
}

// R215o: Update visa return method per peserta
export async function updateVisaReturnMethod(passengerId, method) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const validMethods = ['kurir', 'team_carry', 'office_pickup', null];
  const value = validMethods.includes(method) ? method : null;

  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('trip_id')
    .eq('id', passengerId)
    .maybeSingle();
  if (!pax) return { error: 'Peserta gak ketemu' };

  const { error } = await supabase
    .from('trip_passengers')
    .update({ visa_return_method: value })
    .eq('id', passengerId);

  if (error) {
    if (/visa_return_method/.test(error.message)) {
      return { error: 'Kolom visa_return_method belum ada — jalankan SQL R215o' };
    }
    return { error: 'Update failed: ' + error.message };
  }

  revalidatePath(`/visa/${pax.trip_id}`);
  return { ok: true };
}
