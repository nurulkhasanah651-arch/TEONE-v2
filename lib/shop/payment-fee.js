// Biaya admin pembayaran online (Midtrans):
// - Kartu Kredit/Debit (cc): 3% dari nominal — untuk DP maupun semua pembayaran.
// - QRIS: 0,7% dari nominal (DP web maupun cicilan/pelunasan apa pun).
// - Metode lain (VA, e-wallet GoPay/ShopeePay): FLAT — DP awal web Rp 13.000, pembayaran lain Rp 6.000.
// Fee dicatat sebagai Cash In "Biaya Admin". (Plain module: aman client & server.)
export const ADMIN_FEE_DP_WEB = 13000;
export const ADMIN_FEE_ONLINE = 6000;
export const CC_RATE = 0.03;
export const QRIS_RATE = 0.007; // 0,7% — biaya QRIS dibebankan ke peserta

// Metode online AKTIF: hanya Virtual Account & QRIS. (Kartu Kredit & GoPay/ShopeePay
// dinonaktifkan — belum tersedia di Midtrans.) Transfer bank manual = pilihan terpisah.
export const PAY_METHODS = [
  { key: 'va',      short: 'Virtual Account', desc: 'Mandiri, BNI, Permata, BRI, CIMB', rate: 0, enabled: ['echannel', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'other_va'] },
  { key: 'qris',    short: 'QRIS (Scan QR)',  desc: 'Scan 1 QR pakai e-wallet / m-banking apa pun (GoPay, OVO, DANA, ShopeePay, dll)', rate: QRIS_RATE, enabled: ['other_qris'] },
];

export function payMethod(key) { return PAY_METHODS.find((m) => m.key === key) || null; }

// Fee berdasarkan KEY metode (dipakai saat charging di start*).
export function paymentFee(key, amount, { dpWeb = false } = {}) {
  if (key === 'cc') return Math.round((Number(amount) || 0) * CC_RATE);
  if (key === 'qris') return Math.round((Number(amount) || 0) * QRIS_RATE);
  return dpWeb ? ADMIN_FEE_DP_WEB : ADMIN_FEE_ONLINE;
}

// Deteksi CC dari label metode (hasil midtransMethodLabel di webhook).
export function isCreditCardLabel(label) { return /credit|kartu|debit|\bcc\b/i.test(String(label || '')); }
// Deteksi QRIS dari label metode.
export function isQrisLabel(label) { return /qris/i.test(String(label || '')); }

// Fee berdasarkan LABEL metode (dipakai saat catat accounting di fulfillment/webhook).
export function adminFeeFromLabel(label, base, { dpWeb = false } = {}) {
  // Transfer bank manual: TIDAK ada biaya admin (admin hanya untuk pembayaran online).
  if (/manual/i.test(String(label || ''))) return 0;
  if (isCreditCardLabel(label)) return Math.round((Number(base) || 0) * CC_RATE);
  if (isQrisLabel(label)) return Math.round((Number(base) || 0) * QRIS_RATE);
  return dpWeb ? ADMIN_FEE_DP_WEB : ADMIN_FEE_ONLINE;
}
