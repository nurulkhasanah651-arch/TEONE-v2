// R215m + R215n + R215o: Visa templates with override support + return method handling
// Path: lib/utils/visa-templates.js

// Daftar dokumen DEFAULT (dipakai kalau trip belum set daftar dokumen sendiri)
export const DEFAULT_VISA_DOCS = [
  'KTP',
  'Kartu Keluarga',
  'Paspor (halaman data diri)',
  'Pas foto terbaru (latar putih)',
  'Rekening koran 3 bulan terakhir',
  'Surat keterangan kerja',
  'Akta Lahir (khusus anak)',
  'Akta Nikah (jika sudah menikah)',
].join('\n');

// Ubah daftar dokumen (array dari Template Dokumen Visa, atau teks 1-per-baris) jadi checklist rapi
function formatDocList(raw) {
  // Ikuti TEMPLATE yang di-set admin. Kalau kosong, JANGAN dump daftar default —
  // tampilkan placeholder agar admin set template dulu (sinkron dgn portal upload).
  let lines;
  if (Array.isArray(raw)) lines = raw.slice();
  else lines = (raw && String(raw).trim()) ? String(raw).split('\n') : [];
  const out = lines
    .map((l) => String(l).replace(/^[\s\-•☐📸📝]+/, '').trim())
    .filter(Boolean);
  if (out.length === 0) return '(daftar dokumen akan diinformasikan menyusul)';
  return out.map((l) => `☐ ${l}`).join('\n');
}

export const VISA_WA_TEMPLATES = {
  doc_collection: {
    key: 'doc_collection',
    label: '📋 Pengumpulan Dokumen (Biometrik + Kirim Dok)',
    description: 'Kirim list dokumen yg perlu dikirim/upload (link PDF)',
    template: `Hallo selamat siang, Kak {{nama_peserta}} 🙏

Kami dari tim visa Traveling Eropa ingin menginformasikan bahwa proses
*Visa {{country_name}}* untuk trip *{{nama_trip}}* (keberangkatan
{{tanggal_keberangkatan}}) akan segera dimulai ya.

📋 Dokumen yang perlu disiapkan:
{{list_dokumen}}
{{pdf_syarat_section}}

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
    label: '📤 Pengumpulan Dokumen (No Biometrik — Upload Portal)',
    description: 'Visa tanpa biometrik — kirim link upload portal',
    template: `Hallo Kak {{nama_peserta}} 🙏

Visa *{{country_name}}* untuk trip *{{nama_trip}}* TIDAK perlu biometrik
dan TIDAK perlu kirim dokumen fisik ya.

📤 *Link Upload Dokumen Digital:*
{{upload_portal_url}}

Silakan upload/scan dokumen berikut via link di atas:
{{list_dokumen}}
{{pdf_syarat_section}}

⏰ Deadline upload: *{{deadline_dokumen}}*

📞 Kalau ada kendala, langsung chat ya 🙏

Tim Visa Traveling Eropa`,
  },

  doc_received: {
    key: 'doc_received',
    label: '✅ Dokumen Diterima & Review',
    description: 'Konfirmasi dokumen sudah diterima, sedang review',
    template: `Hallo Kak {{nama_peserta}} 🙏
{{family_recipients_block}}
✅ Dokumen visa {{penerima_dokumen}} untuk *{{nama_trip}}* sudah kami terima dan sedang
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
{{family_recipients_block}}
Mohon maaf, ada dokumen Visa {{country_name}} yang masih perlu dilengkapi:

{{kekurangan_block}}

⏰ Mohon dilengkapi paling lambat: *{{deadline_kekurangan}}*

{{biometric_reminder}}

🔗 Detail persyaratan: {{pdf_syarat_visa_url}}

Tim Visa Traveling Eropa`,
  },

  biometric_schedule_info: {
    key: 'biometric_schedule_info',
    label: '🗓 Info Jadwal Biometrik (tanggal/jam/lokasi saja)',
    description: 'Kabar peserta sudah dijadwalkan biometrik — tanpa checklist dokumen',
    template: `Hallo Kak {{nama_peserta}} 🙏

✅ Jadwal *Biometrik Visa {{country_name}}* sudah DIJADWALKAN:

{{biometric_schedule_block}}
📍 Lokasi: {{lokasi_biometrik}}
{{field_team_section}}

📋 Detail barang yang perlu dibawa akan kami kirimkan menyusul ya, Kak.

⚠ Jadwal TIDAK BISA diubah (biaya reschedule Rp 1.100.000/orang)

Tim Visa Traveling Eropa`,
  },

  biometric_reminder: {
    key: 'biometric_reminder',
    label: '📅 Reminder Biometrik',
    description: 'Reminder jadwal + checklist barang bawaan',
    template: `Hallo Kak {{nama_peserta}} 🙏

📅 *Jadwal Biometrik Visa {{country_name}}:*
{{biometric_schedule_block}}
📍 {{lokasi_biometrik}}

🚗 Wajib dibawa:
☐ Paspor ASLI (cek: tidak ada bekas staples di cover)
☐ 2 lembar pas foto warna 3,5 x 4,5 latar PUTIH
☐ Semua dokumen ASLI untuk verifikasi
{{dokumen_dibawa}}{{kekurangan_bawa_section}}

⏰ Datang 30 menit lebih awal ya, Kak!
{{field_team_section}}

⚠ Jadwal TIDAK BISA diubah (biaya reschedule Rp 1.100.000/orang)

Tim Visa Traveling Eropa`,
  },

  visa_approved: {
    key: 'visa_approved',
    label: '🎉 Visa APPROVED',
    description: 'Hasil approved + delivery method (kurir/tim bawa/ambil kantor)',
    template: `🎉 Selamat Kak {{nama_peserta}}!

✅ *Visa {{country_name}} Kaka SUDAH APPROVED*

📎 Foto visa terlampir.{{visa_photo_section}}

Validity: {{visa_valid_from}} s/d {{visa_valid_until}}
Type: {{visa_entry_type}}

{{return_section}}

Selamat menanti perjalanannya! 🌍

Tim Visa Traveling Eropa`,
  },

  visa_rejected: {
    key: 'visa_rejected',
    label: '❌ Visa REJECTED',
    description: 'Hasil rejected + opsi (foto/dokumen penolakan attached)',
    template: `Hallo Kak {{nama_peserta}} 🙏

Mohon maaf, hasil visa {{country_name}} untuk trip {{nama_trip}}: *DITOLAK*

📎 Surat resmi penolakan dari embassy terlampir.{{visa_photo_section}}

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

function fmtDateID(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(d); }
}

function fmtTime(t) {
  if (!t) return '—';
  try {
    if (String(t).match(/^\d{2}:\d{2}/)) return String(t).slice(0, 5);
    return String(t);
  } catch { return String(t); }
}

// R215o: Get effective template — apakah trip punya override?
export function getEffectiveTemplate(templateKey, trip) {
  const defaultTpl = VISA_WA_TEMPLATES[templateKey];
  if (!defaultTpl) return null;

  const overrides = trip?.visa_message_templates || {};
  const customText = overrides[templateKey];
  if (customText && typeof customText === 'string' && customText.trim()) {
    return { ...defaultTpl, template: customText };
  }
  return defaultTpl;
}

// R215o: renderTemplate sekarang accept trip param (untuk pakai override)
export function renderTemplate(templateKey, vars = {}, trip = null) {
  const tpl = trip ? getEffectiveTemplate(templateKey, trip) : VISA_WA_TEMPLATES[templateKey];
  if (!tpl) return '';

  let text = tpl.template;

  // R215o: Return section (3 opsi: kurir / team_carry / office_pickup)
  let returnSectionText = '';
  const returnMethod = vars.return_method || 'kurir';
  if (returnMethod === 'team_carry') {
    returnSectionText = `✈ *Cara terima paspor:*\nPaspor akan dibawa tim Traveling Eropa saat keberangkatan trip.\nKaka cukup datang ke meeting point sesuai jadwal trip.`;
  } else if (returnMethod === 'office_pickup') {
    returnSectionText = `🏢 *Cara terima paspor:*\nPaspor bisa diambil langsung di kantor TE pada jam kerja:\n${vars.pickup_address || 'Kantor TE'}\n\n📅 Jam kerja: Senin-Jumat, 09.00-17.00 WIB\n📞 Hubungi kami dulu sebelum datang: +62 813 6411 3535`;
  } else {
    // Default: kurir
    returnSectionText = `✈ Paspor asli akan kami kirim via ${vars.return_kurir || 'JNE'}\nResi: ${vars.return_resi || '(akan diinfokan)'}`;
  }

  const sections = {
    template_section: vars.pdf_template_dokumen_url
      ? `📥 Template surat sponsor / dokumen lainnya:\n🔗 ${vars.pdf_template_dokumen_url}`
      : '',
    biometric_section: vars.tanggal_biometrik
      ? `📅 Jadwal Biometrik Kaka:\n${fmtDateID(vars.tanggal_biometrik)} jam ${fmtTime(vars.jam_biometrik)}\n📍 ${vars.lokasi_biometrik || '(lokasi akan diinfokan)'}\n\n⚠ PENTING:\nJadwal biometrik TIDAK DAPAT di-CANCEL atau RESCHEDULE.\nPengajuan perubahan = Rp 1.100.000/orang (biaya embassy).`
      : '',
    biometric_schedule_block: (vars.jadwal_biometrik_family && String(vars.jadwal_biometrik_family).trim())
      ? vars.jadwal_biometrik_family
      : (vars.tanggal_biometrik
          ? `🗓 Tanggal: *${fmtDateID(vars.tanggal_biometrik)}*\n⏰ Jam: *${vars.jam_biometrik ? fmtTime(vars.jam_biometrik) : '(akan diinfokan)'}*`
          : `🗓 Jadwal: (akan diinfokan)`),
    biometric_reminder: vars.tanggal_biometrik
      ? `📅 Reminder Jadwal Biometrik:\n${fmtDateID(vars.tanggal_biometrik)} jam ${fmtTime(vars.jam_biometrik)} @ ${vars.lokasi_biometrik || '—'}`
      : '',
    field_team_section: vars.field_team_phone
      ? `\n📞 Tim lapangan kami (di lokasi biometrik): ${vars.field_team_phone}\n   (bisa di-WA kalau ada kendala di lokasi)`
      : '',
    visa_photo_section: vars.visa_photo_url
      ? `\n🔗 Kalau foto tidak muncul otomatis, buka di sini:\n${vars.visa_photo_url}`
      : '',
    dokumen_dibawa: (() => {
      const raw = vars.list_dokumen;
      let lines = Array.isArray(raw) ? raw.slice()
        : (raw && String(raw).trim() ? String(raw).split('\n') : []);
      lines = lines.map((l) => String(l).replace(/^[\s\-•☐📸📝]+/, '').trim()).filter(Boolean);
      return lines.map((l) => `☐ ${l}`).join('\n');
    })(),
    return_section: returnSectionText,
    pdf_syarat_section: vars.pdf_syarat_visa_url
      ? `\n🔗 Detail lengkap (PDF): ${vars.pdf_syarat_visa_url}`
      : '',
    family_recipients_block: (vars.family_names_multi && String(vars.family_names_multi).trim())
      ? `👨‍👩‍👧 Untuk anggota keluarga: ${vars.family_names_multi}\n`
      : '',
    kekurangan_block: (() => {
      if (vars.list_kekurangan_family && String(vars.list_kekurangan_family).trim()) return vars.list_kekurangan_family;
      const raw = vars.list_dokumen_kurang;
      if (!raw || !String(raw).trim()) return '- (belum diisi — isi di detail peserta)';
      return String(raw).split('\n').map((l) => l.replace(/^[\s\-•☐]+/, '').trim()).filter(Boolean).map((l) => `☐ ${l}`).join('\n');
    })(),
    // Kekurangan dokumen yang WAJIB dibawa saat biometrik (dari expand peserta). Kosong = section hilang.
    kekurangan_bawa_section: (() => {
      const fam = vars.list_kekurangan_family && String(vars.list_kekurangan_family).trim() ? vars.list_kekurangan_family : '';
      if (fam) return `\n\n📋 *Dokumen yang masih kurang — WAJIB dibawa/dilengkapi:*\n${fam}`;
      const single = vars.list_dokumen_kurang && String(vars.list_dokumen_kurang).trim() ? vars.list_dokumen_kurang : '';
      if (single) {
        const items = String(single).split('\n').map((l) => l.replace(/^[\s\-•☐]+/, '').trim()).filter(Boolean).map((l) => `☐ ${l}`).join('\n');
        return `\n\n📋 *Dokumen yang masih kurang — WAJIB dibawa/dilengkapi:*\n${items}`;
      }
      return '';
    })(),
  };

  const replacements = {
    nama_peserta: vars.nama_peserta || vars.customer_name || 'Kak',
    nama_kepala_keluarga: vars.nama_kepala_keluarga || vars.nama_peserta || 'Kak',
    nama_trip: vars.nama_trip || vars.trip_name || '-',
    country_name: vars.country_name || vars.visa_country || 'Negara Tujuan',
    tanggal_keberangkatan: fmtDateID(vars.tanggal_keberangkatan || vars.departure),
    tanggal_biometrik: fmtDateID(vars.tanggal_biometrik),
    jam_biometrik: vars.jam_biometrik ? fmtTime(vars.jam_biometrik) : '(akan diinfokan)',
    lokasi_biometrik: vars.lokasi_biometrik || '(akan diinfokan)',
    deadline_dokumen: fmtDateID(vars.deadline_dokumen),
    deadline_kekurangan: fmtDateID(vars.deadline_kekurangan),
    pdf_syarat_visa_url: vars.pdf_syarat_visa_url || '(belum di-set)',
    list_dokumen: formatDocList(vars.list_dokumen),
    pdf_template_dokumen_url: vars.pdf_template_dokumen_url || '',
    upload_portal_url: vars.upload_portal_url || '(belum di-generate — minta admin generate token)',
    pickup_address: vars.pickup_address || '—',
    list_dokumen_kurang: (() => {
      const raw = vars.list_dokumen_kurang;
      if (!raw || !String(raw).trim()) return '- (belum diisi — isi di detail peserta)';
      return String(raw).split('\n').map((l) => l.replace(/^[\s\-•☐]+/, '').trim()).filter(Boolean).map((l) => `☐ ${l}`).join('\n');
    })(),
    list_nama_anggota_family: vars.list_nama_anggota_family || '',
    penerima_dokumen: (vars.family_names_multi && String(vars.family_names_multi).trim()) ? 'keluarga' : 'Kaka',
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

export function getTemplateOptions() {
  return Object.values(VISA_WA_TEMPLATES).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
  }));
}

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

// R215o: Get raw template text (default OR override) — untuk editor
export function getRawTemplateText(templateKey, trip) {
  const overrides = trip?.visa_message_templates || {};
  if (overrides[templateKey]) return overrides[templateKey];
  return VISA_WA_TEMPLATES[templateKey]?.template || '';
}

// R215o: Detect if template is the default (no override)
export function isDefaultTemplate(templateKey, trip) {
  const overrides = trip?.visa_message_templates || {};
  return !overrides[templateKey];
}
