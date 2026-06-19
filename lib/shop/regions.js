// Kategori region untuk storefront — bucketing dari destination/nama trip
// Top-level: UK+Ireland dipisah dari Eropa. Sub-kategori untuk Eropa & Asia.
// Urutan PENTING: yang lebih spesifik didahulukan (uk_ireland & russia sebelum eropa).
export const REGIONS = [
  { key: 'uk_ireland', label: 'UK + Ireland', icon: '🇬🇧', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&q=80',
    kw: ['united kingdom','england','scotland','ireland','irland','irlandia','wales','britain','london','edinburgh','dublin'] },
  { key: 'russia',  label: 'Russia', icon: '🪆', image: 'https://images.unsplash.com/photo-1547448415-e9f5b28e570d?w=600&q=80',
    kw: ['russia','rusia','moscow','moskow','sapsan','kremlin','st petersburg'] },
  { key: 'eropa',   label: 'Eropa', icon: '🏰', image: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80',
    kw: ['eropa','europe','west europe','east europe','spain','portugal','andalusia','santorini','malta','greece','amalfi','south italy','italy','itali','dolomites','dolomite','scandinavia','baltic','lofoten','iceland','islandia','aurora','balkan','we autumn','we summer','zermatt','france','prancis','schengen','amsterdam','paris','hallstat','monaco'] },
  { key: 'asia',    label: 'Asia', icon: '🏯', image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=600&q=80',
    kw: ['asia','china','tiongkok','japan','jepang','hokkaido','alpine route','korea','vietnam','hongkong','hong kong','macau','thailand','singapore'] },
  { key: 'oseania', label: 'New Zealand & Australia', icon: '🦘', image: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=600&q=80',
    kw: ['australia','new zealand','selandia','nz','aussie','sydney','melbourne'] },
  { key: 'amerika', label: 'Amerika & Canada', icon: '🗽', image: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=600&q=80',
    kw: ['amerika','america','usa','united states','canada','kanada','new york','west coast','east coast'] },
];

// Sub-kategori per region induk. Urutan PENTING (spesifik dulu).
export const SUBCATEGORIES = {
  eropa: [
    { key: 'spain-portugal', label: 'Spain & Portugal', icon: '🇪🇸', kw: ['spain','portugal','andalusia','iberia'] },
    { key: 'santorini',      label: 'Santorini & Mediterania', icon: '🏖️', kw: ['santorini','greece','yunani','malta','amalfi','south italy'] },
    { key: 'scandinavia',    label: 'Scandinavia & Aurora', icon: '🌌', kw: ['scandinavia','baltic','lofoten','aurora','iceland','islandia','norway','norwegia','finland'] },
    { key: 'east-europe',    label: 'East Europe', icon: '🏰', kw: ['east europe','eastern europe','hallstat','dolomites','dolomite','balkan'] },
    { key: 'west-europe',    label: 'West Europe', icon: '🗼', kw: ['west europe','western europe','we autumn','we summer','zermatt','swiss','france','prancis','italy','itali'] },
  ],
  asia: [
    { key: 'jepang',   label: 'Jepang', icon: '🗾', kw: ['japan','jepang','hokkaido','tokyo','osaka','alpine route'] },
    { key: 'china',    label: 'China', icon: '🐼', kw: ['china','tiongkok','shanghai','beijing','swiss of asia'] },
    { key: 'vietnam',  label: 'Vietnam', icon: '🇻🇳', kw: ['vietnam','hanoi','halong','ho chi minh'] },
    { key: 'hongkong', label: 'Hong Kong', icon: '🌃', kw: ['hongkong','hong kong','macau'] },
    { key: 'korea',    label: 'Korea', icon: '🇰🇷', kw: ['korea','seoul'] },
  ],
};

function hayOf(t) { return `${t?.destination || ''} ${t?.name || ''}`.toLowerCase(); }

export function tripRegion(t) {
  const hay = hayOf(t);
  for (const r of REGIONS) {
    if (r.kw.some((k) => hay.includes(k))) return r.key;
  }
  return null;
}
export function regionLabel(key) { return REGIONS.find((r) => r.key === key)?.label || key; }

// Sub-kategori sebuah trip dalam region induk tertentu (null kalau tak cocok).
export function tripSubcat(t, regionKey) {
  const subs = SUBCATEGORIES[regionKey];
  if (!subs) return null;
  const hay = hayOf(t);
  for (const s of subs) {
    if ((s.kw || []).some((k) => k && hay.includes(k))) return s.key;
  }
  return null;
}
export function subcatsForRegion(regionKey) { return SUBCATEGORIES[regionKey] || []; }
export function subcatLabel(regionKey, subKey) {
  return (SUBCATEGORIES[regionKey] || []).find((s) => s.key === subKey)?.label || subKey;
}

// Region efektif: pakai region dari Etalase (DB) kalau ada; selain itu fallback ke REGIONS default.
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
  const hay = hayOf(t);
  for (const r of list) {
    if ((r.kw || []).some((k) => k && hay.includes(k))) return r.key;
  }
  return null;
}
