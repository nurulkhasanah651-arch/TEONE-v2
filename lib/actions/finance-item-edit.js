// R215l: Update finance item (edit inline)
// Path: lib/actions/finance-item-edit.js

'use server';

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

// R215l — list candidate payment_status (handle CHECK constraint)
const PAYMENT_STATUS_CANDIDATES = {
  'lunas': ['lunas'],
  'dp': ['dp', 'partial'],
  'belum lunas': ['belum lunas', 'pending', 'belum bayar', 'unpaid', 'open'],
  'tidak perlu': ['tidak perlu', 'not needed', 'skip'],
};

export async function updateFinanceItem(id, tripId, updates) {
  const authClient = createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const supabase = getServiceClient() || authClient;

  if (!id) return { error: 'item id wajib' };

  // R215l — whitelist editable fields (gak biar user edit field sensitive)
  const allowedFields = [
    'component', 'vendor_name', 'category', 'notes',
    'qty', 'basic_fare', 'total_amount',
    'payment_status', 'dp_paid',
  ];

  const sanitized = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined && updates[key] !== null) {
      // Numeric fields
      if (['qty', 'basic_fare', 'total_amount', 'dp_paid'].includes(key)) {
        sanitized[key] = Number(updates[key]) || 0;
      } else if (key === 'payment_status') {
        // R215l — normalize payment_status candidate
        const val = String(updates[key]).toLowerCase().trim();
        // Will try fallback later
        sanitized[key] = val;
      } else {
        sanitized[key] = String(updates[key]).trim();
      }
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return { error: 'Tidak ada field yg di-update' };
  }

  // R215l — Update with fallback for payment_status
  let lastErrorMsg = null;
  const originalPaymentStatus = sanitized.payment_status;
  const statusCandidates = originalPaymentStatus
    ? (PAYMENT_STATUS_CANDIDATES[originalPaymentStatus] || [originalPaymentStatus])
    : [null]; // null = don't update payment_status

  for (const candidate of statusCandidates) {
    const payload = { ...sanitized };
    if (candidate === null) {
      delete payload.payment_status;
    } else {
      payload.payment_status = candidate;
    }

    const { data, error: updErr } = await supabase
      .from('trip_finance_items')
      .update(payload)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (!updErr) {
      revalidatePath(`/finance/cashflow/${tripId}`);
      revalidatePath(`/finance/payments/${tripId}`);
      revalidatePath(`/accounting/groups/${tripId}`);
      revalidatePath('/accounting');
      revalidatePath('/finance');
      return { ok: true, item: data, warning: candidate !== originalPaymentStatus && originalPaymentStatus ? `payment_status di-mapping: ${originalPaymentStatus} → ${candidate}` : null };
    }

    lastErrorMsg = updErr.message;

    // If error not related to payment_status, no point retrying
    if (!/payment_status/i.test(lastErrorMsg) && !/check.*constraint/i.test(lastErrorMsg)) {
      break;
    }
  }

  return { error: 'Update failed: ' + lastErrorMsg };
}
