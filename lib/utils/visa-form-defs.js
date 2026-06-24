// Definisi field Form Tambahan Visa per negara (France/Schengen, USA, UK).
// type: text | textarea | date | select | radio
// prefill: kunci data peserta yg auto-keisi ('name','passport_no','dob','pob','nationality','sex','phone','email')
// required: wajib diisi saat submit.

const YESNO = ['Ya', 'Tidak'];

export const VISA_FORM_TYPES = [
  { key: 'france', label: 'Schengen / France' },
  { key: 'usa', label: 'Amerika Serikat (USA)' },
  { key: 'uk', label: 'United Kingdom (UK)' },
];

export const VISA_FORMS = {
  france: {
    label: 'Schengen / France',
    note: 'Diisi lengkap & jujur sesuai paspor.',
    sections: [
      { title: 'A. Identitas Pribadi', fields: [
        { key: 'nama_lengkap', label: 'Nama Lengkap (sesuai paspor)', type: 'text', required: true, prefill: 'name' },
        { key: 'no_passport', label: 'Nomor Paspor', type: 'text', required: true, prefill: 'passport_no' },
        { key: 'tempat_lahir', label: 'Tempat Lahir', type: 'text', required: true, prefill: 'pob' },
        { key: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date', required: true, prefill: 'dob' },
        { key: 'nik', label: 'No. NIK (KTP)', type: 'text', required: true },
        { key: 'jenis_kelamin', label: 'Jenis Kelamin', type: 'select', options: ['Laki-laki', 'Perempuan'], required: true, prefill: 'sex' },
        { key: 'kewarganegaraan', label: 'Kewarganegaraan', type: 'text', required: true, prefill: 'nationality' },
        { key: 'kewarganegaraan_lain', label: 'Pernah/punya kewarganegaraan lain? (sebutkan jika ya)', type: 'text' },
        { key: 'status_perkawinan', label: 'Status Perkawinan', type: 'select', options: ['Single', 'Menikah', 'Cerai Hidup', 'Cerai Mati'], required: true },
        { key: 'alamat_ktp', label: 'Alamat Rumah lengkap (sesuai KTP)', type: 'textarea', required: true },
        { key: 'no_telp', label: 'No. Telepon / HP', type: 'text', required: true, prefill: 'phone' },
        { key: 'email', label: 'Email', type: 'text', required: true, prefill: 'email' },
      ]},
      { title: 'Perjalanan', fields: [
        { key: 'tgl_berangkat', label: 'Tanggal Keberangkatan ke Eropa', type: 'date' },
        { key: 'tgl_pulang', label: 'Tanggal Pulang dari Eropa', type: 'date' },
        { key: 'alamat_eropa', label: 'Alamat Tinggal di Eropa (Kota/Provinsi/Kode Pos)', type: 'textarea' },
        { key: 'no_telp_eropa', label: 'No. Telepon di Eropa', type: 'text' },
        { key: 'tujuan_eropa', label: 'Tujuan ke Eropa', type: 'text' },
        { key: 'jenis_visa', label: 'Jenis Visa', type: 'select', options: ['Turis', 'Bisnis', 'Pelajar'], required: true },
      ]},
      { title: 'Data Paspor', fields: [
        { key: 'tempat_provinsi_passport', label: 'Tempat & Provinsi Dikeluarkan Paspor', type: 'text' },
        { key: 'kantor_penerbit_passport', label: 'Kantor yang menerbitkan paspor', type: 'text' },
        { key: 'tgl_dikeluarkan_passport', label: 'Tanggal Dikeluarkan Paspor', type: 'date' },
        { key: 'tgl_habis_passport', label: 'Tanggal Habis Masa Paspor', type: 'date' },
        { key: 'passport_pertama', label: 'Apakah ini paspor pertama Anda?', type: 'radio', options: YESNO },
        { key: 'passport_lama', label: 'Jika tidak: No paspor lama + tgl berlaku & berakhir', type: 'text' },
        { key: 'pernah_schengen', label: 'Pernah punya visa Schengen sebelumnya? (sebutkan jika ya)', type: 'text' },
      ]},
      { title: 'B. Keluarga — Pasangan (jika ada)', fields: [
        { key: 'pasangan_nama', label: 'Nama Pasangan', type: 'text' },
        { key: 'pasangan_ttl', label: 'Tempat & Tanggal Lahir Pasangan', type: 'text' },
        { key: 'pasangan_kewarganegaraan', label: 'Kewarganegaraan Pasangan', type: 'text' },
      ]},
      { title: 'Anak (tanggungan)', fields: [
        { key: 'punya_anak', label: 'Punya anak tanggungan?', type: 'radio', options: YESNO },
        { key: 'anak_detail', label: 'Data anak (Nama, TTL, Jenis Kelamin, tinggal bersama?) — 1 anak per baris', type: 'textarea' },
      ]},
      { title: 'F. Pekerjaan', fields: [
        { key: 'nama_perusahaan', label: 'Nama Perusahaan / Sekolah / Kampus', type: 'text', required: true },
        { key: 'jenis_pekerjaan', label: 'Jenis Pekerjaan (Pensiunan/Pelajar/Profesional)', type: 'text', required: true },
        { key: 'jabatan', label: 'Jabatan', type: 'text' },
        { key: 'alamat_perusahaan', label: 'Alamat Perusahaan/Sekolah (Kota/Provinsi/Kode Pos)', type: 'textarea' },
        { key: 'telp_perusahaan', label: 'No. Telepon/Fax Perusahaan/Sekolah', type: 'text' },
        { key: 'email_perusahaan', label: 'Email perusahaan', type: 'text', required: true },
        { key: 'gaji_bulanan', label: 'Pendapatan/Gaji per bulan', type: 'text', required: true },
        { key: 'tgl_mulai_bekerja', label: 'Tanggal mulai bekerja', type: 'date' },
        { key: 'total_uang_perjalanan', label: 'Total uang untuk perjalanan ini', type: 'text' },
        { key: 'pembiaya', label: 'Ada yang membiayai perjalanan? (jika ya, jelaskan siapa)', type: 'text' },
      ]},
    ],
  },

  usa: {
    label: 'Amerika Serikat (USA)',
    note: 'Isi sesuai paspor & data resmi. Wajib jujur (untuk DS-160).',
    sections: [
      { title: 'Data Pribadi', fields: [
        { key: 'nama_lengkap', label: 'Nama Lengkap (sesuai paspor)', type: 'text', required: true, prefill: 'name' },
        { key: 'nama_lain', label: 'Nama lain/alias (jika ada)', type: 'text' },
        { key: 'jenis_kelamin', label: 'Jenis Kelamin', type: 'select', options: ['Laki-laki', 'Perempuan'], required: true, prefill: 'sex' },
        { key: 'status', label: 'Status Perkawinan', type: 'select', options: ['Single', 'Menikah', 'Cerai', 'Janda/Duda'], required: true },
        { key: 'tempat_lahir', label: 'Tempat Lahir', type: 'text', required: true, prefill: 'pob' },
        { key: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date', required: true, prefill: 'dob' },
        { key: 'nik', label: 'No. KTP', type: 'text', required: true },
        { key: 'ssn', label: 'U.S. Social Security Number (bila ada)', type: 'text' },
        { key: 'us_tax_id', label: 'U.S. Taxpayer ID (bila ada)', type: 'text' },
        { key: 'alamat_rumah', label: 'Alamat Lengkap Rumah (Kota/Provinsi/Kodepos)', type: 'textarea', required: true },
        { key: 'telp_rumah', label: 'Telepon Rumah', type: 'text' },
        { key: 'telp_kantor', label: 'Telepon Kantor', type: 'text' },
        { key: 'no_hp', label: 'Nomor Handphone', type: 'text', required: true, prefill: 'phone' },
        { key: 'email_medsos', label: 'Email & Akun Media Sosial', type: 'textarea', required: true, prefill: 'email' },
      ]},
      { title: 'Informasi Paspor', fields: [
        { key: 'no_passport', label: 'Nomor Paspor', type: 'text', required: true, prefill: 'passport_no' },
        { key: 'tempat_provinsi_passport', label: 'Tempat & Provinsi Dikeluarkan Paspor', type: 'text' },
        { key: 'tgl_dikeluarkan_passport', label: 'Tanggal Dikeluarkan Paspor', type: 'date' },
        { key: 'tgl_habis_passport', label: 'Tanggal Habis Masa Paspor', type: 'date' },
        { key: 'passport_hilang', label: 'Nomor Paspor jika pernah hilang/dicuri', type: 'text' },
      ]},
      { title: 'Informasi Perjalanan', fields: [
        { key: 'tujuan', label: 'Tujuan ke Amerika', type: 'text', required: true },
        { key: 'tgl_tiba', label: 'Tanggal tiba di Amerika', type: 'date', required: true },
        { key: 'lama_tinggal', label: 'Lamanya tinggal di Amerika', type: 'text' },
        { key: 'alamat_di_amerika', label: 'Alamat Tinggal di Amerika (Kota/Provinsi/Kodepos)', type: 'textarea', required: true },
        { key: 'pembayar_nama', label: 'Nama yang membayar perjalanan', type: 'text' },
        { key: 'pembayar_telp', label: 'No. Telepon Pembayar', type: 'text' },
        { key: 'pembayar_hubungan', label: 'Hubungan Pembayar dengan Anda', type: 'text' },
        { key: 'teman_perjalanan', label: 'Nama orang yang pergi bersama & hubungannya', type: 'text' },
        { key: 'nama_group', label: 'Nama Group/Tour (bila ada)', type: 'text' },
      ]},
      { title: 'Informasi Visa Amerika', fields: [
        { key: 'pernah_ke_amerika', label: 'Pernah ke Amerika? (tgl & lamanya)', type: 'text' },
        { key: 'sim_amerika', label: 'No. SIM & kota di Amerika (bila punya)', type: 'text' },
        { key: 'tgl_visa', label: 'Tanggal dikeluarkan visa (bila pernah)', type: 'date' },
        { key: 'no_visa', label: 'Nomor Visa (yang berwarna merah)', type: 'text' },
        { key: 'pernah_sidik_jari', label: 'Pernah diambil sidik 10 jari?', type: 'radio', options: YESNO },
        { key: 'visa_hilang', label: 'Visa US pernah hilang/dicuri/dibatalkan?', type: 'radio', options: YESNO },
        { key: 'tgl_ditolak', label: 'Tanggal ditolak visa (bila pernah)', type: 'text' },
      ]},
      { title: 'Kontak di Amerika', fields: [
        { key: 'kontak_amerika_nama', label: 'Nama Orang/Organisasi/Hotel di Amerika & hubungannya', type: 'text', required: true },
        { key: 'kontak_amerika_alamat', label: 'Alamat di Amerika (Kota/Provinsi/Kodepos)', type: 'textarea', required: true },
        { key: 'kontak_amerika_telp', label: 'Nomor Telepon', type: 'text', required: true },
        { key: 'kontak_amerika_email', label: 'Email (bila ada)', type: 'text' },
      ]},
      { title: 'Informasi Keluarga', fields: [
        { key: 'ayah_nama', label: 'Nama Ayah', type: 'text', required: true },
        { key: 'ayah_lahir', label: 'Tanggal Lahir Ayah', type: 'text', required: true },
        { key: 'ibu_nama', label: 'Nama Ibu', type: 'text', required: true },
        { key: 'ibu_lahir', label: 'Tanggal Lahir Ibu', type: 'text', required: true },
        { key: 'ortu_di_amerika', label: 'Apakah Ayah & Ibu ada di Amerika?', type: 'radio', options: YESNO },
        { key: 'saudara_di_amerika', label: 'Saudara/Pasangan/Anak di Amerika & statusnya', type: 'text' },
      ]},
      { title: 'Pasangan', fields: [
        { key: 'pasangan_nama', label: 'Nama Pasangan', type: 'text' },
        { key: 'pasangan_ttl', label: 'Tempat/Tanggal Lahir Pasangan', type: 'text' },
        { key: 'pasangan_cerai', label: 'Jika cerai: tempat/tgl menikah & cerai + alasan', type: 'textarea' },
      ]},
      { title: 'Pendidikan & Pekerjaan', fields: [
        { key: 'perusahaan', label: 'Nama Perusahaan/Sekolah/Tempat Usaha sekarang', type: 'text', required: true },
        { key: 'perusahaan_alamat', label: 'Alamat (Kota/Provinsi/Kodepos)', type: 'textarea' },
        { key: 'gaji_bulanan', label: 'Penghasilan/Gaji per bulan', type: 'text', required: true },
        { key: 'jabatan', label: 'Deskripsi pekerjaan/Jabatan', type: 'text' },
        { key: 'perusahaan_telp', label: 'No. Telepon', type: 'text' },
        { key: 'pendidikan', label: 'Riwayat pendidikan (SMP/SMA/Universitas: nama, alamat, tahun, jurusan)', type: 'textarea' },
        { key: 'bahasa', label: 'Bahasa yang dikuasai', type: 'text' },
        { key: 'negara_dikunjungi', label: 'Negara yang dikunjungi 5 tahun terakhir', type: 'textarea' },
      ]},
    ],
  },

  uk: {
    label: 'United Kingdom (UK)',
    note: 'Semua data akan dimasukkan ke website resmi UK (visa4uk).',
    sections: [
      { title: 'Data Pribadi', fields: [
        { key: 'nama_lengkap', label: 'Nama Lengkap (sesuai paspor)', type: 'text', required: true, prefill: 'name' },
        { key: 'status_pernikahan', label: 'Status Pernikahan', type: 'select', options: ['Single', 'Menikah', 'Cerai', 'Janda/Duda'], required: true },
        { key: 'tempat_lahir', label: 'Tempat Lahir', type: 'text', required: true, prefill: 'pob' },
        { key: 'tanggal_lahir', label: 'Tanggal Lahir', type: 'date', required: true, prefill: 'dob' },
        { key: 'nik', label: 'No. NIK (KTP)', type: 'text' },
        { key: 'no_hp', label: 'No. Telepon / HP', type: 'text', required: true, prefill: 'phone' },
        { key: 'email', label: 'Alamat E-mail Pribadi', type: 'text', required: true, prefill: 'email' },
      ]},
      { title: 'Data Paspor Baru', fields: [
        { key: 'no_passport', label: 'Nomor Paspor', type: 'text', required: true, prefill: 'passport_no' },
        { key: 'tempat_passport', label: 'Tempat Paspor Diterbitkan', type: 'text' },
        { key: 'masa_berlaku_passport', label: 'Masa Berlaku Paspor', type: 'date' },
      ]},
      { title: 'Data Paspor Lama (jika ada)', fields: [
        { key: 'passport_lama_no', label: 'Nomor Paspor Lama', type: 'text' },
        { key: 'passport_lama_tempat', label: 'Tempat Paspor Lama Diterbitkan', type: 'text' },
        { key: 'passport_lama_berlaku', label: 'Masa Berlaku Paspor Lama', type: 'text' },
        { key: 'passport_lama_posisi', label: 'Posisi Paspor Lama Anda', type: 'text' },
      ]},
      { title: 'Alamat', fields: [
        { key: 'alamat_lengkap', label: 'Alamat Lengkap', type: 'textarea', required: true },
        { key: 'lama_tinggal', label: 'Berapa lama tinggal di alamat tsb', type: 'text' },
      ]},
      { title: 'Pasangan (jika ada)', fields: [
        { key: 'pasangan_nama', label: 'Nama Lengkap Pasangan', type: 'text' },
        { key: 'pasangan_ttl', label: 'Tempat & Tanggal Lahir Pasangan', type: 'text' },
        { key: 'pasangan_passport', label: 'Nomor Paspor Pasangan', type: 'text' },
        { key: 'pasangan_tinggal_bersama', label: 'Pasangan tinggal bersama Anda? (jika tidak, sebutkan)', type: 'text' },
        { key: 'pasangan_ikut', label: 'Pasangan ikut dalam perjalanan ini?', type: 'radio', options: YESNO },
      ]},
      { title: 'Anak Kandung (jika ada)', fields: [
        { key: 'anak_detail', label: 'Data tiap anak (Nama sesuai paspor, TTL, No paspor, tinggal bersama?, ikut perjalanan?) — 1 anak per baris', type: 'textarea' },
      ]},
      { title: 'Pekerjaan / Sekolah / Kuliah', fields: [
        { key: 'status_pekerjaan', label: 'Status Anda saat ini (Bekerja/Sekolah/Pensiunan/Wiraswasta)', type: 'text', required: true },
        { key: 'nama_perusahaan', label: 'Nama Perusahaan/Sekolah/Kampus', type: 'text', required: true },
        { key: 'alamat_perusahaan', label: 'Alamat Lengkap Perusahaan/Sekolah/Kampus', type: 'textarea' },
        { key: 'telp_perusahaan', label: 'No. Telepon Perusahaan/Sekolah/Kampus', type: 'text' },
        { key: 'email_kerja', label: 'E-mail di tempat bekerja', type: 'text' },
      ]},
      { title: 'Keuangan', fields: [
        { key: 'pendapatan_bulanan', label: 'Total Pendapatan per bulan', type: 'text', required: true },
        { key: 'pengeluaran_bulanan', label: 'Total Pengeluaran keluarga per bulan', type: 'text' },
        { key: 'biaya_pribadi_perjalanan', label: 'Total biaya pribadi untuk perjalanan ini', type: 'text' },
        { key: 'uang_dibawa', label: 'Total uang yang dibawa untuk perjalanan ini', type: 'text' },
      ]},
      { title: 'Perjalanan & Riwayat', fields: [
        { key: 'tgl_masuk_uk', label: 'Tanggal Masuk/Tiba di UK', type: 'date' },
        { key: 'tgl_keluar_uk', label: 'Tanggal Keluar dari UK', type: 'date' },
        { key: 'negara_dikunjungi', label: 'Negara yang dikunjungi 10 tahun terakhir (nama + tgl)', type: 'textarea' },
        { key: 'pernah_ke_uk', label: 'Pernah ke UK dalam 10 tahun terakhir? (tgl, masa visa, no visa)', type: 'textarea' },
        { key: 'pernah_ditolak', label: 'Pernah ditolak visa di negara manapun (termasuk UK)?', type: 'text' },
        { key: 'pernah_visa_uk', label: 'Pernah dapat Visa UK 10 tahun terakhir? (sebutkan no visa)', type: 'text' },
        { key: 'keluarga_di_uk', label: 'Punya keluarga/kerabat di UK? (Nama, No paspor, alamat, rencana kunjungi?)', type: 'textarea' },
      ]},
    ],
  },
};

export function getVisaForm(formType) {
  return VISA_FORMS[formType] || null;
}
export function visaFormLabel(formType) {
  return VISA_FORMS[formType]?.label || formType || '-';
}
