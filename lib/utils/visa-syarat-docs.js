// Registry dokumen Syarat Visa & contoh (di-host di /public/visa-syarat).
// Dilampirkan (link) saat kirim WA syarat / pengumpulan dokumen, sesuai negara trip.

export const VISA_SYARAT_DOCS = {
  schengen: [
    { label: 'Syarat Visa Schengen', file: 'syarat-schengen.pdf' },
    { label: 'Spesifikasi Foto Visa Schengen', file: 'foto-schengen.pdf' },
  ],
  usa: [{ label: 'Syarat Visa Amerika Serikat (USA)', file: 'syarat-usa.pdf' }],
  australia: [{ label: 'Syarat Visa Australia', file: 'syarat-australia.pdf' }],
  nz: [{ label: 'Syarat Visa New Zealand', file: 'syarat-nz.pdf' }],
};

// Deteksi negara dari teks bebas trip.visa_country / hint
export function syaratCountryKey(visaCountry, hint) {
  const c = String(visaCountry || hint || '').toLowerCase();
  if (/usa|amerika|united states|america/.test(c)) return 'usa';
  if (/australia|aussie|aus\b/.test(c)) return 'australia';
  if (/new zealand|selandia|nz\b/.test(c)) return 'nz';
  if (/uk|united kingdom|inggris|britain|england/.test(c)) return 'schengen'; // sementara pakai schengen umum bila belum ada PDF UK
  if (/france|prancis|perancis|schengen|eropa|europe|italy|italia|spain|spanyol|germany|jerman|swiss|belanda|netherlands|austria|yunani|greece|portugal/.test(c)) return 'schengen';
  return null;
}

// Daftar {label, url} untuk negara tertentu (siteBase tanpa trailing slash)
export function syaratLinksFor(visaCountry, siteBase, hint) {
  const key = syaratCountryKey(visaCountry, hint);
  if (!key) return [];
  const base = String(siteBase || '').replace(/\/$/, '');
  return (VISA_SYARAT_DOCS[key] || []).map((d) => ({ label: d.label, url: `${base}/visa-syarat/${d.file}` }));
}
