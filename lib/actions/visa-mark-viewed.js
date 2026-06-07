// R215s+R215t: Auto-mark visa uploads as viewed when CS opens trip detail
// Path: lib/actions/visa-mark-viewed.js

'use server';

import { createClient } from '@/lib/supabase/server';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Mark all uploads di trip ini sebagai "viewed" (timestamp now)
// Dipanggil pas CS buka trip detail
export async function markTripUploadsAsViewed(tripId) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const supabase = getServiceClient() || authClient;

  const now = new Date().toISOString();
  try {
    await supabase
      .from('trip_passengers')
      .update({ visa_uploads_last_viewed_at: now })
      .eq('trip_id', tripId)
      .not('visa_uploaded_docs', 'is', null);
    return { ok: true };
  } catch (e) {
    return { error: e?.message };
  }
}
