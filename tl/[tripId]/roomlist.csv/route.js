// /tl/[tripId]/roomlist.csv — TL-accessible roomlist CSV

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export async function GET(_request, { params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const { data: trip } = await supabase.from('trips').select('kode_trip, name').eq('id', tripId).maybeSingle();
  if (!trip) return new NextResponse('Trip not found', { status: 404 });

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
