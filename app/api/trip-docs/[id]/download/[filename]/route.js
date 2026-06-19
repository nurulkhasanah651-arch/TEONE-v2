// Stream download dokumen trip via domain sendiri dengan header attachment.
// Nama file asli jadi segmen URL terakhir → HP menyimpan dengan nama benar
// walau Content-Disposition diabaikan. Andal di desktop & mobile.
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function svc() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createServiceClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function parseStorageUrl(fileUrl) {
  if (!fileUrl) return null;
  const m = String(fileUrl).match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

const MIME = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword', csv: 'text/csv', txt: 'text/plain',
};

export async function GET(req, { params }) {
  const id = params?.id;
  if (!id) return new Response('Bad request', { status: 400 });
  const supabase = svc();
  if (!supabase) return new Response('Service unavailable', { status: 503 });

  const { data: doc } = await supabase
    .from('trip_documents').select('file_url, file_path, title').eq('id', id).maybeSingle();
  if (!doc) return new Response('Not found', { status: 404 });

  let path = doc.file_path || null;
  let bucket = null;
  const parsed = parseStorageUrl(doc.file_url);
  if (parsed) { bucket = parsed.bucket; path = path || parsed.path; }
  if (!path) {
    if (doc.file_url) return Response.redirect(doc.file_url, 302);
    return new Response('No file', { status: 404 });
  }
  const candidates = bucket ? [bucket] : ['trip-docs', 'tl-uploads'];

  let blob = null;
  for (const b of candidates) {
    const { data, error } = await supabase.storage.from(b).download(path);
    if (!error && data) { blob = data; break; }
  }
  if (!blob) {
    if (doc.file_url) return Response.redirect(doc.file_url, 302);
    return new Response('File not found in storage', { status: 404 });
  }

  const src = path || doc.file_url || '';
  const extMatch = String(src).match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  const ext = extMatch ? extMatch[1].toLowerCase() : '';
  // Nama dari segmen URL (dikirim client) atau fallback dari judul
  let base = '';
  try { base = decodeURIComponent(params?.filename || ''); } catch { base = params?.filename || ''; }
  base = (base || doc.title || 'dokumen').replace(/[^a-zA-Z0-9.\- ]/g, '_').trim().slice(0, 100) || 'dokumen';
  if (ext && !base.toLowerCase().endsWith('.' + ext)) base += '.' + ext;

  const buf = Buffer.from(await blob.arrayBuffer());
  // Paksa unduh (jangan preview inline di HP): selalu octet-stream
  const contentType = 'application/octet-stream';

  return new Response(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${base}"; filename*=UTF-8''${encodeURIComponent(base)}`,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, no-store',
    },
  });
}
