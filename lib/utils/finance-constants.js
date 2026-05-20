// Finance categories — mirrored from v1 schema

export const INCOME_CATEGORIES = {
  'Selling Prices': ['Quad room', 'Triple room', 'Double/Twin', 'Single', 'Child no bed', 'Infant'],
  'Land Tour':      ['Land tour quad', 'Land tour triple', 'Land tour double', 'Land tour single'],
  'Tambahan':       ['Tipping Guide', 'City Tax', 'Visa', 'Asuransi', 'Optional', 'Cancellation fee', 'Discount/Refund', 'Tambahan Tiket'],
};

export const HPP_CATEGORIES = {
  'Flight':      ['Flight Internasional', 'Flight Domestik'],
  'Hotel':       ['Hotel 1', 'Hotel 2', 'Hotel 3', 'Hotel 4', 'Hotel 5'],
  'Operasional': ['Transport', 'Meals', 'Handling', 'Visa', 'Asuransi', 'Tipping Driver', 'Tipping Guide', 'Public Transport'],
  'Tour Leader': ['Fee Tour Leader', 'Reimburse TL'],
  'Lainnya':     ['Selisih Kurs', 'Fee Mitra', 'Optional Tour'],
};

export const PAYMENT_STATUS_OPTS = ['belum bayar', 'DP', 'lunas', 'overdue', 'tidak perlu'];

export const PAYMENT_STATUS_CFG = {
  'belum bayar':  { bg: 'bg-slate-100',  text: 'text-slate-700',  label: 'Belum Bayar' },
  'DP':           { bg: 'bg-amber-100',  text: 'text-amber-700',  label: 'DP' },
  'lunas':        { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Lunas' },
  'overdue':      { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Overdue' },
  'tidak perlu':  { bg: 'bg-slate-50',   text: 'text-slate-500',  label: '—' },
};
