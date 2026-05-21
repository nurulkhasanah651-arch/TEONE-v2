// Visa related constants — default doc list, status options

export const DEFAULT_VISA_DOCS = [
  'Passport (scan)',
  'Photo 4x6 latar putih',
  'KTP',
  'Kartu Keluarga (KK)',
  'Akta Kelahiran',
  'Akta Nikah (jika menikah)',
  'NPWP',
  'Rekening Koran 3 bulan',
  'Surat Keterangan Kerja',
  'Slip Gaji 3 bulan',
  'Form Aplikasi Visa',
  'Itinerary',
  'Bukti Booking Hotel',
  'Bukti Tiket Pulang-Pergi',
  'Asuransi Perjalanan',
];

export const VISA_STATUS_OPTS = [
  { value: 'pending',         label: 'Pending',          color: 'slate' },
  { value: 'collecting',      label: 'Collecting Docs',  color: 'amber' },
  { value: 'ready_to_submit', label: 'Ready to Submit',  color: 'blue' },
  { value: 'submitted',       label: 'Submitted',        color: 'blue' },
  { value: 'biometric',       label: 'Biometric Done',   color: 'indigo' },
  { value: 'approved',        label: 'Approved ✓',       color: 'green' },
  { value: 'rejected',        label: 'Rejected',         color: 'red' },
  { value: 'not_required',    label: 'Tidak Perlu',      color: 'slate' },
];

export const STATUS_COLOR_CLASS = {
  slate:  'bg-slate-100  text-slate-700',
  amber:  'bg-amber-100  text-amber-700',
  blue:   'bg-blue-100   text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  green:  'bg-green-100  text-green-700',
  red:    'bg-red-100    text-red-700',
};
