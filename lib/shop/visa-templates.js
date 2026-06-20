// Template Syarat Visa per destinasi (sumber: dokumen resmi Traveling Eropa / PT Khasanah Global Internasional).
// Dipakai di panel publish trip: admin tinggal pilih template -> mengisi field "Syarat Visa" trip.

function stdVisa(titleLine, photo, interview) {
  interview = interview || '';
  return `${titleLine}:
1. Paspor Asli berlaku minimal 6 bulan terhitung sejak tanggal kembali dari tour, wajib ada kolom tanda tangan di halaman belakang paspor (paspor asli dibawa saat biometrik).
2. Fotokopi Paspor halaman data diri & visa yang tertera (berlaku min. 6 bulan sejak tanggal kembali dari tour), fotokopi berwarna kertas A4 (dikirim ke kantor TE).
3. Fotokopi Paspor Lama (jika ada) untuk menunjukkan history perjalanan kepada embassy (dikirim ke kantor TE).
4. Pas Foto Berwarna terbaru ukuran ${photo} sebanyak 2 lembar, latar belakang putih, dicetak di kertas foto bermutu & jelas (garis wajah/rambut terlihat, ekspresi netral, baju polos & tidak berwarna putih). Pas foto dibawa saat biometrik.
5. Surat Keterangan Kerja/Surat Sponsor (Bahasa Inggris) di atas kop surat perusahaan: mencantumkan nama paspor, nomor paspor, jabatan, tanggal mulai bekerja, ditandatangani atasan/HRD & diberi cap perusahaan.
6. Bukti Keuangan berupa Cetak Rekening Koran 3-4 bulan terakhir (sebelum jadwal biometrik) yang mencantumkan nama & nomor rekening, dengan saldo akhir mengendap tiap bulan minimum Rp50 juta untuk membiayai 1 orang (dikirim ke kantor TE).
- Jika ada anggota keluarga yang ikut: cantumkan nama, nomor paspor & status hubungan dalam surat sponsor.
- Jika jabatan General Manager/Direktur/Presiden Direktur/Komisaris: sertakan fotokopi SIUP & NPWP (perusahaan & pribadi).
- Jika punya bisnis sendiri tanpa kop surat: surat diketik di kertas putih polos + cap toko + fotokopi SIUP & NPWP.
- Jika disponsori anak: lampirkan fotokopi akta kelahiran anak (bukti hubungan keluarga).
- Jika disponsori menantu/mertua: lampirkan fotokopi akta nikah anak & akta kelahiran anak.
7. Update Cetak Rekening Koran 3-4 hari sebelum jadwal biometrik${interview} visa.
8. Slip Gaji 3 bulan terakhir (Bahasa Inggris), terhitung sebelum jadwal biometrik${interview} visa.
9. Fotokopi Kartu Keluarga terbaru (di atas tahun 2016).
10. Fotokopi KTP terbaru.
11. Jika nama di paspor berbeda dengan KTP/KK/akta kelahiran: lampirkan fotokopi Surat Beda Nama / Ganti Nama dari Kelurahan.
12. Jika sudah menikah: lampirkan fotokopi Akta Nikah / Buku Nikah.
13. Jika status bercerai: lampirkan Akta Cerai.
14. Jika status cerai mati: lampirkan Akta Kematian pasangan.
15. Jika anak ikut & masih sekolah: lampirkan fotokopi Kartu Pelajar (jika ada), fotokopi Akta Kelahiran & Surat Keterangan Sekolah (Bahasa Inggris).`;
}

export const VISA_TEMPLATES = [
  { key: 'uk_ireland', label: 'UK + Ireland', text: stdVisa('SYARAT VISA UNITED KINGDOM (UK + IRELAND)', '3,5 x 4,5 cm') },
  { key: 'schengen',   label: 'Schengen (Eropa)', text: stdVisa('SYARAT VISA SCHENGEN (EROPA)', '3,5 x 4,5 cm') },
  { key: 'usa',        label: 'USA (Amerika)', text: stdVisa('SYARAT VISA USA (AMERIKA)', '5 x 5 cm', '/interview') },
  { key: 'nz_aussie',  label: 'New Zealand & Australia', text: stdVisa('SYARAT VISA NEW ZEALAND & AUSTRALIA', '3,5 x 4,5 cm') },
  { key: 'japan',      label: 'Jepang', text: `SYARAT VISA JEPANG (NON E-PASSPORT) - Visa Regular Tourist:
1. Paspor.
2. Pas Photo terbaru (ukuran 4,5 x 3,5 cm, diambil 6 bulan terakhir, latar belakang putih, 2 lembar, bukan hasil editing, jelas/tidak buram).
3. Fotokopi KTP.
4. Fotokopi Kartu Mahasiswa atau Surat Keterangan Belajar (hanya bila masih mahasiswa).
5. Fotokopi dokumen yang menunjukkan hubungan dengan pemohon (kartu keluarga, akta lahir, surat nikah, dsb), bila pemohon lebih dari satu orang.
6. Bukti keuangan: rekening koran atau buku tabungan 3 bulan terakhir. Bila penanggung jawab biaya bukan pemohon (mis. ayah/ibu), lampirkan dokumen yang membuktikan hubungan dengan penanggung jawab biaya.
Catatan: Pemegang e-passport (paspor elektronik) Indonesia dapat bebas visa Jepang dengan registrasi terlebih dahulu di Kedutaan Besar Jepang.` },
];

export function visaTemplateByKey(k) { return VISA_TEMPLATES.find((v) => v.key === k) || null; }
