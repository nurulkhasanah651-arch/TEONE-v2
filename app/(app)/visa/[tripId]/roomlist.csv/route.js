// Download roomlist as CSV — grouped by room type

import { createClient } from '@/lib/supabase/server';

function escapeCsv(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const ROOM_ORDER = ['Single', 'Twin', 'Double', 'Triple', 'Family'];

export async function GET(_request, { params }) {
  const { tripId } = await params;
  const supabase = createClient();
  const [tripRes, paxRes] = await Promise.all([
    supabase.from('trips').select('id, kode_trip, name').eq('id', tripId).maybeSingle(),
    supabase.from('trip_passengers').select('*').eq('trip_id', tripId).order('room_type').order('joined_at'),
  ]);

  if (!tripRes.data) return new Response('Trip not found', { status: 404 });
  const trip = tripRes.data;
  const passengers = paxRes.data || [];
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);

  let customerMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customerMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }

  // Group by room type
  const grouped = {};
  for (const p of passengers) {
    const room = p.room_type || 'Belum Set';
    if (!grouped[room]) grouped[room] = [];
    grouped[room].push(p);
  }

  // Sort room types: standard order first, then custom
  const sortedRooms = Object.keys(grouped).sort((a, b) => {
    const ia = ROOM_ORDER.indexOf(a);
    const ib = ROOM_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  const headers = ['No', 'Tipe Kamar', 'Nama Lengkap', 'Gender', 'No Passport', 'No HP', 'Harga Bayar'];
  const rows = [headers.map(escapeCsv).join(',')];

  let i = 1;
  for (const room of sortedRooms) {
    const list = grouped[room];
    for (const p of list) {
      const c = customerMap[p.customer_id] || {};
      rows.push([
        i++,
        room,
        c.name || '',
        c.gender === 'L' ? 'Laki-laki' : c.gender === 'P' ? 'Perempuan' : '',
        c.passport_no || '',
        c.phone || '',
        p.price_paid || 0,
      ].map(escapeCsv).join(','));
    }
    // Empty row between groups for readability
    rows.push('');
  }

  // Summary at bottom
  rows.push('');
  rows.push('SUMMARY,Jumlah,,,,,'.split(',').map(escapeCsv).join(','));
  for (const room of sortedRooms) {
    rows.push([room, grouped[room].length, '', '', '', '', ''].map(escapeCsv).join(','));
  }
  rows.push(['TOTAL', passengers.length, '', '', '', '', ''].map(escapeCsv).join(','));

  const csv = '﻿' + rows.join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="roomlist_${trip.kode_trip || trip.id}.csv"`,
    },
  });
}
