// R215m: Template WA visa workflow + variable replacer
// Path: lib/utils/visa-templates.js

export const VISA_WA_TEMPLATES = {
  doc_collection: {
    key: 'doc_collection',
    label: '📋 Pengumpulan Dokumen',
    description: 'Kirim list dokumen yg perlu dikirim/upload (link PDF)',
    template: `Hallo selamat siang, Kak {{nama_peserta}} 🙏

Kami dari tim visa Traveling Eropa ingin menginformasikan bahwa proses
*Visa {{country_name}}* untuk trip *{{nama_trip}}* (keberangkatan
{{tanggal_keberangkatan}}) akan segera dimulai ya.

📋 Persyaratan dokumen LENGKAP:
🔗 {{pdf_syarat_visa_url}}

{{template_section}}

⏰ Deadline pengiriman dokumen: *{{deadline_dokumen}}*

📦 Alamat kantor TE (kirim dokumen ke sini):
{{pickup_address}}

{{biometric_section}}

Kalau ada pertanyaan langsung chat aja ya, Kak 🙏

Terima kasih,
Tim Visa Traveling Eropa`,
  },

  doc_collection_no_biometric: {
    key: 'doc_collection_no_biometric',
    label: '📤 Pengumpulan Dokumen (No Biometrik)',
    description: 'Visa tanpa biometrik — kirim link upload portal',
    template: `Hallo Kak {{nama_peserta}} 🙏

Visa *{{country_name}}* untuk trip *{{nama_trip}}* TIDAK perlu biometrik
dan TIDAK perlu kirim dokumen fisik ya.

🔗 Persyaratan & list dokumen:
{{pdf_syarat_visa_url}}

📤 Link upload dokumen digital:
{{upload_portal_url}}

⏰ Deadline upload: *{{deadline_dokumen}}*

Tim Visa Traveling Eropa`,
  },

  doc_received: {
    key: 'doc_received',
    label: '✅ Dokumen Diterima & Review',
    description: 'Konfirmasi dokumen sudah diterima, sedang review',
    template: `Hallo Kak {{nama_peserta}} 🙏

✅ Dokumen visa Kaka untuk *{{nama_trip}}* sudah kami terima dan sedang
dalam proses REVIEW.

⏱ Estimasi review: 1-3 hari kerja
{{biometric_reminder}}

Kalau ada yang perlu dilengkapi akan kami info ASAP.

Tim Visa Traveling Eropa`,
  },

  doc_kurang: {
    key: 'doc_kurang',
    label: '⚠ Kekurangan Dokumen',
    description: 'Ada dokumen yang kurang/belum sesuai',
    template: `Hallo Kak {{nama_peserta}} 🙏

Mohon maaf, ada dokumen Visa {{country_name}} yang masih perlu dilengkapi:

{{list_dokumen_kurang}}

⏰ Mohon dilengkapi paling lambat: *{{deadline_kekurangan}}*

{{biometric_reminder}}

🔗 Detail persyaratan: {{pdf_syarat_visa_url}}

Tim Visa Traveling Eropa`,
  },

  biometric_reminder: {
    key: 'biometric_reminder',
    label: '📅 Reminder Biometrik',
    description: 'Reminder jadwal + checklist barang bawaan',
    template: `Hallo Kak {{nama_peserta}} 🙏

📅 *Jadwal Biometrik Visa {{country_name}}:*
🗓 {{tanggal_biometrik}} jam {{jam_biometrik}}
📍 {{lokasi_biometrik}}

🚗 Wajib dibawa:
☐ Paspor ASLI (cek: tidak ada bekas staples di cover)
☐ 2 lembar pas foto warna 3,5 x 4,5 latar PUTIH
☐ Cetak rekening koran 3-4 hari sebelum biometrik
☐ Surat referensi bank asli (bahasa Inggris)
☐ Semua dokumen asli untuk verifikasi

⏰ Datang 30 menit lebih awal ya, Kak!

⚠ Jadwal TIDAK BISA diubah (biaya reschedule Rp 1.100.000/orang)

Tim Visa Traveling Eropa`,
  },

  visa_approved: {
    key: 'visa_approved',
    label: '🎉 Visa APPROVED',
    description: 'Hasil visa approved + lampirkan foto',
    template: `🎉 Selamat Kak {{nama_peserta}}!

✅ *Visa {{country_name}} Kaka SUDAH APPROVED*

📎 Foto visa terlampir.

Validity: {{visa_valid_from}} s/d {{visa_valid_until}}
Type: {{visa_entry_type}}

✈ Paspor asli akan kami kirim via {{return_kurir}}
Resi: {{return_resi}}

Selamat menanti perjalanannya! 🌍

Tim Visa Traveling Eropa`,
  },

  visa_rejected: {
    key: 'visa_rejected',
    label: '❌ Visa REJECTED',
    description: 'Hasil visa rejected + opsi',
    template: `Hallo Kak {{nama_peserta}} 🙏

Mohon maaf, hasil visa {{country_name}} untuk trip {{nama_trip}}: *DITOLAK*

📎 Surat resmi penolakan dari embassy terlampir.

Alasan: {{rejection_reason}}

🔄 Opsi yg tersedia:
1. Re-apply (biaya visa bayar ulang)
2. Refund tiket & landtour (biaya visa tidak refund)
3. Pindah trip (subject availability)

📞 Mau konsultasi? Chat aja langsung ya.

Tim Visa Traveling Eropa`,
  },

  family_announcement: {
    key: 'family_announcement',
    label: '👨‍👩‍👧 Family Group',
    description: 'Kirim ke kepala keluarga, mention semua anggota',
    template: `Hallo Pak/Bu {{nama_kepala_keluarga}} 🙏

Untuk SELURUH anggota keluarga di trip {{nama_trip}}:
👨‍👩‍👧 {{list_nama_anggota_family}}

🔗 Persyaratan dokumen: {{pdf_syarat_visa_url}}
📥 Template dokumen: {{pdf_template_dokumen_url}}

⚠ Setiap anggota family perlu menyiapkan dokumen MASING-MASING.
✅ Dokumen dikumpulkan jadi satu paket dan dikirim atas nama
{{nama_kepala_keluarga}} ke alamat:
{{pickup_address}}

⏰ Deadline: *{{deadline_dokumen}}*

Tim Visa Traveling Eropa`,
  },
};

// Helper — fmt date Indonesia
function fmtDateID(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  } catch { return String(d); }
}

function fmtTime(t) {
  if (!t) return '—';
  try {
    if (String(t).match(/^\d{2}:\d{2}/)) return String(t).slice(0, 5);
    return String(t);
  } catch { return String(t); }
}

// R215m: Replace {{variables}} with actual values
export function renderTemplate(templateKey, vars = {}) {
  const tpl = VISA_WA_TEMPLATES[templateKey];
  if (!tpl) return '';

  let text = tpl.template;

  // Conditional sections
  const sections = {
    template_section: vars.pdf_template_dokumen_url
      ? `📥 Template surat sponsor / dokumen lainnya:\n🔗 ${vars.pdf_template_dokumen_url}`
      : '',
    biometric_section: vars.tanggal_biometrik
      ? `📅 Jadwal Biometrik Kaka:\n${fmtDateID(vars.tanggal_biometrik)} jam ${fmtTime(vars.jam_biometrik)}\n📍 ${vars.lokasi_biometrik || '(lokasi akan diinfokan)'}\n\n⚠ PENTING:\nJadwal biometrik TIDAK DAPAT di-CANCEL atau RESCHEDULE.\nPengajuan perubahan = Rp 1.100.000/orang (biaya embassy).`
      : '',
    biometric_reminder: vars.tanggal_biometrik
      ? `📅 Reminder Jadwal Biometrik:\n${fmtDateID(vars.tanggal_biometrik)} jam ${fmtTime(vars.jam_biometrik)} @ ${vars.lokasi_biometrik || '—'}`
      : '',
  };

  // Variable replacements
  const replacements = {
    nama_peserta: vars.nama_peserta || vars.customer_name || 'Kak',
    nama_kepala_keluarga: vars.nama_kepala_keluarga || vars.nama_peserta || 'Kak',
    nama_trip: vars.nama_trip || vars.trip_name || '-',
    country_name: vars.country_name || vars.visa_country || 'Negara Tujuan',
    tanggal_keberangkatan: fmtDateID(vars.tanggal_keberangkatan || vars.departure),
    tanggal_biometrik: fmtDateID(vars.tanggal_biometrik),
    jam_biometrik: fmtTime(vars.jam_biometrik),
    lokasi_biometrik: vars.lokasi_biometrik || '—',
    deadline_dokumen: fmtDateID(vars.deadline_dokumen),
    deadline_kekurangan: fmtDateID(vars.deadline_kekurangan),
    pdf_syarat_visa_url: vars.pdf_syarat_visa_url || '(belum di-set)',
    pdf_template_dokumen_url: vars.pdf_template_dokumen_url || '',
    upload_portal_url: vars.upload_portal_url || '(belum di-set)',
    pickup_address: vars.pickup_address || '—',
    list_dokumen_kurang: vars.list_dokumen_kurang || '- (di-input saat send)',
    list_nama_anggota_family: vars.list_nama_anggota_family || '',
    visa_valid_from: fmtDateID(vars.visa_valid_from),
    visa_valid_until: fmtDateID(vars.visa_valid_until),
    visa_entry_type: vars.visa_entry_type || '—',
    return_kurir: vars.return_kurir || 'JNE / SiCepat',
    return_resi: vars.return_resi || '(akan diinfokan)',
    rejection_reason: vars.rejection_reason || '(lihat surat resmi dari embassy)',
    ...sections,
  };

  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    text = text.replace(regex, value);
  }

  return text;
}

// Get template options for dropdown
export function getTemplateOptions() {
  return Object.values(VISA_WA_TEMPLATES).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
  }));
}

// Auto-deadline: kalau gak di-set, default = H-30 dari departure
export function autoDeadlineDoc(departureDate, daysBefore = 30) {
  if (!departureDate) return null;
  try {
    const d = new Date(departureDate);
    d.setDate(d.getDate() - daysBefore);
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}
