// Metode pembayaran online (Midtrans). Biaya HANYA untuk Kartu Kredit/Debit (+3% per transaksi).
// VA/Transfer Bank & E-Wallet/QRIS tanpa biaya tambahan. (Plain module: aman client & server.)
export const PAY_METHODS = [
  { key: 'va',      short: 'Virtual Account', desc: 'BCA, BNI, BRI, Permata, CIMB, Mandiri', rate: 0,    enabled: ['bca_va', 'bni_va', 'bri_va', 'permata_va', 'cimb_va', 'other_va', 'echannel'] },
  { key: 'ewallet', short: 'E-Wallet / QRIS',                 desc: 'GoPay, ShopeePay, OVO (via QRIS), QRIS', rate: 0,    enabled: ['gopay', 'shopeepay', 'qris'] },
  { key: 'cc',      short: 'Kartu Kredit / Debit',            desc: 'Visa, Mastercard, JCB',                 rate: 0.03, enabled: ['credit_card'] },
];

export function payMethod(key) { return PAY_METHODS.find((m) => m.key === key) || null; }

export function paymentFee(key, amount) {
  const m = payMethod(key);
  if (!m) return 0;
  return Math.round((Number(amount) || 0) * m.rate);
}
