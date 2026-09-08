// /tl/[tripId]/roomlist.csv — TL-accessible roomlist CSV

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl, currentBrandCode } from '@/lib/supabase/service-env';
import { resolveTlIdentity, tlOwnsTrip } from '@/lib/tl-cross-brand';

export const dynamic = 'force-dynamic';

// Service client (bypass RLS) supaya peserta selalu kebaca; TL sesi kena RLS -> file kosong.
function _svcDb() {
  const url = brandSupabaseUrl(); const key = brandServiceRoleKey();
  return (url && key) ? createSvc(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : createClient();
}
async function _tlAllowed(trip) {
  try {
    const auth = createClient();
    const { data: { user } } = await auth.auth.getUser();
    const role = user?.app_metadata?.role || user?.user_metadata?.role || 'pending';
    if (role !== 'tour_leader') return true;
    const identity = await resolveTlIdentity(user).catch(() => null);
    return !!identity && tlOwnsTrip(identity, trip, currentBrandCode());
  } catch { return false; }
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export async function GET(_request, { params }) {
  const { tripId } = await params;
  const supabase = _svcDb();

  const { data: trip } = await supabase.from('trips').select('kode_trip, name, tl_id, tl_email, tl_phone').eq('id', tripId).maybeSingle();
  if (!trip) return new NextResponse('Trip not found', { status: 404 });
  if (!(await _tlAllowed(trip))) return new NextResponse('Forbidden', { status: 403 });

  const { data: tp } = await supabase
    .from('trip_passengers').select('*').eq('trip_id', tripId)
    .order('room_assignment', { ascending: true, nullsFirst: false })
    .order('joined_at', { ascending: true });

  const passengers = tp || [];
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let custMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    custMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }

  const header = ['No', 'Room', 'Tipe', 'Nama', 'Gender', 'No HP', 'Passport No', 'Passport Expiry', 'Tanggal Lahir', 'Notes'];
  const rows = passengers.map((p, i) => {
    const c = custMap[p.customer_id] || {};
    return [
      i + 1,
      p.room_assignment || '',
      p.room_type || '',
      c.name || '',
      c.gender || '',
      c.phone || '',
      c.passport_no || '',
      c.passport_expiry || '',
      c.birthday || '',
      p.room_notes || '',
    ];
  });

  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="roomlist_${trip.kode_trip || tripId}.csv"`,
    },
  });
}
