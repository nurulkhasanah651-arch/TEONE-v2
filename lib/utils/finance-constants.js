// Round 82: Finance constants — 9 HPP categories sesuai request user

// HPP_CATEGORIES: object {category: [components]} untuk dropdown
export const HPP_CATEGORIES = {
  'Tiket Internasional': ['Tiket Maskapai', 'Refund / Cancel Fee', 'Reissue Fee', 'Bagasi Tambahan', 'Lain-lain'],
  'Hotel':              ['DP Hotel', 'Pelunasan Hotel', 'Extra Room', 'Upgrade', 'Lain-lain'],
  'LA (Land Arrangement)': ['Paket LA', 'Guide Lokal', 'Entrance Tiket', 'Meal Plan', 'Lain-lain'],
  'Transport':          ['Bus / Coach', 'Train', 'Boat / Ferry', 'Transfer Bandara', 'Lain-lain'],
  'Visa':               ['Visa Fee', 'Service Fee Vendor', 'Asuransi Visa', 'Express Fee', 'Lain-lain'],
  'Asuransi':           ['Asuransi Perjalanan', 'Asuransi Bagasi', 'Lain-lain'],
  'Flight Domestik':    ['Tiket Domestik', 'Bagasi Domestik', 'Reissue Domestik', 'Lain-lain'],
  'Optional':           ['Optional Tour', 'Cruise', 'Show / Event', 'Lain-lain'],
  'Custom':             ['Custom Item'],
};

// Income categories (untuk yang manual)
export const INCOME_CATEGORIES = {
  'Manual Income': ['Cashback', 'Refund Vendor', 'Commission Partner', 'Lain-lain'],
};

// Payment status options
export const PAYMENT_STATUS_OPTS = ['belum bayar', 'DP', 'lunas'];

// Payment request status options
export const PAYMENT_REQ_STATUS = {
  pending: { label: 'Belum Request', color: 'bg-slate-100 text-slate-700' },
  requested: { label: '⏳ Request Approval', color: 'bg-amber-100 text-amber-800' },
  approved: { label: '✓ Approved', color: 'bg-green-100 text-green-800' },
  paid: { label: '💰 Lunas', color: 'bg-blue-100 text-blue-800' },
  rejected: { label: '✕ Rejected', color: 'bg-red-100 text-red-800' },
};

export function hppCategoryList() {
  return Object.keys(HPP_CATEGORIES);
}
