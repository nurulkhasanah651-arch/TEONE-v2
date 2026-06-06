// R215y² — Payment Drive Sync (FROM INVOICE_PAYMENTS TABLE — confirmed schema)
// Path: lib/actions/payment-drive-sync.js
// REPLACE versi R215y — sekarang query invoice_payments.proof_url (verified status)
// Peserta matching via customer_name / customer_phone dari invoices

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

const BUCKET_CANDIDATES = [
  'payment-proofs', 'bukti-transfer', 'invoice-payments', 'invoices', 'proofs',
  'documents', 'public', 'visa-documents',
];

function extractStoragePath(url) {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  return null;
}

function normalizePhone(p) {
  if (!p) return '';
  return String(p).replace(/\D/g, '').replace(/^0/, '62');
}

function normalizeName(n) {
  if (!n) return '';
  return String(n).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ============================================================
// 1. SET parent folder Drive (folder per trip)
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

    revalidatePath(`/invoices`);
    revalidatePath(`/finance/payments`);
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
// 2. SYNC invoice_payments (verified bukti transfer) ke Drive
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
  if (!trip.payment_drive_trip_folder_id) return { error: 'Setup folder Drive dulu' };

  // Get invoices buat trip ini
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_no, milestone, customer_name, customer_phone, customer_id, trip_id, amount')
    .eq('trip_id', tripId);

  if (!invoices || invoices.length === 0) {
    return { ok: true, synced: 0, message: 'Belum ada invoice untuk trip ini' };
  }

  // Get verified invoice_payments (yg punya bukti & udah di-approve)
  const invIds = invoices.map((i) => i.id);
  // R215y² FIX: status di DB actual = 'approved' / 'verified' / 'pending' / 'rejected'
  // Sync semua kecuali rejected (mau approved, verified, atau pending)
  const { data: payments } = await supabase
    .from('invoice_payments')
    .select('id, invoice_id, amount, payment_date, payment_method, status, proof_url, drive_file_id')
    .in('invoice_id', invIds)
    .not('status', 'eq', 'rejected');

  if (!payments || payments.length === 0) {
    return { ok: true, synced: 0, message: 'Belum ada bukti transfer dari peserta' };
  }

  // Get all peserta + customers buat trip ini (buat matching)
  const { data: passengers } = await supabase
    .from('trip_passengers')
    .select('id, customer_id, payment_drive_pax_folder_id, payment_drive_pax_folder_url')
    .eq('trip_id', tripId);

  const custIds = (passengers || []).map((p) => p.customer_id).filter(Boolean);
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, first_name, surname, phone')
    .in('id', custIds);

  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));
  const invMap = Object.fromEntries(invoices.map((i) => [i.id, i]));

  // Build matching index — peserta by customer_id, phone, name
  const paxByCustId = {};
  const paxByPhone = {};
  const paxByName = {};
  for (const pax of (passengers || [])) {
    const c = custMap[pax.customer_id];
    if (!c) continue;
    paxByCustId[pax.customer_id] = pax;
    const phone = normalizePhone(c.phone);
    if (phone) paxByPhone[phone] = pax;
    const fullName = c.name || `${c.first_name || ''} ${c.surname || ''}`.trim();
    if (fullName) paxByName[normalizeName(fullName)] = pax;
  }

  let totalSynced = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const errorDetails = [];
  const successDetails = [];
  const skippedDetails = []; // R215y² DEBUG — kenapa skipped

  for (const payment of payments) {
    const inv = invMap[payment.invoice_id];
    const label = inv?.customer_name || `payment-${String(payment.id).slice(0, 8)}`;

    if (!payment.proof_url) {
      totalSkipped++;
      skippedDetails.push(`${label}: proof_url kosong (peserta belum upload file)`);
      continue;
    }
    if (payment.drive_file_id) {
      totalSkipped++;
      skippedDetails.push(`${label}: sudah pernah ke-sync (drive_file_id set)`);
      continue;
    }
    if (!inv) {
      totalSkipped++;
      skippedDetails.push(`payment ${payment.id}: invoice gak ketemu`);
      continue;
    }

    // MATCH peserta:
    let pax = null;
    let paxName = inv.customer_name || 'unknown';

    if (inv.customer_id && paxByCustId[inv.customer_id]) {
      pax = paxByCustId[inv.customer_id];
    } else {
      const phone = normalizePhone(inv.customer_phone);
      if (phone && paxByPhone[phone]) pax = paxByPhone[phone];
      else {
        const nName = normalizeName(inv.customer_name);
        if (nName && paxByName[nName]) pax = paxByName[nName];
      }
    }

    if (pax) {
      const c = custMap[pax.customer_id];
      if (c) paxName = c.name || `${c.first_name || ''} ${c.surname || ''}`.trim() || paxName;
    }

    // Ensure pax folder — kalau gak ada pax match, masuk folder "_unmatched"
    let paxFolderId = pax?.payment_drive_pax_folder_id;
    let paxFolderUrl = pax?.payment_drive_pax_folder_url;
    const folderLabel = pax ? paxName : `_unmatched-${inv.customer_name || inv.invoice_no}`;

    try {
      if (!paxFolderId) {
        const folder = await findOrCreateFolder(trip.payment_drive_trip_folder_id, sanitizeFolderName(folderLabel));
        paxFolderId = folder.id;
        paxFolderUrl = folder.webViewLink;
        if (pax) {
          await supabase
            .from('trip_passengers')
            .update({
              payment_drive_pax_folder_id: paxFolderId,
              payment_drive_pax_folder_url: paxFolderUrl,
            })
            .eq('id', pax.id);
        }
      }
    } catch (e) {
      errorDetails.push(`Folder create ${folderLabel}: ${e?.message}`);
      totalErrors++;
      continue;
    }

    // Parse storage path
    const storageInfo = extractStoragePath(payment.proof_url);
    if (!storageInfo) {
      errorDetails.push(`${paxName}: gak bisa parse storage path dari ${payment.proof_url.slice(0, 60)}`);
      totalErrors++;
      continue;
    }

    try {
      // Try download from declared bucket first
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
            if (!error && data) { fileData = data; break; }
          } catch {}
        }
      }

      if (!fileData) {
        errorDetails.push(`${paxName}: file gak ditemukan (path: ${storageInfo.path})`);
        totalErrors++;
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const origFilename = storageInfo.path.split('/').pop() || 'bukti';
      const milestone = inv.milestone ? `${inv.milestone}-` : '';
      const fileName = sanitizeFolderName(`${milestone}INV-${inv.invoice_no || payment.invoice_id}-${origFilename}`).slice(0, 200);
      const mimeType = fileData.type || 'application/octet-stream';

      const driveFile = await uploadFileToDriveFolder(paxFolderId, fileName, mimeType, buffer);

      // Save drive metadata di invoice_payments
      await supabase
        .from('invoice_payments')
        .update({
          drive_file_id: driveFile.id,
          drive_file_url: driveFile.webViewLink,
          drive_synced_at: new Date().toISOString(),
        })
        .eq('id', payment.id);

      totalSynced++;
      successDetails.push(`${paxName} (${inv.milestone || 'payment'} - ${fmtAmount(payment.amount)})`);
    } catch (e) {
      const errMsg = `${paxName}: ${e?.message || String(e)}`;
      console.error('[Payment Sync]', errMsg);
      errorDetails.push(errMsg);
      totalErrors++;
    }
  }

  await supabase
    .from('trips')
    .update({ payment_drive_last_sync_at: new Date().toISOString() })
    .eq('id', tripId);

  revalidatePath(`/invoices`);
  revalidatePath(`/finance/payments`);

  return {
    ok: true,
    synced: totalSynced,
    skipped: totalSkipped,
    errors: totalErrors,
    success_details: successDetails.slice(0, 15),
    error_details: errorDetails.slice(0, 15),
    skipped_details: skippedDetails.slice(0, 15),
  };
}

function fmtAmount(n) {
  if (n == null) return '';
  try { return new Intl.NumberFormat('id-ID').format(n); } catch { return String(n); }
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

  revalidatePath(`/invoices`);
  revalidatePath(`/finance/payments`);
  return { ok: true };
}
