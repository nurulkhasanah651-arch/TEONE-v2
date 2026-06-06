// R215z: Passport Drive Sync — passport scan per peserta ke Google Drive
// Pattern sama kayak visa & payment
// DEFENSIVE: auto-detect field passport URL (passport_url, passport_scan_url, passport_image_url, dll)
// Path: lib/actions/passport-drive-sync.js

'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  findOrCreateFolder,
  uploadFileToDriveFolder,
  sanitizeFolderName,
  extractFolderId,
} from '@/lib/utils/google-drive-helpers';
import { getServiceAccountEmail } from '@/lib/utils/google-sheets';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// R215z CONFIRMED: passport disimpan di customers.passport_photo_url
// (verified from app/(app)/passport-manage/page.jsx query)
const BUCKET_CANDIDATES = ['passports', 'passport', 'documents', 'customer-docs', 'paspor', 'visa-documents', 'public'];

// R215z: passport_photo_url di urutan PERTAMA (confirmed dari schema actual)
const PASSPORT_URL_FIELDS = [
  'passport_photo_url',     // ← PRIMARY (confirmed)
  'passport_url',
  'passport_scan_url',
  'passport_image_url',
  'passport_file_url',
  'paspor_url',
  'paspor_scan_url',
  'photo_passport_url',
];

function findPassportUrl(record) {
  for (const field of PASSPORT_URL_FIELDS) {
    if (record[field] && typeof record[field] === 'string') {
      return { url: record[field], field };
    }
  }
  return null;
}

function extractStoragePath(url) {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  return null;
}

// ============================================================
// 1. SET parent folder Drive
// ============================================================
export async function setPassportDriveFolder(tripId, parentFolderInput) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const parentFolderId = extractFolderId(parentFolderInput);
  if (!parentFolderId) return { error: 'URL/ID folder Drive invalid' };

  const { data: trip } = await supabase.from('trips').select('id, kode_trip, name').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };

  try {
    const tripFolderName = sanitizeFolderName(`${trip.kode_trip || trip.id} - ${trip.name || 'Trip'} - Passports`);
    const tripFolder = await findOrCreateFolder(parentFolderId, tripFolderName);

    const { error: updErr } = await supabase
      .from('trips')
      .update({
        passport_drive_parent_folder_id: parentFolderId,
        passport_drive_trip_folder_id: tripFolder.id,
        passport_drive_trip_folder_url: tripFolder.webViewLink,
      })
      .eq('id', tripId);
    if (updErr) return { error: 'Update trip failed: ' + updErr.message };

    revalidatePath(`/passport-manage`);
    revalidatePath(`/passports`);
    return {
      ok: true,
      trip_folder_id: tripFolder.id,
      trip_folder_url: tripFolder.webViewLink,
      sa_email: getServiceAccountEmail(),
    };
  } catch (e) {
    const msg = e?.message || String(e);
    if (/permission|403/i.test(msg)) {
      return { error: `Permission denied. Share folder ke service account: ${getServiceAccountEmail()} sebagai Manager (di Shared Drive ROOT level)` };
    }
    if (/storage quota/i.test(msg)) {
      return { error: 'Service account gak punya quota. PAKAI SHARED DRIVE (bukan My Drive personal).' };
    }
    return { error: 'Drive error: ' + msg };
  }
}

// ============================================================
// 2. SYNC passports ke Drive (per peserta folder)
// ============================================================
export async function syncTripPassportsToDrive(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const { data: trip } = await supabase
    .from('trips')
    .select('id, kode_trip, name, passport_drive_trip_folder_id')
    .eq('id', tripId)
    .maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };
  if (!trip.passport_drive_trip_folder_id) return { error: 'Setup folder Drive dulu' };

  // Get all peserta + customer (passport biasanya di customer)
  const { data: passengers } = await supabase
    .from('trip_passengers')
    .select('id, customer_id, passport_drive_pax_folder_id, passport_drive_pax_folder_url')
    .eq('trip_id', tripId);

  if (!passengers || passengers.length === 0) {
    return { ok: true, synced: 0, message: 'Belum ada peserta' };
  }

  const custIds = passengers.map((p) => p.customer_id).filter(Boolean);
  const { data: customers } = await supabase.from('customers').select('*').in('id', custIds);
  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const errorDetails = [];
  const successDetails = [];

  for (const pax of passengers) {
    const cust = custMap[pax.customer_id];
    if (!cust) continue;
    const paxName = cust.name || `pax-${pax.id}`;

    // Find passport URL di customer atau trip_passenger
    const passportInfo = findPassportUrl(cust) || findPassportUrl(pax);
    if (!passportInfo) {
      totalSkipped++;
      continue;
    }

    // Skip kalau sudah ke-sync
    if (cust.passport_drive_file_id) {
      totalSkipped++;
      continue;
    }

    let paxFolderId = pax.passport_drive_pax_folder_id;
    let paxFolderUrl = pax.passport_drive_pax_folder_url;

    // Ensure pax folder exists
    try {
      if (!paxFolderId) {
        const folder = await findOrCreateFolder(trip.passport_drive_trip_folder_id, sanitizeFolderName(paxName));
        paxFolderId = folder.id;
        paxFolderUrl = folder.webViewLink;
        await supabase
          .from('trip_passengers')
          .update({
            passport_drive_pax_folder_id: paxFolderId,
            passport_drive_pax_folder_url: paxFolderUrl,
          })
          .eq('id', pax.id);
      }
    } catch (e) {
      errorDetails.push(`Folder create ${paxName}: ${e?.message}`);
      totalErrors++;
      continue;
    }

    // Parse storage path
    const storageInfo = extractStoragePath(passportInfo.url);
    if (!storageInfo) {
      errorDetails.push(`${paxName}: gak bisa parse storage path dari ${passportInfo.url.slice(0, 60)}`);
      totalErrors++;
      continue;
    }

    try {
      // Try download from bucket
      let fileData = null;
      try {
        const { data, error } = await supabase.storage.from(storageInfo.bucket).download(storageInfo.path);
        if (!error && data) fileData = data;
      } catch {}

      // Try alternate buckets
      if (!fileData) {
        for (const bucket of BUCKET_CANDIDATES) {
          if (bucket === storageInfo.bucket) continue;
          try {
            const { data, error } = await supabase.storage.from(bucket).download(storageInfo.path);
            if (!error && data) {
              fileData = data;
              break;
            }
          } catch {}
        }
      }

      if (!fileData) {
        errorDetails.push(`${paxName}: passport file gak ditemukan di storage (${storageInfo.path})`);
        totalErrors++;
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const origFilename = storageInfo.path.split('/').pop() || 'passport';
      const fileName = sanitizeFolderName(`Passport-${paxName}-${origFilename}`).slice(0, 200);
      const mimeType = (fileData.type) || 'application/octet-stream';

      const driveFile = await uploadFileToDriveFolder(paxFolderId, fileName, mimeType, buffer);

      // Save drive metadata ke customer
      await supabase
        .from('customers')
        .update({
          passport_drive_file_id: driveFile.id,
          passport_drive_file_url: driveFile.webViewLink,
          passport_drive_synced_at: new Date().toISOString(),
        })
        .eq('id', cust.id);

      totalSynced++;
      successDetails.push(`${paxName} (${passportInfo.field})`);
    } catch (e) {
      const errMsg = `${paxName}: ${e?.message || String(e)}`;
      console.error('[Passport Sync]', errMsg);
      errorDetails.push(errMsg);
      totalErrors++;
    }
  }

  await supabase
    .from('trips')
    .update({ passport_drive_last_sync_at: new Date().toISOString() })
    .eq('id', tripId);

  revalidatePath(`/passport-manage`);
  revalidatePath(`/passports`);

  return {
    ok: true,
    synced: totalSynced,
    skipped: totalSkipped,
    errors: totalErrors,
    success_details: successDetails.slice(0, 10),
    error_details: errorDetails.slice(0, 10),
  };
}

// ============================================================
// 3. UNLINK
// ============================================================
export async function unlinkPassportDriveFolder(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  await supabase
    .from('trips')
    .update({
      passport_drive_parent_folder_id: null,
      passport_drive_trip_folder_id: null,
      passport_drive_trip_folder_url: null,
    })
    .eq('id', tripId);

  revalidatePath(`/passport-manage`);
  revalidatePath(`/passports`);
  return { ok: true };
}
