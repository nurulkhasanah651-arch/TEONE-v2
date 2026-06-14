// Biaya layanan pembayaran online (Midtrans), dibebankan ke peserta per transaksi.
// Hanya Kartu Kredit/Debit (+3% per transaksi). Transfer manual tetap terpisah // CC 3%, e-wallet/QRIS 2%, VA/transfer bank tanpa biaya. (Plain module: aman dipakai client & server.) tanpa biaya. (Plain module: aman client // CC 3%, e-wallet/QRIS 2%, VA/transfer bank tanpa biaya. (Plain module: aman dipakai client & server.) server.)
export const PAY_METHODS = [
  { key: 'cc', short: 'Kartu Kredit / Debit', rate: 0.03, enabled: ['credit_card'] },
];

export function payMethod(key) { return PAY_METHODS.find((m) => m.key === key) || null; }

export function paymentFee(key, amount) {
  const m = payMethod(key);
  if (!m) return 0;
  return Math.round((Number(amount) || 0) * m.rate);
}
