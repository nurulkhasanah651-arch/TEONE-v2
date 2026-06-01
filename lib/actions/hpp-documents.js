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
    if (upErr) {
      if (/bucket|not exist|not found/i.test(upErr.message)) {
        return { error: '⚠ Bucket "hpp-documents" belum dibuat. Run SQL_FIX_hpp_documents.txt di Supabase dulu.' };
      }
      return { error: 'Upload gagal: ' + upErr.message };
    }

    // Update trip_finance_items — R184c: return FULL row buat optimistic update
    const uploadedAt = new Date().toISOString();
    const { data: item, error: updErr } = await supabase
      .from('trip_finance_items')
      .update({
        invoice_url: key,
        invoice_uploaded_at: uploadedAt,
      })
      .eq('id', itemId)
      .select('*')
      .single();
    if (updErr) {
      if (/invoice_url|invoice_uploaded_at|column.*does not exist/i.test(updErr.message)) {
        try { await supabase.storage.from('hpp-documents').remove([key]); } catch {}
        return {
          error: '⚠ Column invoice_url belum ada di tabel trip_finance_items. Run SQL_COPAS_RUN_ALL.txt di Supabase Editor.',
        };
      }
      return { error: 'Update DB gagal: ' + updErr.message };
    }
    if (!item) {
      try { await supabase.storage.from('hpp-documents').remove([key]); } catch {}
      return { error: '⚠ Item HPP gak ditemukan (id=' + itemId + '). Kemungkinan ke-delete sambil upload.' };
    }

    revalidateAll(item?.trip_id);
    return {
      ok: true,
      key,
      uploaded_at: uploadedAt,
      invoice_url: key,
      item,
    };
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
    if (upErr) {
      if (/bucket|not exist|not found/i.test(upErr.message)) {
        return { error: '⚠ Bucket "hpp-documents" belum dibuat. Run SQL_FIX_hpp_documents.txt di Supabase dulu.' };
      }
      return { error: 'Upload gagal: ' + upErr.message };
    }

    const uploadedAt = new Date().toISOString();
    const { data: item, error: updErr } = await supabase
      .from('trip_finance_items')
      .update({
        transfer_proof_url: key,
        transfer_proof_uploaded_at: uploadedAt,
      })
      .eq('id', itemId)
      .select('*')
      .single();
    if (updErr) {
      if (/transfer_proof_url|transfer_proof_uploaded_at|column.*does not exist/i.test(updErr.message)) {
        try { await supabase.storage.from('hpp-documents').remove([key]); } catch {}
        return {
          error: '⚠ Column transfer_proof_url belum ada di tabel trip_finance_items. Run SQL_COPAS_RUN_ALL.txt di Supabase Editor.',
        };
      }
      return { error: 'Update DB gagal: ' + updErr.message };
    }
    if (!item) {
      try { await supabase.storage.from('hpp-documents').remove([key]); } catch {}
      return { error: '⚠ Item HPP gak ditemukan (id=' + itemId + '). Kemungkinan ke-delete sambil upload.' };
    }

    revalidateAll(item?.trip_id);
    return {
      ok: true,
      key,
      uploaded_at: uploadedAt,
      transfer_proof_url: key,
      item, // R184c: return full row buat optimistic update
    };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ R184c: DIAGNOSTIC — inspect raw item state ============
export async function inspectHPPItem(itemId) {
  const supabase = getServiceClient() || createClient();
  try {
    const { data: item, error } = await supabase
      .from('trip_finance_items')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    if (error) return { error: error.message };
    if (!item) return { error: `Item id=${itemId} gak ditemukan` };

    // Cek bucket existence
    let bucketOk = false;
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      bucketOk = (buckets || []).some((b) => b.id === 'hpp-documents');
    } catch {}

    return {
      ok: true,
      item_id: item.id,
      component: item.component,
      total_amount: item.total_amount,
      payment_status: item.payment_status,
      // Document fields:
      invoice_url: item.invoice_url || null,
      invoice_uploaded_at: item.invoice_uploaded_at || null,
      transfer_proof_url: item.transfer_proof_url || null,
      transfer_proof_uploaded_at: item.transfer_proof_uploaded_at || null,
      // Schema check:
      has_invoice_url_column: 'invoice_url' in item,
      has_transfer_proof_url_column: 'transfer_proof_url' in item,
      bucket_hpp_documents_exists: bucketOk,
    };
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
