// Biaya admin pembayaran online (Midtrans):
// - Kartu Kredit/Debit (cc): 3% dari nominal — untuk DP maupun semua pembayaran.
// - Metode lain (VA, e-wallet/QRIS): FLAT — DP awal web Rp 13.000, pembayaran lain Rp 6.000.
// Fee dicatat sebagai Cash In "Biaya Admin". (Plain module: aman client & server.)
export const ADMIN_FEE_DP_WEB = 13000;
export const ADMIN_FEE_ONLINE = 6000;
export const CC_RATE = 0.03;

export const PAY_METHODS = [
  { key: 'va',      short: 'Virtual Account', desc: 'Mandiri, BNI, Permata, BRI, CIMB', rate: 0,       enabled: ['echannel', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'other_va'] },
  { key: 'ewallet', short: 'E-Wallet / QRIS',  desc: 'GoPay, ShopeePay, OVO (via QRIS), QRIS', rate: 0,       enabled: ['gopay', 'shopeepay', 'qris'] },
];

export function payMethod(key) { return PAY_METHODS.find((m) => m.key === key) || null; }

// Fee berdasarkan KEY metode (dipakai saat charging di start*).
export function paymentFee(key, amount, { dpWeb = false } = {}) {
  if (key === 'cc') return Math.round((Number(amount) || 0) * CC_RATE);
  return dpWeb ? ADMIN_FEE_DP_WEB : ADMIN_FEE_ONLINE;
}

// Deteksi CC dari label metode (hasil midtransMethodLabel di webhook).
export function isCreditCardLabel(label) { return /credit|kartu|debit|\bcc\b/i.test(String(label || '')); }

// Fee berdasarkan LABEL metode (dipakai saat catat accounting di fulfillment/webhook).
export function adminFeeFromLabel(label, base, { dpWeb = false } = {}) {
  // Transfer bank manual: TIDAK ada biaya admin (admin hanya untuk pembayaran online).
  if (/manual/i.test(String(label || ''))) return 0;
  if (isCreditCardLabel(label)) return Math.round((Number(base) || 0) * CC_RATE);
  return dpWeb ? ADMIN_FEE_DP_WEB : ADMIN_FEE_ONLINE;
}
