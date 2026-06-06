// R215t + R215u: Visa Drive sync
// R215u FIX: Better error reporting + per-file try-catch + return detailed results
// Path: lib/actions/visa-drive-sync.js

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

const STORAGE_BUCKET = 'visa-documents';

export async function setVisaDriveFolder(tripId, parentFolderInput) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const parentFolderId = extractFolderId(parentFolderInput);
  if (!parentFolderId) return { error: 'URL/ID folder Drive invalid' };

  const { data: trip } = await supabase.from('trips').select('id, kode_trip, name').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };

  try {
    const tripFolderName = sanitizeFolderName(`${trip.kode_trip || trip.id} - ${trip.name || 'Trip'}`);
    const tripFolder = await findOrCreateFolder(parentFolderId, tripFolderName);

    const { error: updErr } = await supabase
      .from('trips')
      .update({
        visa_drive_parent_folder_id: parentFolderId,
        visa_drive_trip_folder_id: tripFolder.id,
        visa_drive_trip_folder_url: tripFolder.webViewLink,
      })
      .eq('id', tripId);
    if (updErr) return { error: 'Update trip failed: ' + updErr.message };

    revalidatePath(`/visa/${tripId}`);
    return {
      ok: true,
      trip_folder_id: tripFolder.id,
      trip_folder_url: tripFolder.webViewLink,
      sa_email: getServiceAccountEmail(),
    };
  } catch (e) {
    const msg = e?.message || String(e);
    if (/permission|403/i.test(msg)) {
      return { error: `Permission denied. Share folder ke service account: ${getServiceAccountEmail()} sebagai Editor` };
    }
    if (/not.*found|404/i.test(msg)) {
      return { error: 'Folder Drive tidak ditemukan' };
    }
    return { error: 'Drive error: ' + msg };
  }
}

// R215u — Sync with detailed error reporting
export async function syncTripDocsToDrive(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const { data: trip } = await supabase
    .from('trips')
    .select('id, kode_trip, name, visa_drive_trip_folder_id')
    .eq('id', tripId)
    .maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };
  if (!trip.visa_drive_trip_folder_id) return { error: 'Setup folder Drive dulu' };

  const { data: passengers } = await supabase
    .from('trip_passengers')
    .select('id, customer_id, visa_uploaded_docs, visa_drive_pax_folder_id, visa_drive_pax_folder_url')
    .eq('trip_id', tripId);

  const paxList = (passengers || []).filter((p) => Array.isArray(p.visa_uploaded_docs) && p.visa_uploaded_docs.length > 0);
  if (paxList.length === 0) return { ok: true, synced: 0, skipped: 0, errors: 0, message: 'Belum ada doc untuk di-sync' };

  const custIds = paxList.map((p) => p.customer_id).filter(Boolean);
  const { data: customers } = await supabase.from('customers').select('id, name').in('id', custIds);
  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const errorDetails = [];
  const successDetails = [];

  for (const pax of paxList) {
    const cust = custMap[pax.customer_id];
    const paxName = cust?.name || `pax-${pax.id}`;

    let paxFolderId = pax.visa_drive_pax_folder_id;
    let paxFolderUrl = pax.visa_drive_pax_folder_url;

    // Ensure pax folder exists
    try {
      if (!paxFolderId) {
        const folder = await findOrCreateFolder(trip.visa_drive_trip_folder_id, sanitizeFolderName(paxName));
        paxFolderId = folder.id;
        paxFolderUrl = folder.webViewLink;
        await supabase
          .from('trip_passengers')
          .update({
            visa_drive_pax_folder_id: paxFolderId,
            visa_drive_pax_folder_url: paxFolderUrl,
          })
          .eq('id', pax.id);
      }
    } catch (e) {
      errorDetails.push(`Folder create ${paxName}: ${e?.message}`);
      totalErrors++;
      continue;
    }

    const uploads = pax.visa_uploaded_docs || [];
    const updatedUploads = [];

    for (const doc of uploads) {
      // Skip kalau sudah ke-sync
      if (doc.drive_file_id) {
        updatedUploads.push(doc);
        totalSkipped++;
        continue;
      }
      if (!doc.file_path) {
        updatedUploads.push(doc);
        continue;
      }

      try {
        // Download dari Supabase storage
        console.log(`[Sync] Downloading ${doc.file_path}...`);
        const { data: fileData, error: dlErr } = await supabase.storage.from(STORAGE_BUCKET).download(doc.file_path);
        if (dlErr || !fileData) {
          const errMsg = `Download fail ${doc.doc_name}: ${dlErr?.message || 'no data'}`;
          console.error('[Sync]', errMsg);
          errorDetails.push(errMsg);
          updatedUploads.push(doc);
          totalErrors++;
          continue;
        }

        // Convert Blob → Buffer
        const buffer = Buffer.from(await fileData.arrayBuffer());
        console.log(`[Sync] Got ${buffer.length} bytes for ${doc.doc_name}`);

        // Upload ke Drive
        const fileName = `${doc.doc_name || 'doc'}-${doc.original_name || 'file'}`.slice(0, 200);
        const driveFile = await uploadFileToDriveFolder(
          paxFolderId,
          fileName,
          doc.mime_type || 'application/octet-stream',
          buffer
        );

        updatedUploads.push({
          ...doc,
          drive_file_id: driveFile.id,
          drive_file_url: driveFile.webViewLink,
          drive_synced_at: new Date().toISOString(),
        });
        totalSynced++;
        successDetails.push(`${paxName}/${doc.doc_name}`);
      } catch (e) {
        const errMsg = `Upload fail ${paxName}/${doc.doc_name}: ${e?.message || String(e)}`;
        console.error('[Sync]', errMsg, e?.errors);
        errorDetails.push(errMsg);
        updatedUploads.push(doc);
        totalErrors++;
      }
    }

    // Save updated docs (with drive metadata)
    try {
      await supabase
        .from('trip_passengers')
        .update({ visa_uploaded_docs: updatedUploads })
        .eq('id', pax.id);
    } catch (e) {
      console.error(`[Sync] DB update fail for ${paxName}:`, e?.message);
    }
  }

  await supabase
    .from('trips')
    .update({ visa_drive_last_sync_at: new Date().toISOString() })
    .eq('id', tripId);

  revalidatePath(`/visa/${tripId}`);

  return {
    ok: true,
    synced: totalSynced,
    skipped: totalSkipped,
    errors: totalErrors,
    success_details: successDetails.slice(0, 10),
    error_details: errorDetails.slice(0, 10),
  };
}

export async function unlinkVisaDriveFolder(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  await supabase
    .from('trips')
    .update({
      visa_drive_parent_folder_id: null,
      visa_drive_trip_folder_id: null,
      visa_drive_trip_folder_url: null,
    })
    .eq('id', tripId);

  revalidatePath(`/visa/${tripId}`);
  return { ok: true };
}
