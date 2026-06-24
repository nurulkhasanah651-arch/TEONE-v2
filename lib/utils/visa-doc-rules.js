// Aturan syarat dokumen visa untuk Asisten AI (default per negara + per profil pekerjaan).
// Dipakai untuk menyusun prompt analisa. Bisa dioverride per trip (trip.visa_doc_rules) bila ada.

export const GENERAL_RULES = `ATURAN UMUM (berlaku semua negara):
- Paspor: masih berlaku minimal 6 bulan SETELAH tanggal pulang trip; nama & data sesuai; ada halaman tanda tangan.
- Rekening Koran: WAJIB analisa CASHFLOW 3 bulan terakhir, bukan hanya saldo akhir:
  - Lihat pemasukan rutin/omzet, frekuensi & nilai mutasi masuk-keluar, dan RATA-RATA saldo.
  - Tandai "perlu dicek" bila ada SETORAN BESAR MENDADAK menjelang tanggal apply (indikasi window dressing).
  - Nilai apakah saldo & arus kas WAJAR untuk membiayai durasi & estimasi biaya trip.
  - Rekening harus atas nama pemohon atau sponsor (jika disponsori).
- Surat Sponsor (bila pemohon disponsori / pelajar / tidak bekerja): ada, nama sponsor & HUBUNGAN jelas, menyatakan menanggung biaya, idealnya menyebut/mencakup tanggal trip.
- Dokumen perjalanan (tiket PP, booking hotel, itinerary, asuransi): TANGGAL harus sesuai tanggal trip; NEGARA/TUJUAN sesuai negara visa.
- Kualitas: file terbaca jelas (tidak buram), halaman lengkap, bukan dokumen salah/keliru slot.`;

export const COUNTRY_RULES = {
  schengen: `SCHENGEN / FRANCE:
- Asuransi perjalanan WAJIB, minimal coverage EUR 30.000, berlaku selama periode trip & seluruh wilayah Schengen.
- Bukti keuangan kuat (rekening + slip gaji/legalitas usaha). Bukti booking hotel & tiket PP sesuai tanggal.
- Form aplikasi Schengen terisi.`,
  usa: `AMERIKA SERIKAT (USA):
- Penekanan pada bukti IKATAN KUAT dengan Indonesia (pekerjaan tetap/usaha, keluarga, aset) agar tidak dianggap berniat menetap.
- Bukti keuangan & cashflow yang konsisten sangat penting; rekening atas nama pemohon/sponsor.
- Kesesuaian data dengan rencana perjalanan (DS-160).`,
  uk: `UNITED KINGDOM (UK):
- Bukti keuangan: rekening 3-6 bulan, cashflow jelas; tunjukkan kemampuan membiayai trip & biaya hidup.
- Bukti akomodasi & rencana perjalanan sesuai tanggal.
- Surat keterangan kerja/usaha + bukti penghasilan.`,
  general: `NEGARA LAIN: gunakan aturan umum + standar kedutaan pada umumnya (keuangan cukup, dokumen sesuai tanggal & tujuan).`,
};

export const OCCUPATION_RULES = {
  karyawan: `PROFIL: KARYAWAN
- WAJIB: Surat Keterangan Kerja (mencantumkan jabatan, masa kerja, izin cuti) + Slip Gaji (3 bulan).
- Rekening: gaji rutin masuk tiap bulan terlihat di mutasi (cocokkan dengan slip gaji).`,
  pengusaha: `PROFIL: PENGUSAHA / WIRASWASTA
- WAJIB: Legalitas usaha (SIUP / NIB / Akta Pendirian / SKU / TDP) — cek ada, atas nama pemohon/perusahaan yang sesuai, masih berlaku.
- Rekening: analisa CASHFLOW USAHA — omzet/perputaran usaha harus TERLIHAT di mutasi (transaksi masuk dari usaha), konsisten dengan skala usaha yang diklaim. Bukan hanya saldo akhir.
- Tandai bila legalitas usaha ada TAPI cashflow rekening tidak mencerminkan aktivitas usaha (atau sebaliknya).`,
  pelajar: `PROFIL: PELAJAR / MAHASISWA
- WAJIB: Surat keterangan sekolah/kampus + Surat Sponsor (orang tua/wali) + rekening SPONSOR (cashflow sponsor dianalisa).`,
  pensiunan: `PROFIL: PENSIUNAN
- WAJIB: Bukti pensiun / SK pensiun + rekening (pemasukan pensiun/aset). Jika disponsori, sertakan surat sponsor + rekening sponsor.`,
  lainnya: `PROFIL: LAINNYA / TIDAK BEKERJA
- Perlu Surat Sponsor + rekening sponsor (cashflow sponsor dianalisa). Jelaskan sumber dana.`,
};

export function pickCountryKey(visaCountry, formTypeHint) {
  const c = String(visaCountry || formTypeHint || '').toLowerCase();
  if (/usa|amerika|united states|america/.test(c)) return 'usa';
  if (/uk|united kingdom|inggris|britain|england/.test(c)) return 'uk';
  if (/france|prancis|perancis|schengen|eropa|europe|italy|italia|spain|spanyol|germany|jerman|swiss|belanda|netherlands|austria/.test(c)) return 'schengen';
  return 'general';
}

export function occupationKey(raw) {
  const c = String(raw || '').toLowerCase();
  if (/pengusaha|wiraswasta|wirausaha|owner|pemilik|usaha|entrepreneur|direktur/.test(c)) return 'pengusaha';
  if (/pelajar|mahasiswa|student|sekolah|kuliah/.test(c)) return 'pelajar';
  if (/pensiun|retir/.test(c)) return 'pensiunan';
  if (/karyawan|pegawai|staff|employee|profesional|guru|dosen|dokter|perawat/.test(c)) return 'karyawan';
  return '';
}

// Susun blok aturan teks untuk prompt
export function buildRulesText({ visaCountry, formTypeHint, occupation, customRules } = {}) {
  const ck = pickCountryKey(visaCountry, formTypeHint);
  const ok = occupationKey(occupation);
  const parts = [GENERAL_RULES, COUNTRY_RULES[ck] || COUNTRY_RULES.general];
  if (ok && OCCUPATION_RULES[ok]) parts.push(OCCUPATION_RULES[ok]);
  else parts.push('PROFIL: tidak diketahui — minta klarifikasi pekerjaan bila bukti penghasilan tidak jelas.');
  if (customRules && String(customRules).trim()) parts.push('ATURAN TAMBAHAN DARI TIM VISA:\n' + String(customRules).trim());
  return parts.join('\n\n');
}
