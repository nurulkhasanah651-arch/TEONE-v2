// Stream download e-ticket (dari PNR Inventory) untuk portal TL, via domain sendiri
// dengan header attachment. Otorisasi: hanya staf internal atau TL pemilik trip.
// File e-ticket disimpan di bucket privat 'trip-docs' path etickets/<pnrId>/...
// Validasi: PNR harus milik trip ini, dan file harus terdaftar di eticket_docs PNR tsb.
import { serviceClientFor, currentBrandCode } from '@/lib/supabase/service-env';
import { BRAND_CODES } from '@/lib/brand-shared';
import { assertTLTripAccess } from '@/lib/tl-guard';

export const dynamic = 'force-dynamic';
const BUCKET = 'trip-docs';

export async function GET(req, { params }) {
  const tripId = params?.tripId;
  const pnrId = params?.pnrId;
  if (!tripId || !pnrId) return new Response('Bad request', { status: 400 });

  const brandParam = new URL(req.url).searchParams.get('brand');
  const code = BRAND_CODES.includes(brandParam) ? brandParam : currentBrandCode();

  // Otorisasi: staf internal bebas; TL wajib pemilik trip (tutup IDOR anonim).
  const _access = await assertTLTripAccess(tripId, code);
  if (_access?.error) return new Response('Forbidden', { status: 403 });

  const svc = serviceClientFor(code);
  if (!svc) return new Response('Service unavailable', { status: 503 });

  const { data: pnr } = await svc
    .from('flight_inventory').select('id, trip_id, eticket_docs').eq('id', pnrId).maybeSingle();
  // PNR harus ada & benar-benar terhubung ke trip ini.
  if (!pnr || String(pnr.trip_id) !== String(tripId)) return new Response('Not found', { status: 404 });

  let name = '';
  try { name = decodeURIComponent(params?.filename || ''); } catch { name = params?.filename || ''; }
  const docs = Array.isArray(pnr.eticket_docs) ? pnr.eticket_docs : [];
  const doc = docs.find((d) => d && d.name === name) || docs.find((d) => d && d.path && String(d.path).endsWith(name));
  if (!doc?.path) return new Response('File not found', { status: 404 });

  const { data: blob, error } = await svc.storage.from(BUCKET).download(doc.path);
  if (error || !blob) return new Response('File not found in storage', { status: 404 });

  const buf = Buffer.from(await blob.arrayBuffer());
  let base = (name || doc.name || 'eticket').replace(/[^a-zA-Z0-9.\- ]/g, '_').trim().slice(0, 120) || 'eticket';
  const extMatch = String(doc.path).match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  if (ext && !base.toLowerCase().endsWith('.' + ext)) base += '.' + ext;

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${base}"; filename*=UTF-8''${encodeURIComponent(base)}`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
