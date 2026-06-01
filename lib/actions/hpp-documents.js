'use server';

// Round 184: Upload + signed URL untuk HPP invoice + bukti transfer
// Path: lib/actions/hpp-documents.js

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function revalidateAll(tripId) {
  revalidatePath('/accounting');
  revalidatePath('/finance');
  revalidatePath('/finance/cashflow');
  if (tripId) {
    revalidatePath(`/accounting/groups/${tripId}`);
    revalidatePath(`/finance/cashflow/${tripId}`);
  }
}

function sanitizeFilename(name) {
  return String(name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

// ============ UPLOAD INVOICE (Finance saat request) ============
export async function uploadHPPInvoice(itemId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const file = formData.get('invoice_file') || formData.get('file');
  if (!file || typeof file === 'string') return { error: 'File invoice wajib' };

  const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  if (!allowedExts.includes(ext)) return { error: 'Format harus PDF/JPG/PNG/WebP' };

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) return { error: `File terlalu besar (${(file.size/1024/1024).toFixed(1)}MB). Max 10MB.` };

  const supabase = getServiceClient() || authClient;

  try {
    // Upload file
    const key = `invoices/item-${itemId}-${Date.now()}-${sanitizeFilename(file.name)}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from('hpp-documents')
      .upload(key, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) return { error: 'Upload gagal: ' + upErr.message };

    // Update trip_finance_items
    const { data: item, error: updErr } = await supabase
      .from('trip_finance_items')
      .update({
        invoice_url: key,
        invoice_uploaded_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .select('trip_id')
      .single();
    if (updErr) return { error: updErr.message };

    revalidateAll(item?.trip_id);
    return { ok: true, key };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ UPLOAD BUKTI TRANSFER (Accounting saat approve / setelah approve) ============
export async function uploadTransferProof(itemId, formData) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const file = formData.get('proof_file') || formData.get('file');
  if (!file || typeof file === 'string') return { error: 'File bukti transfer wajib' };

  const allowedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
  const ext = (file.name?.split('.').pop() || 'bin').toLowerCase();
  if (!allowedExts.includes(ext)) return { error: 'Format harus PDF/JPG/PNG/WebP' };

  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) return { error: `File terlalu besar (${(file.size/1024/1024).toFixed(1)}MB). Max 10MB.` };

  const supabase = getServiceClient() || authClient;

  try {
    const key = `transfer-proofs/item-${itemId}-${Date.now()}-${sanitizeFilename(file.name)}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from('hpp-documents')
      .upload(key, buf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) return { error: 'Upload gagal: ' + upErr.message };

    const { data: item, error: updErr } = await supabase
      .from('trip_finance_items')
      .update({
        transfer_proof_url: key,
        transfer_proof_uploaded_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .select('trip_id')
      .single();
    if (updErr) return { error: updErr.message };

    revalidateAll(item?.trip_id);
    return { ok: true, key };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ GET SIGNED URL untuk Invoice ============
export async function getInvoiceSignedUrl(itemId) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: row } = await supabase
      .from('trip_finance_items')
      .select('invoice_url')
      .eq('id', itemId)
      .maybeSingle();
    if (!row?.invoice_url) return { error: 'Belum ada invoice' };

    const { data, error } = await supabase.storage
      .from('hpp-documents')
      .createSignedUrl(row.invoice_url, 600); // 10 min
    if (error) return { error: error.message };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ GET SIGNED URL untuk Bukti Transfer ============
export async function getTransferProofSignedUrl(itemId) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: row } = await supabase
      .from('trip_finance_items')
      .select('transfer_proof_url')
      .eq('id', itemId)
      .maybeSingle();
    if (!row?.transfer_proof_url) return { error: 'Belum ada bukti transfer' };

    const { data, error } = await supabase.storage
      .from('hpp-documents')
      .createSignedUrl(row.transfer_proof_url, 600);
    if (error) return { error: error.message };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ DELETE Invoice ============
export async function deleteInvoice(itemId) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: row } = await supabase
      .from('trip_finance_items')
      .select('invoice_url, trip_id')
      .eq('id', itemId)
      .maybeSingle();
    if (row?.invoice_url) {
      try { await supabase.storage.from('hpp-documents').remove([row.invoice_url]); } catch {}
    }
    await supabase
      .from('trip_finance_items')
      .update({ invoice_url: null, invoice_uploaded_at: null })
      .eq('id', itemId);
    revalidateAll(row?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ DELETE Bukti Transfer ============
export async function deleteTransferProof(itemId) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: row } = await supabase
      .from('trip_finance_items')
      .select('transfer_proof_url, trip_id')
      .eq('id', itemId)
      .maybeSingle();
    if (row?.transfer_proof_url) {
      try { await supabase.storage.from('hpp-documents').remove([row.transfer_proof_url]); } catch {}
    }
    await supabase
      .from('trip_finance_items')
      .update({ transfer_proof_url: null, transfer_proof_uploaded_at: null })
      .eq('id', itemId);
    revalidateAll(row?.trip_id);
    return { ok: true };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}
