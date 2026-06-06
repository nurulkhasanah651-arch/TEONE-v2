// R215y: Payment Drive Sync — bukti transfer per peserta ke Google Drive
// Pattern sama kayak visa-drive-sync (R215t-x)
// DEFENSIVE: auto-detect proof URL field (proof_url, bukti_url, file_url, dll)
// Path: lib/actions/payment-drive-sync.js

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

// R215y: List bucket candidates untuk auto-detect
const BUCKET_CANDIDATES = ['payment-proofs', 'bukti-transfer', 'invoices', 'proofs', 'documents'];

// R215y: List field name candidates untuk auto-detect URL bukti
const PROOF_URL_FIELDS = ['proof_url', 'bukti_url', 'bukti_transfer_url', 'file_url', 'attachment_url', 'transfer_proof_url'];

function findProofUrl(record) {
  for (const field of PROOF_URL_FIELDS) {
    if (record[field] && typeof record[field] === 'string') {
      return { url: record[field], field };
    }
  }
  return null;
}

// Extract storage path from Supabase storage URL
function extractStoragePath(url) {
  if (!url) return null;
  // Format: https://xxx.supabase.co/storage/v1/object/public/{bucket}/{path}
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  return null;
}

// ============================================================
// 1. SET parent folder Drive
// ============================================================
export async function setPaymentDriveFolder(tripId, parentFolderInput) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const parentFolderId = extractFolderId(parentFolderInput);
  if (!parentFolderId) return { error: 'URL/ID folder Drive invalid' };

  const { data: trip } = await supabase.from('trips').select('id, kode_trip, name').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };

  try {
    const tripFolderName = sanitizeFolderName(`${trip.kode_trip || trip.id} - ${trip.name || 'Trip'} - Payments`);
    const tripFolder = await findOrCreateFolder(parentFolderId, tripFolderName);

    const { error: updErr } = await supabase
      .from('trips')
      .update({
        payment_drive_parent_folder_id: parentFolderId,
        payment_drive_trip_folder_id: tripFolder.id,
        payment_drive_trip_folder_url: tripFolder.webViewLink,
      })
      .eq('id', tripId);
    if (updErr) return { error: 'Update trip failed: ' + updErr.message };

    revalidatePath(`/finance/payments/${tripId}`);
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
// 2. SYNC payment proofs ke Drive (per peserta folder)
// ============================================================
export async function syncTripPaymentsToDrive(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const { data: trip } = await supabase
    .from('trips')
    .select('id, kode_trip, name, payment_drive_trip_folder_id')
    .eq('id', tripId)
    .maybeSingle();
  if (!trip) return { error: 'Trip gak ketemu' };
  if (!trip.payment_drive_trip_folder_id) return { error: 'Setup folder Drive dulu (klik "Setup Drive Folder")' };

  // Get all peserta
  const { data: passengers } = await supabase
    .from('trip_passengers')
    .select('id, customer_id, payment_drive_pax_folder_id, payment_drive_pax_folder_url')
    .eq('trip_id', tripId);

  if (!passengers || passengers.length === 0) {
    return { ok: true, synced: 0, message: 'Belum ada peserta' };
  }

  const paxIds = passengers.map((p) => p.id);

  // Get all payments + invoices yg ada proof URL
  const { data: payments } = await supabase
    .from('participant_payments')
    .select('*')
    .in('passenger_id', paxIds);

  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .in('passenger_id', paxIds);

  // Get customer names
  const custIds = passengers.map((p) => p.customer_id).filter(Boolean);
  const { data: customers } = await supabase.from('customers').select('id, name').in('id', custIds);
  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));

  // Group items per peserta
  const itemsByPax = {};
  for (const pax of passengers) {
    itemsByPax[pax.id] = { payments: [], invoices: [] };
  }
  for (const p of (payments || [])) {
    if (itemsByPax[p.passenger_id]) itemsByPax[p.passenger_id].payments.push(p);
  }
  for (const inv of (invoices || [])) {
    if (itemsByPax[inv.passenger_id]) itemsByPax[inv.passenger_id].invoices.push(inv);
  }

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const errorDetails = [];
  const successDetails = [];

  for (const pax of passengers) {
    const cust = custMap[pax.customer_id];
    const paxName = cust?.name || `pax-${pax.id}`;

    let paxFolderId = pax.payment_drive_pax_folder_id;
    let paxFolderUrl = pax.payment_drive_pax_folder_url;

    const { payments: paxPayments, invoices: paxInvoices } = itemsByPax[pax.id] || { payments: [], invoices: [] };

    // Skip kalau peserta gak punya proof apapun
    const paymentsWithProof = paxPayments.filter((p) => findProofUrl(p));
    const invoicesWithProof = paxInvoices.filter((i) => findProofUrl(i));
    if (paymentsWithProof.length === 0 && invoicesWithProof.length === 0) {
      totalSkipped++;
      continue;
    }

    // Ensure pax folder exists
    try {
      if (!paxFolderId) {
        const folder = await findOrCreateFolder(trip.payment_drive_trip_folder_id, sanitizeFolderName(paxName));
        paxFolderId = folder.id;
        paxFolderUrl = folder.webViewLink;
        await supabase
          .from('trip_passengers')
          .update({
            payment_drive_pax_folder_id: paxFolderId,
            payment_drive_pax_folder_url: paxFolderUrl,
          })
          .eq('id', pax.id);
      }
    } catch (e) {
      errorDetails.push(`Folder create ${paxName}: ${e?.message}`);
      totalErrors++;
      continue;
    }

    // Process payments
    for (const payment of paxPayments) {
      const proofInfo = findProofUrl(payment);
      if (!proofInfo) continue;
      if (payment.drive_file_id) {
        totalSkipped++;
        continue;
      }

      const storageInfo = extractStoragePath(proofInfo.url);
      if (!storageInfo) {
        errorDetails.push(`${paxName}/${payment.type}: gak bisa parse storage path dari ${proofInfo.url.slice(0, 60)}`);
        totalErrors++;
        continue;
      }

      try {
        // Try download from each candidate bucket
        let fileData = null;
        let bucketUsed = storageInfo.bucket;
        try {
          const { data, error } = await supabase.storage.from(bucketUsed).download(storageInfo.path);
          if (!error && data) fileData = data;
        } catch {}

        if (!fileData) {
          // Try alternate buckets
          for (const bucket of BUCKET_CANDIDATES) {
            if (bucket === storageInfo.bucket) continue;
            try {
              const { data, error } = await supabase.storage.from(bucket).download(storageInfo.path);
              if (!error && data) {
                fileData = data;
                bucketUsed = bucket;
                break;
              }
            } catch {}
          }
        }

        if (!fileData) {
          errorDetails.push(`${paxName}/${payment.type}: file gak ditemukan di storage`);
          totalErrors++;
          continue;
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());

        // File name: {milestone}-{filename}
        const origFilename = storageInfo.path.split('/').pop() || 'bukti';
        const fileName = sanitizeFolderName(`${payment.type || 'Payment'}-${origFilename}`).slice(0, 200);
        const mimeType = (fileData.type) || 'application/octet-stream';

        const driveFile = await uploadFileToDriveFolder(paxFolderId, fileName, mimeType, buffer);

        // Save drive metadata
        await supabase
          .from('participant_payments')
          .update({
            drive_file_id: driveFile.id,
            drive_file_url: driveFile.webViewLink,
            drive_synced_at: new Date().toISOString(),
          })
          .eq('id', payment.id);

        totalSynced++;
        successDetails.push(`${paxName}/${payment.type}`);
      } catch (e) {
        const errMsg = `${paxName}/${payment.type}: ${e?.message || String(e)}`;
        console.error('[Payment Sync]', errMsg);
        errorDetails.push(errMsg);
        totalErrors++;
      }
    }

    // Process invoices (kalau ada proof)
    for (const invoice of paxInvoices) {
      const proofInfo = findProofUrl(invoice);
      if (!proofInfo) continue;
      if (invoice.drive_file_id) {
        totalSkipped++;
        continue;
      }

      const storageInfo = extractStoragePath(proofInfo.url);
      if (!storageInfo) continue;

      try {
        let fileData = null;
        try {
          const { data, error } = await supabase.storage.from(storageInfo.bucket).download(storageInfo.path);
          if (!error && data) fileData = data;
        } catch {}

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
          errorDetails.push(`${paxName}/INV-${invoice.invoice_no}: file gak ditemukan`);
          totalErrors++;
          continue;
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const origFilename = storageInfo.path.split('/').pop() || 'bukti';
        const fileName = sanitizeFolderName(`INV-${invoice.invoice_no || invoice.id}-${origFilename}`).slice(0, 200);
        const mimeType = (fileData.type) || 'application/octet-stream';

        const driveFile = await uploadFileToDriveFolder(paxFolderId, fileName, mimeType, buffer);

        await supabase
          .from('invoices')
          .update({
            drive_file_id: driveFile.id,
            drive_file_url: driveFile.webViewLink,
            drive_synced_at: new Date().toISOString(),
          })
          .eq('id', invoice.id);

        totalSynced++;
        successDetails.push(`${paxName}/INV-${invoice.invoice_no}`);
      } catch (e) {
        const errMsg = `${paxName}/INV-${invoice.invoice_no || invoice.id}: ${e?.message}`;
        errorDetails.push(errMsg);
        totalErrors++;
      }
    }
  }

  await supabase
    .from('trips')
    .update({ payment_drive_last_sync_at: new Date().toISOString() })
    .eq('id', tripId);

  revalidatePath(`/finance/payments/${tripId}`);

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
export async function unlinkPaymentDriveFolder(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  await supabase
    .from('trips')
    .update({
      payment_drive_parent_folder_id: null,
      payment_drive_trip_folder_id: null,
      payment_drive_trip_folder_url: null,
    })
    .eq('id', tripId);

  revalidatePath(`/finance/payments/${tripId}`);
  return { ok: true };
}
