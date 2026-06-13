// Kategori region untuk storefront — bucketing dari destination/nama trip
export const REGIONS = [
  { key: 'eropa',   label: 'Eropa & United Kingdom', icon: '🏰', image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80',
    kw: ['eropa','europe','uk','england','scotland','ireland','wales','spain','portugal','italy','itali','france','prancis','swiss','schengen','amsterdam','paris','turki','turkey'] },
  { key: 'asia',    label: 'Asia', icon: '🏯', image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600&q=80',
    kw: ['asia','china','tiongkok','japan','jepang','korea','vietnam','hongkong','macau','thailand','singapore'] },
  { key: 'oseania', label: 'New Zealand & Australia', icon: '🦘', image: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=600&q=80',
    kw: ['australia','new zealand','selandia','nz','aussie','sydney','melbourne'] },
  { key: 'amerika', label: 'Amerika & Canada', icon: '🗽', image: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=600&q=80',
    kw: ['amerika','america','usa','united states','canada','kanada','new york'] },
  { key: 'russia',  label: 'Russia', icon: '🪆', image: 'https://images.unsplash.com/photo-1547448415-e9f5b28e570d?w=600&q=80',
    kw: ['russia','rusia','moscow','moskow','aurora'] },
];

export function tripRegion(t) {
  const hay = `${t?.destination || ''} ${t?.name || ''}`.toLowerCase();
  for (const r of REGIONS) {
    if (r.kw.some((k) => hay.includes(k))) return r.key;
  }
  return null;
}
export function regionLabel(key) { return REGIONS.find((r) => r.key === key)?.label || key; }

// Region efektif: pakai region dari Etalase (DB) kalau ada; selain itu fallback ke REGIONS default.
// Tiap region dari DB: {key,label,icon,image,kw}. Foto kosong → pakai fallback default by key.
export function effectiveRegions(dbRegions) {
  if (!Array.isArray(dbRegions) || dbRegions.length === 0) return REGIONS;
  return dbRegions.map((r) => {
    const fb = REGIONS.find((x) => x.key === r.key);
    return {
      key: r.key,
      label: r.label || fb?.label || r.key,
      icon: r.icon || fb?.icon || '🌍',
      image: r.image || fb?.image || '',
      kw: (Array.isArray(r.kw) && r.kw.length) ? r.kw : (fb?.kw || []),
    };
  });
}

// tripRegion dengan daftar region tertentu (dipakai server saat filter publik)
export function tripRegionIn(t, regions) {
  const list = (Array.isArray(regions) && regions.length) ? regions : REGIONS;
  const hay = `${t?.destination || ''} ${t?.name || ''}`.toLowerCase();
  for (const r of list) {
    if ((r.kw || []).some((k) => k && hay.includes(k))) return r.key;
  }
  return null;
}
