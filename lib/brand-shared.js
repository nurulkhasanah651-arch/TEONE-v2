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

// Domain "etalase/storefront publik": root '/' diarahkan ke /home (bukan /login internal).
// Default: domain marketing .com. Bisa ditambah via env NEXT_PUBLIC_STOREFRONT_HOSTS (pisah koma).
export function isStorefrontHost(host = '') {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '').replace(/^www\./, '');
  const extra = (process.env.NEXT_PUBLIC_STOREFRONT_HOSTS || '')
    .split(',').map((x) => x.trim().toLowerCase().replace(/^www\./, '')).filter(Boolean);
  const defaults = ['travelingeropa.com', 'khasanahtravel.com'];
  return [...defaults, ...extra].includes(h);
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
  teone: { label: 'TEONE', sub: 'One System', icon: '\u2708', title: 'TEONE — Traveling Eropa One System', description: 'Sistem operasi travel terpadu untuk Traveling Eropa', footer: 'TEONE v2.0 · Travel Operations One System', welcome: 'Selamat datang kembali di TEONE — Traveling Eropa One System.' },
  khasanah: { label: 'KHASANAH', sub: 'Umroh & Hajj', icon: '\ud83d\udd4b', title: 'Khasanah Travel — Umroh & Hajj', description: 'Sistem operasi travel umroh & hajj Khasanah Travel', footer: 'Khasanah Travel · PT Khasanah Global Travelindo', welcome: "Assalamu'alaikum, selamat datang di Khasanah Travel One System." },
};

// ============ Multi-database: 1 project Supabase per brand ============
// Khasanah punya database terpisah total (data, file, login).
// Env var _KHASANAH di-set di Vercel; fallback ke env TEONE kalau belum ada.
export function supabaseEnvFor(code) {
  if (code === 'khasanah') {
    return {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_KHASANAH || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

export function siteUrlFor(code) {
  if (code === 'khasanah') {
    return process.env.NEXT_PUBLIC_SITE_URL_KHASANAH || 'https://khasanah-travel.vercel.app';
  }
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://teone.dev';
}
