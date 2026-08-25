// /tl/[tripId]/manifest.pdf — Manifest PDF via SERVER (header attachment benar).
// Dibuat karena download client (blob octet-stream) di HP iOS jadi file ".download"
// yang tak bisa dibuka. Server route dengan Content-Disposition attachment aman di iOS.
// Data & format sama dgn tombol Manifest PDF (buildManifestPdfDoc + getManifestRows).

import { NextResponse } from 'next/server';
import { getManifestRows } from '@/lib/actions/manifest';
import { buildManifestPdfDoc } from '@/lib/utils/manifest-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request, { params }) {
  const { tripId } = await params;
  const res = await getManifestRows(tripId);
  if (res?.error) return new NextResponse(res.error, { status: 404 });

  const t = res.trip || {};
  // Object rows (getManifestRows) → array rows sesuai kolom PDF (tanpa KTP, sama spt tombol lama).
  const rows = (res.rows || []).map((r) => [
    r.no, r.first_name, r.last_name, r.gender, r.place_of_birth, r.birth_date,
    r.age, r.passport_no, r.issue_date, r.issuing_office, r.expiry_date, r.phone, r.catatan,
  ]);

  const doc = await buildManifestPdfDoc({
    trip: { name: t.name, kode_trip: t.kode_trip, departure: t.departure, return_date: t.return },
    rows,
    showKtp: false,
  });

  const ab = doc.output('arraybuffer');
  const buf = Buffer.from(ab);
  const safeName = `Manifest - ${(t.kode_trip || t.name || tripId)}.pdf`.replace(/"/g, '');
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'no-store',
    },
  });
}
