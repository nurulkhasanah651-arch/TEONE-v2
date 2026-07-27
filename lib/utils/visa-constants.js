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
  { value: 'pending',         label: 'Pending',              color: 'slate' },
  { value: 'collecting',      label: 'Collecting Docs',      color: 'amber' },
  { value: 'ready_to_submit', label: 'Ready to Submit',      color: 'blue' },
  { value: 'submitted',       label: 'Submitted',            color: 'blue' },
  { value: 'biometric',       label: 'Biometric Done',       color: 'indigo' },
  { value: 'on_process',      label: 'On Process Approval',  color: 'purple' },
  { value: 'approved',        label: 'Approved ✓',           color: 'green' },
  { value: 'rejected',        label: 'Rejected',             color: 'red' },
  { value: 'not_required',    label: 'Tidak Perlu',          color: 'slate' },
];

export const STATUS_COLOR_CLASS = {
  slate:  'bg-slate-100  text-slate-700',
  amber:  'bg-amber-100  text-amber-700',
  blue:   'bg-blue-100   text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  purple: 'bg-purple-100 text-purple-700',
  green:  'bg-green-100  text-green-700',
  red:    'bg-red-100    text-red-700',
};

// ═══ STATUS VISA OTOMATIS ═══
// Dihitung dari sinyal nyata (dokumen lengkap → biometrik → hasil), bukan input manual,
// supaya selalu akurat tanpa perlu di-update tangan. Urutan prioritas dari akhir alur.
// Stage: belum_mulai → lengkapi_dokumen → siap_biometrik → biometrik_terjadwal → proses → approved/rejected
export const VISA_STAGES = {
  punya_visa:         { label: 'Punya Visa',          color: 'green'  },
  tidak_perlu:        { label: 'Tidak Perlu Visa',    color: 'slate'  },
  approved:           { label: 'Approved ✓',          color: 'green'  },
  rejected:           { label: 'Ditolak',             color: 'red'    },
  proses:             { label: 'Proses Approval',     color: 'purple' },
  biometrik_terjadwal:{ label: 'Biometrik Terjadwal', color: 'blue'   },
  siap_biometrik:     { label: 'Siap Biometrik',      color: 'indigo' },
  lengkapi_dokumen:   { label: 'Lengkapi Dokumen',    color: 'amber'  },
  belum_mulai:        { label: 'Belum Mulai',         color: 'slate'  },
};

export function deriveVisaStage(p, template = []) {
  if (!p) return { key: 'belum_mulai', ...VISA_STAGES.belum_mulai };
  const needs = p.include_visa === true && p.visa_ready !== true;
  const res = p.visa_result;
  const bio = p.visa_biometric_date;
  let today = '';
  try { today = new Date().toISOString().slice(0, 10); } catch {}

  let key;
  if (p.visa_ready === true) key = 'punya_visa';
  else if (!needs) key = 'tidak_perlu';
  else if (res === 'approved') key = 'approved';
  else if (res === 'rejected') key = 'rejected';
  else if (bio) key = (String(bio) <= today) ? 'proses' : 'biometrik_terjadwal';
  else {
    const docs = Array.isArray(p.visa_docs) ? p.visa_docs : [];
    const tmpl = (Array.isArray(template) && template.length) ? template : null;
    const complete = tmpl
      ? tmpl.filter((d) => docs.find((x) => x.name === d && x.complete)).length
      : docs.filter((x) => x.complete).length;
    const total = tmpl ? tmpl.length : docs.length;
    if (total > 0 && complete >= total) key = 'siap_biometrik';
    else if (complete > 0) key = 'lengkapi_dokumen';
    else key = 'belum_mulai';
  }
  return { key, ...VISA_STAGES[key] };
}
