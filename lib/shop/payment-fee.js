// Biaya admin pembayaran online (Midtrans).
// - DP AWAL via web: Rp 13.000 (di-bake saat checkout, lihat shop-checkout).
// - Pembayaran online lainnya (milestone & invoice): FLAT Rp 6.000 per transaksi.
// Tidak ada lagi surcharge persentase per metode. (Plain module: aman client & server.)
export const ADMIN_FEE_DP_WEB = 13000;
export const ADMIN_FEE_ONLINE = 6000;

export const PAY_METHODS = [
  { key: 'va',      short: 'Virtual Account', desc: 'BCA, BNI, BRI, Permata, CIMB, Mandiri', rate: 0, enabled: ['bca_va', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'other_va', 'echannel'] },
  { key: 'ewallet', short: 'E-Wallet / QRIS',  desc: 'GoPay, ShopeePay, OVO (via QRIS), QRIS', rate: 0, enabled: ['gopay', 'shopeepay', 'qris'] },
  { key: 'cc',      short: 'Kartu Kredit / Debit', desc: 'Visa, Mastercard, JCB',             rate: 0, enabled: ['credit_card'] },
];

export function payMethod(key) { return PAY_METHODS.find((m) => m.key === key) || null; }

// Legacy: tidak ada surcharge per-metode lagi (biaya admin kini flat via konstanta di atas).
export function paymentFee() { return 0; }
