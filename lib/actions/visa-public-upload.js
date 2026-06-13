// R215p: Public action — peserta upload dokumen via token
// Path: lib/actions/visa-public-upload.js
//
// NO AUTH CHECK — security via token (peserta dapat token via WA)
// Validation: token must match existing visa_upload_token

'use server';

import { revalidatePath } from 'next/cache';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { resolveClientByToken } from '@/lib/supabase/public-brand';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) throw new Error('Supabase service credentials missing');
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const BUCKET = 'visa-documents';

// R215p: Lookup peserta by token (untuk page render)
export async function lookupVisaByToken(token) {
  if (!token || typeof token !== 'string' || !token.startsWith('vsa_')) {
    return { error: 'Token invalid' };
  }
  try {
    const resolved = await resolveClientByToken('visa_upload_token', token);
    if (!resolved) return { error: 'Token tidak valid atau sudah expired' };
    const supabase = resolved.client;
    const { data: pax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, customer_id, family_group_id, is_family_head, visa_upload_token, visa_uploaded_docs, visa_docs')
      .eq('visa_upload_token', token)
      .maybeSingle();
    if (!pax) return { error: 'Token tidak valid atau sudah expired' };

    const { data: trip } = await supabase
      .from('trips')
      .select('id, kode_trip, name, departure, visa_country, visa_doc_template, visa_pdf_syarat_url, visa_pdf_template_url, visa_deadline_doc, visa_pickup_address')
      .eq('id', pax.trip_id).maybeSingle();

    // Kumpulkan SEMUA anggota keluarga (kalau pax bagian dari family group) → upload per anggota
    let memberRows = [pax];
    if (pax.family_group_id) {
      const { data: fam } = await supabase
        .from('trip_passengers')
        .select('id, customer_id, family_group_id, is_family_head, visa_uploaded_docs, visa_docs')
        .eq('family_group_id', pax.family_group_id);
      if (Array.isArray(fam) && fam.length) {
        memberRows = fam.sort((a, b) => (b.is_family_head ? 1 : 0) - (a.is_family_head ? 1 : 0));
      }
    }

    const custIds = [...new Set(memberRows.map((m) => m.customer_id).filter(Boolean))];
    const { data: custs } = await supabase.from('customers').select('id, name, phone').in('id', custIds);
    const custMap = Object.fromEntries((custs || []).map((c) => [c.id, c]));

    const members = memberRows.map((m) => ({
      id: m.id,
      name: custMap[m.customer_id]?.name || 'Peserta',
      is_family_head: !!m.is_family_head,
      visa_uploaded_docs: Array.isArray(m.visa_uploaded_docs) ? m.visa_uploaded_docs : [],
    }));

    return {
      ok: true,
      passenger: pax,
      trip: trip || null,
      customer: custMap[pax.customer_id] || null,
      members,
      is_family: !!pax.family_group_id && members.length > 1,
    };
  } catch (e) {
    return { error: 'Lookup failed: ' + (e?.message || String(e)) };
  }
}

// R215p: Public upload dokumen
export async function uploadVisaDocByToken(token, docName, formData, targetPassengerId = null) {
  if (!token || typeof token !== 'string' || !token.startsWith('vsa_')) {
    return { error: 'Token invalid' };
  }
  if (!docName || typeof docName !== 'string') return { error: 'Doc name kosong' };

  const file = formData.get('doc_file');
  if (!file || typeof file === 'string') return { error: 'File gak ada' };
  if (file.size === 0) return { error: 'File kosong' };
  if (file.size > 10 * 1024 * 1024) return { error: 'File terlalu besar (max 10MB)' };

  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf',
  ];
  if (!allowedTypes.includes(file.type)) {
    return { error: 'Format harus JPG/PNG/WEBP/HEIC/PDF' };
  }

  try {
    const resolved = await resolveClientByToken('visa_upload_token', token);
    if (!resolved) return { error: 'Token tidak valid atau sudah expired' };
    const supabase = resolved.client;

    // Pemilik token (kepala keluarga / peserta)
    const { data: tokenPax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, family_group_id, visa_upload_token, visa_uploaded_docs, visa_docs')
      .eq('visa_upload_token', token)
      .maybeSingle();
    if (!tokenPax) return { error: 'Token tidak valid' };

    // Target upload: anggota keluarga tertentu (harus 1 family group dgn pemilik token)
    let pax = tokenPax;
    if (targetPassengerId && String(targetPassengerId) !== String(tokenPax.id)) {
      const { data: member } = await supabase
        .from('trip_passengers')
        .select('id, trip_id, family_group_id, visa_uploaded_docs, visa_docs')
        .eq('id', targetPassengerId)
        .maybeSingle();
      if (!member || !tokenPax.family_group_id || member.family_group_id !== tokenPax.family_group_id) {
        return { error: 'Peserta tidak sah untuk link ini' };
      }
      pax = member;
    }

    // File path: visa-documents/{trip_id}/{pax_id}/{doc_name_safe}-{ts}.ext
    const ext = file.name.split('.').pop().toLowerCase();
    const docSafe = String(docName).replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
    const filePath = `${pax.trip_id}/${pax.id}/${docSafe}-${Date.now()}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });
    if (uploadErr) return { error: 'Upload failed: ' + uploadErr.message };

    // Get URL (signed, expire 7 days untuk admin akses)
    const { data: urlData } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 60 * 60 * 24 * 7);
    const fileUrl = urlData?.signedUrl || null;

    // Update visa_uploaded_docs array
    const currentDocs = Array.isArray(pax.visa_uploaded_docs) ? pax.visa_uploaded_docs : [];
    const existingIdx = currentDocs.findIndex((d) => d.doc_name === docName);
    const newDocEntry = {
      doc_name: docName,
      file_url: fileUrl,
      file_path: filePath,
      uploaded_at: new Date().toISOString(),
      file_size: file.size,
      mime_type: file.type,
      original_name: file.name,
    };
    let nextDocs;
    if (existingIdx >= 0) {
      nextDocs = currentDocs.slice();
      nextDocs[existingIdx] = newDocEntry;
    } else {
      nextDocs = [...currentDocs, newDocEntry];
    }

    // Update visa_docs checklist (sync ke matrix)
    const currentVisaDocs = Array.isArray(pax.visa_docs) ? pax.visa_docs : [];
    const visaDocIdx = currentVisaDocs.findIndex((d) => d.name === docName);
    let nextVisaDocs;
    if (visaDocIdx >= 0) {
      nextVisaDocs = currentVisaDocs.slice();
      nextVisaDocs[visaDocIdx] = { ...nextVisaDocs[visaDocIdx], complete: true, notes: 'Uploaded via portal' };
    } else {
      nextVisaDocs = [...currentVisaDocs, { name: docName, complete: true, notes: 'Uploaded via portal' }];
    }

    const { error: updErr } = await supabase
      .from('trip_passengers')
      .update({
        visa_uploaded_docs: nextDocs,
        visa_docs: nextVisaDocs,
      })
      .eq('id', pax.id);
    if (updErr) return { error: 'DB update failed: ' + updErr.message };

    revalidatePath(`/visa/upload/${token}`);
    revalidatePath(`/visa/${pax.trip_id}`);
    return { ok: true, file_path: filePath, doc_name: docName };
  } catch (e) {
    return { error: 'Upload error: ' + (e?.message || String(e)) };
  }
}

// R215p: Delete uploaded doc (kalau peserta mau replace)
export async function deleteUploadedDocByToken(token, docName, targetPassengerId = null) {
  if (!token || !docName) return { error: 'Token / docName kosong' };
  try {
    const resolved = await resolveClientByToken('visa_upload_token', token);
    if (!resolved) return { error: 'Token tidak valid' };
    const supabase = resolved.client;

    const { data: tokenPax } = await supabase
      .from('trip_passengers')
      .select('id, trip_id, family_group_id, visa_uploaded_docs, visa_docs')
      .eq('visa_upload_token', token)
      .maybeSingle();
    if (!tokenPax) return { error: 'Token tidak valid' };

    let pax = tokenPax;
    if (targetPassengerId && String(targetPassengerId) !== String(tokenPax.id)) {
      const { data: member } = await supabase
        .from('trip_passengers')
        .select('id, trip_id, family_group_id, visa_uploaded_docs, visa_docs')
        .eq('id', targetPassengerId)
        .maybeSingle();
      if (!member || !tokenPax.family_group_id || member.family_group_id !== tokenPax.family_group_id) {
        return { error: 'Peserta tidak sah untuk link ini' };
      }
      pax = member;
    }

    const currentDocs = Array.isArray(pax.visa_uploaded_docs) ? pax.visa_uploaded_docs : [];
    const existing = currentDocs.find((d) => d.doc_name === docName);
    if (!existing) return { error: 'Dokumen gak ditemukan' };

    // Delete from storage
    if (existing.file_path) {
      try { await supabase.storage.from(BUCKET).remove([existing.file_path]); } catch {}
    }

    // Update array
    const nextDocs = currentDocs.filter((d) => d.doc_name !== docName);

    // Uncheck visa_docs
    const currentVisaDocs = Array.isArray(pax.visa_docs) ? pax.visa_docs : [];
    const nextVisaDocs = currentVisaDocs.map((d) =>
      d.name === docName ? { ...d, complete: false } : d
    );

    await supabase
      .from('trip_passengers')
      .update({
        visa_uploaded_docs: nextDocs,
        visa_docs: nextVisaDocs,
      })
      .eq('id', pax.id);

    revalidatePath(`/visa/upload/${token}`);
    revalidatePath(`/visa/${pax.trip_id}`);
    return { ok: true };
  } catch (e) {
    return { error: 'Delete error: ' + (e?.message || String(e)) };
  }
}
