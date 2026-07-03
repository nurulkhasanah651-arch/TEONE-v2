// /visa/[tripId]/roomlist.csv — Round 49: include room_assignment

import { createClient } from '@/lib/supabase/server';
import { roomlistFlatRows } from '@/lib/utils/roomlist';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export async function GET(req, { params }) {
  const { tripId } = await params;
  const supabase = createClient();
  const { data: trip } = await supabase.from('trips').select('kode_trip, name').eq('id', tripId).maybeSingle();
  if (!trip) return new NextResponse('Trip not found', { status: 404 });

  const { data: tp } = await supabase
    .from('trip_passengers')
    .select('*')
    .eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  const passengers = tp || [];
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let customers = [];
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customers = cust || [];
  }

  // Roomlist SAMA dengan proyeksi income ops (generateRoomlist auto live)
  const header = ['No', 'Room', 'Tipe', 'Nama', 'Gender', 'No HP', 'Passport No', 'Passport Expiry', 'Tanggal Lahir', 'Notes'];
  const rows = roomlistFlatRows(passengers, customers).map((r) => [
    r.no, r.room, r.room_type, r.name, r.gender, r.phone, r.passport_no, r.passport_expiry, r.birthday, r.notes,
  ]);

  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="roomlist_${trip.kode_trip || tripId}.csv"`,
    },
  });
}
