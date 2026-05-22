// /tl/[tripId]/manifest.csv — Round 67: TL-accessible manifest download
// Mirror logic dari /visa/[tripId]/manifest.csv tapi route ada di /tl path

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function escapeCsv(value) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function calcAge(birthday) {
  if (!birthday) return '';
  const dob = new Date(birthday);
  if (isNaN(dob)) return '';
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export async function GET(_request, { params }) {
  const { tripId } = await params;
  const supabase = createClient();

  const [tripRes, paxRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name, departure').eq('id', tripId).maybeSingle(),
    supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('joined_at', { ascending: true }),
  ]);

  if (!tripRes.data) return new NextResponse('Trip not found', { status: 404 });
  const trip = tripRes.data;
  const passengers = paxRes.data || [];
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let custMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    custMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }

  const header = ['No', 'Nama', 'Gender', 'Tanggal Lahir', 'Umur', 'No HP', 'Email', 'Passport No', 'Passport Expiry', 'Tipe Kamar'];
  const rows = passengers.map((p, i) => {
    const c = custMap[p.customer_id] || {};
    return [
      i + 1,
      c.name || '',
      c.gender || '',
      c.birthday || '',
      calcAge(c.birthday),
      c.phone || '',
      c.email || '',
      c.passport_no || '',
      c.passport_expiry || '',
      p.room_type || '',
    ];
  });

  const csv = '﻿' + [header, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="manifest_${trip.kode_trip || tripId}.csv"`,
    },
  });
}
