'use server';

// Round 188: HPP documents — direct browser upload (bypass 4.5MB serverless limit)
// File di-upload langsung ke Supabase Storage dari browser, server cuma simpan URL-nya.
// Max file size: 20MB (limit di-set di bucket Supabase, bukan di server)
//
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

// ============ R188: SAVE invoice URL ke DB (file udah di-upload dari browser) ============
export async function saveInvoiceUrl(itemId, storageKey) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!itemId) return { error: 'itemId wajib' };
  if (!storageKey) return { error: 'storageKey wajib' };

  const supabase = getServiceClient() || authClient;

  try {
    const uploadedAt = new Date().toISOString();
    const { data: item, error: updErr } = await supabase
      .from('trip_finance_items')
      .update({
        invoice_url: storageKey,
        invoice_uploaded_at: uploadedAt,
      })
      .eq('id', itemId)
      .select('*')
      .single();

    if (updErr) {
      if (/invoice_url|invoice_uploaded_at|column.*does not exist/i.test(updErr.message)) {
        return {
          error: '⚠ Column invoice_url belum ada di tabel trip_finance_items. Run SQL_COPAS_RUN_ALL.txt di Supabase Editor.',
        };
      }
      return { error: 'Update DB gagal: ' + updErr.message };
    }
    if (!item) return { error: '⚠ Item HPP gak ditemukan (id=' + itemId + ').' };

    revalidateAll(item?.trip_id);
    return { ok: true, key: storageKey, uploaded_at: uploadedAt, item };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ R188: SAVE transfer proof URL ke DB ============
export async function saveTransferProofUrl(itemId, storageKey) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  if (!itemId) return { error: 'itemId wajib' };
  if (!storageKey) return { error: 'storageKey wajib' };

  const supabase = getServiceClient() || authClient;

  try {
    const uploadedAt = new Date().toISOString();
    const { data: item, error: updErr } = await supabase
      .from('trip_finance_items')
      .update({
        transfer_proof_url: storageKey,
        transfer_proof_uploaded_at: uploadedAt,
      })
      .eq('id', itemId)
      .select('*')
      .single();

    if (updErr) {
      if (/transfer_proof_url|transfer_proof_uploaded_at|column.*does not exist/i.test(updErr.message)) {
        return {
          error: '⚠ Column transfer_proof_url belum ada di tabel trip_finance_items. Run SQL_COPAS_RUN_ALL.txt di Supabase Editor.',
        };
      }
      return { error: 'Update DB gagal: ' + updErr.message };
    }
    if (!item) return { error: '⚠ Item HPP gak ditemukan (id=' + itemId + ').' };

    revalidateAll(item?.trip_id);
    return { ok: true, key: storageKey, uploaded_at: uploadedAt, item };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ LEGACY: uploadHPPInvoice (R184) — DEPRECATED tapi tetap export biar gak break ============
// Cuma redirect ke saveInvoiceUrl, tapi browser harus pakai direct upload (R188)
export async function uploadHPPInvoice() {
  return { error: 'DEPRECATED: pakai saveInvoiceUrl setelah direct upload dari browser' };
}
export async function uploadTransferProof() {
  return { error: 'DEPRECATED: pakai saveTransferProofUrl setelah direct upload dari browser' };
}

// ============ GET SIGNED URL untuk Invoice (download) ============
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
      .createSignedUrl(row.invoice_url, 600);
    if (error) return { error: error.message };
    return { ok: true, url: data.signedUrl };
  } catch (e) {
    return { error: 'Error: ' + (e?.message || 'unknown') };
  }
}

// ============ GET SIGNED URL untuk Bukti Transfer (download) ============
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
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
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
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;
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
