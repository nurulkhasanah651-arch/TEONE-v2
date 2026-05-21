// Default predeparture checklist & vendor types untuk Portal TL

export const DEFAULT_TL_CHECKLIST = [
  'Cek tiket pesawat semua peserta',
  'Cek passport & visa lengkap',
  'Cek koper & label tag',
  'Cek asuransi perjalanan',
  'Briefing peserta H-1',
  'Cek meeting point & jam',
  'Cek transportasi airport ↔ hotel',
  'Cek hotel confirmation voucher',
  'Cek itinerary harian + booking restoran',
  'Cek vendor visa, guide, bus',
  'Cek emergency contact (lokal + Indo)',
  'Bawa kit P3K & obat-obatan',
  'Bawa SIM Card / pocket WiFi',
  'Charger HP + power bank',
  'Print itinerary + manifest',
];

export const TL_EXPENSE_CATEGORIES = [
  'Makan',
  'Transport Lokal',
  'Tips Guide/Driver',
  'Tiket Atraksi',
  'Air & Snack',
  'Emergency',
  'Komunikasi',
  'Laundry',
  'Lainnya',
];

export const VENDOR_TYPES = [
  { value: 'hotel', label: 'Hotel', icon: '🏨' },
  { value: 'bus', label: 'Bus/Transport', icon: '🚌' },
  { value: 'restaurant', label: 'Restoran', icon: '🍽' },
  { value: 'guide', label: 'Guide', icon: '🧑‍🏫' },
  { value: 'visa', label: 'Vendor Visa', icon: '🛂' },
  { value: 'maskapai', label: 'Maskapai', icon: '✈️' },
  { value: 'lainnya', label: 'Lainnya', icon: '🏢' },
];
