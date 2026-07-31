// Checklist kesiapan keberangkatan group (H-20). Dipakai server (hitung total) & client (label).
// Path: lib/utils/departure-prep.js

export const PREP_ITEMS = [
  { key: 'dok_operation', label: 'Dokumen operation sudah diupload' },
  { key: 'tl_brief', label: 'TL sudah dibrief' },
  { key: 'manifest_final', label: 'Manifest & roomlist final' },
  { key: 'tiket_issued', label: 'Tiket sudah issued' },
  { key: 'visa_selesai', label: 'Visa selesai / tidak perlu' },
  { key: 'handling_vendor', label: 'Handling & vendor confirmed' },
  { key: 'perlengkapan', label: 'Perlengkapan group siap' },
];

export const PREP_KEYS = PREP_ITEMS.map((i) => i.key);

// H-20: masuk pantauan kesiapan keberangkatan kalau <= 20 hari & belum berangkat.
export const PREP_WINDOW_DAYS = 20;
