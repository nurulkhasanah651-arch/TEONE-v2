// R215r: Get signed URLs untuk download visa documents
// Path: lib/actions/visa-docs-download.js

'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const BUCKET = 'visa-documents';

// R215r: Get signed URLs untuk semua dokumen di trip (atau specific peserta)
// Returns: { passengers: [{ id, name, docs: [{ doc_name, signed_url, file_size, mime_type, original_name }] }] }
export async function getVisaDocsForDownload(tripId, passengerId = null) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  if (!tripId) return { error: 'tripId wajib' };

  // Fetch peserta
  let query = supabase
    .from('trip_passengers')
    .select('id, customer_id, visa_uploaded_docs')
    .eq('trip_id', tripId);
  if (passengerId) query = query.eq('id', passengerId);

  const { data: paxList, error } = await query;
  if (error) return { error: 'Query failed: ' + error.message };

  const custIds = (paxList || []).map((p) => p.customer_id).filter(Boolean);
  const { data: customers } = await supabase.from('customers').select('id, name').in('id', custIds);
  const custMap = Object.fromEntries((customers || []).map((c) => [c.id, c]));

  const result = [];
  let totalDocs = 0;

  for (const pax of (paxList || [])) {
    const docs = Array.isArray(pax.visa_uploaded_docs) ? pax.visa_uploaded_docs : [];
    if (docs.length === 0) continue;

    const enrichedDocs = [];
    for (const doc of docs) {
      if (!doc.file_path) continue;
      try {
        // Generate signed URL valid 1 hour (untuk download)
        const { data: signedData, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(doc.file_path, 60 * 60);
        if (signErr) {
          console.warn('Sign error:', doc.file_path, signErr.message);
          continue;
        }
        enrichedDocs.push({
          doc_name: doc.doc_name,
          original_name: doc.original_name || doc.doc_name,
          file_path: doc.file_path,
          signed_url: signedData?.signedUrl,
          file_size: doc.file_size || 0,
          mime_type: doc.mime_type || 'application/octet-stream',
          uploaded_at: doc.uploaded_at,
        });
        totalDocs++;
      } catch (e) {
        console.warn('Sign exception:', doc.file_path, e?.message);
      }
    }

    if (enrichedDocs.length > 0) {
      const cust = custMap[pax.customer_id];
      result.push({
        passenger_id: pax.id,
        passenger_name: cust?.name || `#${pax.id}`,
        docs: enrichedDocs,
      });
    }
  }

  return {
    ok: true,
    passengers: result,
    total_passengers: result.length,
    total_docs: totalDocs,
  };
}
