// Trip document categories — di file utility biasa, bukan 'use server'
// (Next.js melarang export constant dari file 'use server')

export const DOC_CATEGORIES = [
  { value: 'hotel_voucher',  label: 'Hotel Voucher',     icon: '🏨' },
  { value: 'flight_ticket',  label: 'Tiket Pesawat',     icon: '✈️' },
  { value: 'vendor_contact', label: 'Kontak Vendor',     icon: '📞' },
  { value: 'transport',      label: 'Transport / Bus',   icon: '🚌' },
  { value: 'itinerary',      label: 'Itinerary',         icon: '📋' },
  { value: 'manifest',       label: 'Manifest',          icon: '👥' },
  { value: 'roomlist',       label: 'Roomlist',          icon: '🛏️' },
  { value: 'visa_invitation',label: 'Visa Invitation',   icon: '🛂' },
  { value: 'insurance',      label: 'Asuransi Polis',    icon: '🏥' },
  { value: 'other',          label: 'Dokumen Lain',      icon: '📄' },
];
