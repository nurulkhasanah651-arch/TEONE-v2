// Multi-brand: resolusi kode brand (edge-safe, tanpa dependency)
// Prioritas: ?brand= (untuk testing) > cookie > hostname
export const BRAND_CODES = ['teone', 'khasanah'];

export function resolveBrandCode({ queryParam, cookie, host } = {}) {
  if (queryParam && BRAND_CODES.includes(queryParam)) return queryParam;
  if (cookie && BRAND_CODES.includes(cookie)) return cookie;
  const h = (host || '').toLowerCase();
  if (h.includes('khasanah')) return 'khasanah';
  return 'teone';
}
