// /tl/[tripId]/manifest.xlsx — Manifest Excel via SERVER (header attachment benar).
// Dibuat karena download client (XLSX.writeFile / blob) di HP iOS jadi file ".download"
// yang tak bisa dibuka. Server route dengan Content-Disposition attachment aman di iOS.
// Format identik dgn tombol Excel lama (buildManifestAOA + getManifestRows).

import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getManifestRows } from '@/lib/actions/manifest';
import { buildManifestAOA } from '@/lib/utils/manifest-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { tripId } = await params;
  const res = await getManifestRows(tripId);
  if (res?.error) return new NextResponse(res.error, { status: 404 });

  const { aoa, merges, cols, sheetName, fileName } = buildManifestAOA({ trip: res.trip || {}, rows: res.rows || [] });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (Array.isArray(merges)) ws['!merges'] = merges;
  if (Array.isArray(cols)) ws['!cols'] = cols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Manifest');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const safeName = (fileName || `Manifest - ${res.trip?.kode_trip || tripId}.xlsx`).replace(/"/g, '');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  });
}
