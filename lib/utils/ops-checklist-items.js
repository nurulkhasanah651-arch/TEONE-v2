// Definisi Checklist Operasional per Group (per trip). FIXED di kode — state disimpan
// di kolom trips.ops_checklist (jsonb): { [key]: { done, at, by, note } }.
// Item dgn vendorFlow:true (Pre-book) nyimpen juga { offering, goahead, prebook }
// Offering & Prebook dipisah per layanan: Transport / Hotel / Land Arrangement.
// Path: lib/utils/ops-checklist-items.js

// Field teks yg boleh disimpan per item (selain done/at/by). Dipakai action utk whitelist.
export const OPS_CHECKLIST_TEXT_FIELDS = ['note', 'offering', 'goahead', 'prebook', 'offer_transport', 'offer_hotel', 'offer_land', 'prebook_transport', 'prebook_hotel', 'prebook_land'];

export const OPS_CHECKLIST_SECTIONS = [
  {
    key: 'penawaran',
    title: 'Penawaran & Approval',
    icon: '📝',
    items: [
      { key: 'quotation_requested', label: 'Quotation sudah di-request' },
      { key: 'update_estimate_income', label: 'Update ke Estimate Income' },
      { key: 'approval_bubos', label: 'Approval Bu Bos (owner)' },
    ],
  },
  {
    key: 'booking',
    title: 'Booking & Pelunasan',
    icon: '💳',
    items: [
      { key: 'pre_book', label: 'Pre-book', vendorFlow: true },
      { key: 'finalisasi_roomlist', label: 'Finalisasi roomlist' },
      { key: 'pelunasan_vendor', label: 'Pelunasan vendor' },
      { key: 'pelunasan_tiket', label: 'Pelunasan tiket' },
      { key: 'issued_tiket', label: 'Issued tiket' },
    ],
  },
  {
    key: 'dokumen',
    title: 'Dokumen Perjalanan',
    icon: '📄',
    items: [
      { key: 'check_working_itin', label: 'Cek working itinerary' },
      { key: 'voucher_hotel', label: 'Voucher hotel' },
    ],
  },
  {
    key: 'optional',
    title: 'Optional Tour',
    icon: '🎈',
    items: [
      { key: 'optional_shared', label: 'Optional sudah di-share' },
      { key: 'optional_booked', label: 'Optional sudah dipesan' },
      { key: 'optional_paid', label: 'Optional sudah dibayar' },
    ],
  },
  {
    key: 'pra_berangkat',
    title: 'Pra-Keberangkatan',
    icon: '🧳',
    items: [
      { key: 'cek_visa_paspor', label: 'Double cek visa & paspor' },
      { key: 'briefing_tl', label: 'Briefing TL' },
      { key: 'serah_terima_dok_tl', label: 'Serah terima dokumen ke TL' },
    ],
  },
];

// Daftar datar semua item (urutan sesuai section).
export const OPS_CHECKLIST_ITEMS = OPS_CHECKLIST_SECTIONS.flatMap((s) => s.items);

export const OPS_CHECKLIST_KEYS = OPS_CHECKLIST_ITEMS.map((i) => i.key);

export const OPS_CHECKLIST_TOTAL = OPS_CHECKLIST_ITEMS.length;

// Hitung berapa item yang sudah "done" dari sebuah object ops_checklist.
export function countDone(checklist) {
  const c = checklist || {};
  let n = 0;
  for (const k of OPS_CHECKLIST_KEYS) {
    if (c[k] && c[k].done) n += 1;
  }
  return n;
}
