// /tl/[tripId]/roomlist.xls — TL-accessible roomlist Excel

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    .order('room_assignment', { ascending: true, nullsFirst: false })
    .order('joined_at', { ascending: true });

  const passengers = tp || [];
  const customerIds = passengers.map((p) => p.customer_id).filter(Boolean);
  let custMap = {};
  if (customerIds.length > 0) {
    const { data: cust } = await supabase.from('customers').select('*').in('id', customerIds);
    custMap = Object.fromEntries((cust || []).map((c) => [c.id, c]));
  }

  const byRoom = {};
  for (const p of passengers) {
    const room = p.room_assignment || '(belum di-assign)';
    if (!byRoom[room]) byRoom[room] = [];
    byRoom[room].push(p);
  }

  const tableRows = [];
  let idx = 1;
  for (const roomKey of Object.keys(byRoom).sort((a, b) => {
    if (a.startsWith('(')) return 1;
    if (b.startsWith('(')) return -1;
    return a.localeCompare(b);
  })) {
    const list = byRoom[roomKey];
    tableRows.push(`<tr style="background:#0570de;color:white;font-weight:bold"><td colspan="9">🛏 ${esc(roomKey)} (${list.length} pax)</td></tr>`);
    for (const p of list) {
      const c = custMap[p.customer_id] || {};
      tableRows.push(`<tr>
        <td>${idx++}</td>
        <td>${esc(c.name)}</td>
        <td>${esc(p.room_type)}</td>
        <td>${esc(c.gender)}</td>
        <td>${esc(c.phone)}</td>
        <td>${esc(c.passport_no)}</td>
        <td>${esc(c.passport_expiry)}</td>
        <td>${esc(c.birthday)}</td>
        <td>${esc(p.room_notes)}</td>
      </tr>`);
    }
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
