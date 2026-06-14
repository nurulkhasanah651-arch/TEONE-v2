// Biaya layanan pembayaran online (Midtrans), dibebankan ke peserta per transaksi.
// CC 3%, e-wallet/QRIS 2%, VA/transfer bank tanpa biaya. (Plain module: aman dipakai client & server.)
export const PAY_METHODS = [
  { key: 'va',      short: 'Transfer Bank / VA',          rate: 0,    enabled: ['bank_transfer', 'echannel', 'permata_va', 'bca_va', 'bni_va', 'bri_va', 'cimb_va', 'other_va'] },
  { key: 'ewallet', short: 'E-Wallet / QRIS',             rate: 0.02, enabled: ['gopay', 'shopeepay', 'qris'] },
  { key: 'cc',      short: 'Kartu Kredit / Debit',        rate: 0.03, enabled: ['credit_card'] },
];

export function payMethod(key) { return PAY_METHODS.find((m) => m.key === key) || null; }

export function paymentFee(key, amount) {
  const m = payMethod(key);
  if (!m) return 0;
  return Math.round((Number(amount) || 0) * m.rate);
}
