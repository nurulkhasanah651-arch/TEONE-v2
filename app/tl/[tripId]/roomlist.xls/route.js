// /tl/[tripId]/roomlist.xls — TL-accessible roomlist Excel.
// Format SERAGAM dgn Operasional/Visa (buildRoomlistAOA) + section TL & Tim.

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getRoomlistRows } from '@/lib/actions/manifest';
import { buildRoomlistAOA } from '@/lib/utils/roomlist-export';

export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { tripId } = await params;
  const res = await getRoomlistRows(tripId);
  if (res?.error) return new NextResponse(res.error, { status: 404 });

  const { aoa, merges, cols, sheetName, fileName } = buildRoomlistAOA({ trip: res.trip || {}, rooms: res.rooms || [] });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (Array.isArray(merges)) ws['!merges'] = merges;
  if (Array.isArray(cols)) ws['!cols'] = cols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Roomlist');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${(fileName || `roomlist_${tripId}.xlsx`).replace(/"/g, '')}"`,
    },
  });
}
