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

// Mapping kode brand → id di tabel brands (id tetap, dibuat di migrasi)
export const BRAND_IDS = { teone: 1, khasanah: 2 };

// Browser-side: tentukan brand dari cookie/hostname
export function resolveBrandCodeBrowser() {
  if (typeof document !== 'undefined') {
    const m = document.cookie.match(/(?:^|;\s*)brand=(\w+)/);
    if (m && BRAND_CODES.includes(m[1])) return m[1];
  }
  if (typeof window !== 'undefined') {
    return resolveBrandCode({ host: window.location.hostname });
  }
  return 'teone';
}

// Tampilan UI per brand (sidebar, judul halaman)
export const BRAND_UI = {
  teone: { label: 'TEONE', sub: 'One System', icon: '\u2708', title: 'TEONE — Traveling Eropa One System', description: 'Sistem operasi travel terpadu untuk Traveling Eropa', footer: 'TEONE v2.0 · Travel Operations One System' },
  khasanah: { label: 'KHASANAH', sub: 'Umroh & Hajj', icon: '\ud83d\udd4b', title: 'Khasanah Travel — Umroh & Hajj', description: 'Sistem operasi travel umroh & hajj Khasanah Travel', footer: 'Khasanah Travel · PT Khasanah Global Travelindo' },
};
