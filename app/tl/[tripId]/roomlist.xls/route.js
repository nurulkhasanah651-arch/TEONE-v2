// /tl/[tripId]/roomlist.xls — TL-accessible roomlist Excel

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { roomlistFlatRows } from '@/lib/utils/roomlist';

export const dynamic = 'force-dynamic';

function esc(v) {
  if (v == null) return '';
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(_request, { params }) {
  const { tripId } = await params;
  const supabase = createClient();
  const { data: trip } = await supabase.from('trips').select('kode_trip, name, departure, arrival').eq('id', tripId).maybeSingle();
  if (!trip) return new NextResponse('Trip not found', { status: 404 });

  const { data: tp } = await supabase
    .from('trip_passengers').select('*').eq('trip_id', tripId)
    .order('joined_at', { ascending: true });

  const passengers = tp || [];
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let customers = [];
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    customers = cust || [];
  }

  // Roomlist SAMA dengan proyeksi income ops (generateRoomlist auto live)
  const flat = roomlistFlatRows(passengers, customers);
  const tableRows = [];
  let curRoom = null; let count = 0; let headerIdx = -1;
  const roomCounts = {};
  for (const r of flat) roomCounts[r.room] = (roomCounts[r.room] || 0) + 1;
  for (const r of flat) {
    if (r.room !== curRoom) {
      curRoom = r.room;
      tableRows.push(`<tr style="background:#0570de;color:white;font-weight:bold"><td colspan="9">🛏 ${esc(r.room)} (${roomCounts[r.room]} pax)</td></tr>`);
    }
    tableRows.push(`<tr>
      <td>${r.no}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.room_type)}</td>
      <td>${esc(r.gender)}</td>
      <td>${esc(r.phone)}</td>
      <td>${esc(r.passport_no)}</td>
      <td>${esc(r.passport_expiry)}</td>
      <td>${esc(r.birthday)}</td>
      <td>${esc(r.notes)}</td>
    </tr>`);
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Roomlist ${esc(trip.kode_trip || tripId)}</title></head>
<body>
<h2>Roomlist — ${esc(trip.kode_trip || tripId)} ${esc(trip.name)}</h2>
<p>Berangkat: ${esc(trip.departure)} · Pulang: ${esc(trip.arrival)} · ${passengers.length} peserta</p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:11pt">
  <thead>
    <tr style="background:#f3f4f6;font-weight:bold">
      <th>No</th><th>Nama Peserta</th><th>Tipe</th><th>Gender</th>
      <th>No HP</th><th>Passport No</th><th>Passport Expiry</th>
      <th>Tanggal Lahir</th><th>Notes</th>
    </tr>
  </thead>
  <tbody>${tableRows.join('\n')}</tbody>
</table>
</body></html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'application/vnd.ms-excel; charset=UTF-8',
      'Content-Disposition': `attachment; filename="roomlist_${trip.kode_trip || tripId}.xls"`,
    },
  });
}
