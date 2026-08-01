// Deteksi "Umroh Plus <negara lain>" untuk memecah harga pokok di invoice jadi
// Paket Umroh + Paket Tour <negara>. Total tidak berubah — display only.
// Template harga tour diambil dari tabel tour_addon_templates (dikelola Finance),
// jadi menambah negara baru cukup lewat UI Finance, tanpa ubah kode.
// Path: lib/utils/umroh-plus.js

// Normalisasi: huruf kecil + buang non-alfanumerik → "Abu Dhabi" == "abudhabi".
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

// keywords: slot dipisah KOMA (semua wajib ada / AND); tiap slot bisa punya
// alternatif dipisah "|" (salah satu cukup / OR). Contoh: "turki|turkey,dubai,abudhabi".
function matchTemplate(tpl, nameNorm) {
  const slots = String(tpl.keywords || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!slots.length) return 0;
  for (const slot of slots) {
    const alts = slot.split('|').map((x) => norm(x)).filter(Boolean);
    if (!alts.length) return 0;
    if (!alts.some((a) => nameNorm.includes(a))) return 0; // slot ini tak terpenuhi
  }
  return slots.length; // spesifisitas = jumlah slot yang cocok
}

// Pilih template paling SPESIFIK (slot terbanyak) yg cocok dgn nama trip.
// templates: array { label, keywords, amount, active }. Return { label, amount } | null.
export function detectTourAddon(tripName, templates) {
  const nameNorm = norm(tripName);
  if (!nameNorm || !Array.isArray(templates) || !templates.length) return null;
  let best = null; let bestScore = 0;
  for (const t of templates) {
    if (t.active === false) continue;
    const score = matchTemplate(t, nameNorm);
    if (score > bestScore || (score === bestScore && best && Number(t.amount) > Number(best.amount))) {
      if (score > 0) { best = t; bestScore = score; }
    }
  }
  if (!best) return null;
  return { label: best.label, amount: Number(best.amount) || 0 };
}

// age_type/room_type yg TIDAK dipecah (infant saja). child_no_bed TETAP dipecah.
export function isInfantRoom(roomTypeOrAge) {
  const t = String(roomTypeOrAge || '').toLowerCase();
  return t.includes('infant');
}
