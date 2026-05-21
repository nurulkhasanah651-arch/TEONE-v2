// Download manifest as CSV — auto from passenger passport data

import { createClient } from '@/lib/supabase/server';

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

  if (!tripRes.data) {
    return new Response('Trip not found', { status: 404 });
  }
  const trip = tripRes.data;
  const passengers = paxRes.data || [];
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);

  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }

  // Headers — standard manifest format for travel
  const headers = [
    'No', 'Nama Lengkap', 'Nama Depan', 'Nama Belakang',
    'Gender', 'Tempat Lahir', 'Tanggal Lahir', 'Umur',
    'No Passport', 'Passport Diterbitkan', 'Tanggal Issue Passport', 'Tanggal Expiry Passport',
    'No HP', 'Email', 'Tipe Kamar',
  ];

  const rows = [headers.map(escapeCsv).join(',')];

  passengers.forEach((p, idx) => {
    const c = customerMap[p.customer_id] || {};
    const row = [
      idx + 1,
      c.name || '',
      c.first_name || '',
      c.surname || '',
      c.gender === 'L' ? 'Laki-laki' : c.gender === 'P' ? 'Perempuan' : '',
      c.city || '',
      c.birthday || '',
      calcAge(c.birthday),
      c.passport_no || '',
      c.passport_issued_at || '',
      c.passport_issued_date || '',
      c.passport_expiry || '',
      c.phone || '',
      c.email || '',
      p.room_type || '',
    ];
    rows.push(row.map(escapeCsv).join(','));
  });

  // Add BOM for Excel UTF-8 support
  const csv = '﻿' + rows.join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="manifest_${trip.kode_trip || trip.id}.csv"`,
    },
  });
}
