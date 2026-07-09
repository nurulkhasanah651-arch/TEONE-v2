'use client';

// Kotak cari nama peserta — dipakai di semua daftar peserta per trip
// (Finance/Payment Matrix, Visa, Paspor, Perlengkapan, Portal TL).

export function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')   // buang gelar/tanda baca: "Hj.Musyaropah" -> "hj musyaropah"
    .replace(/\s+/g, ' ')
    .trim();
}

// Cocok kalau SEMUA kata di query muncul di nama (urutan bebas).
// "nur kha" cocok dgn "Nurul Khasanah"; "kha nur" juga cocok.
export function matchesName(name, query) {
  const q = normalizeName(query);
  if (!q) return true;
  const hay = normalizeName(name);
  if (!hay) return false;
  return q.split(' ').every((w) => hay.includes(w));
}

// Saring array peserta. getName: (pax) => string
export function filterByName(list, query, getName) {
  if (!query || !String(query).trim()) return list || [];
  return (list || []).filter((p) => matchesName(getName(p), query));
}

export default function PaxSearch({
  value,
  onChange,
  shown = null,
  total = null,
  placeholder = 'Cari nama peserta…',
  className = '',
}) {
  const active = !!(value && String(value).trim());
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
      <input
        type="search"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full sm:w-72 pl-9 pr-20 py-2 text-sm rounded-lg border border-slate-300 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none"
      />
      {active && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {shown !== null && total !== null && (
            <span className="text-[10px] font-bold text-slate-500 tabular-nums">{shown}/{total}</span>
          )}
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Hapus pencarian"
            className="px-1.5 text-slate-400 hover:text-slate-700 text-sm leading-none"
          >×</button>
        </div>
      )}
    </div>
  );
}
