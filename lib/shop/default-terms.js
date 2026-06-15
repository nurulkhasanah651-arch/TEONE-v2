// Syarat & Ketentuan default per brand (dipakai storefront bila trip belum diisi admin).
// Sumber: T&C standar Traveling Eropa (PT. Khasanah Global Internasional).
export const DEFAULT_SYARAT_KETENTUAN = {
  teone: `PEMESANAN & PELUNASAN BIAYA:
Pemesanan dilakukan melalui Customer Service resmi PT. Khasanah Global Internasional dengan melampirkan data paspor & pembayaran uang muka (deposit) sesuai nominal yang ditetapkan.
Peserta yang belum memiliki paspor wajib membuat paspor paling lambat 7 hari kalender sejak pendaftaran (nama di KTP & paspor harus identik).
Kegagalan melunasi sesuai tenggat waktu dianggap pembatalan sepihak dan dikenakan biaya pembatalan.
Dengan memesan & mentransfer dana, peserta dianggap telah membaca, memahami & menyetujui seluruh syarat & ketentuan ini.

PEMBATALAN & BIAYA PEMBATALAN:
Setelah pendaftaran: seluruh dana yang telah dibayarkan (termasuk deposit) tidak dapat dikembalikan.
Pembatalan dalam 30 hari kalender sebelum keberangkatan (H-30): biaya pembatalan 100% dari total biaya perjalanan.
Pindah paket atau ganti tanggal keberangkatan dianggap pembatalan & dikenakan biaya sesuai ketentuan.
Biaya proses pengurusan visa tetap wajib dibayar apabila pengajuan visa sudah dimulai.
Apabila visa ditolak Kedutaan, biaya pengurusan visa bersifat non-refundable (hak prerogatif Kedutaan).
Tiket internasional maupun domestik bersifat NON-REFUNDABLE.

DEVIASI / PERUBAHAN JADWAL:
Permintaan deviasi di luar itinerary resmi menjadi tanggung jawab penuh peserta (tambahan biaya tiket, akomodasi, transportasi lokal & administrasi).
Apabila deviasi belum dikonfirmasi hingga tenggat, peserta wajib mengikuti itinerary asli.
Penolakan mengikuti jadwal semula dianggap pembatalan sepihak & dikenakan biaya pembatalan.

HARGA TOUR, VISA, PAJAK & BIAYA TAMBAHAN:
Harga tour, biaya visa, pajak bandara, bahan bakar & biaya transportasi udara dapat berubah sewaktu-waktu mengikuti fluktuasi kurs (USD/Euro) atau perubahan biaya pihak ketiga.
Kurs acuan saat penawaran: 1 USD = IDR 15.000, 1 Euro = IDR 16.000.
Selisih nilai tukar saat pelunasan menjadi tanggungan peserta & wajib diselesaikan sebelum keberangkatan.

TANGGUNG JAWAB:
Penyelenggara bertindak sebagai perantara/agen perjalanan; tidak bertanggung jawab langsung atas tindakan, kelalaian, atau keterlambatan pihak ketiga (maskapai, hotel, restoran, dll).
Tidak bertanggung jawab atas kejadian di luar kendali: kecelakaan, kehilangan/kerusakan barang, penahanan otoritas, penolakan imigrasi, force majeure, atau perubahan jadwal transportasi.
Biaya akibat karantina, keterlambatan transportasi, atau kebutuhan medis darurat menjadi tanggung jawab pribadi peserta.
Apabila peserta kurang dari 25 orang, Penyelenggara berhak membatalkan/menjadwalkan ulang keberangkatan (pemberitahuan paling lambat H-14).
Penyelenggara tidak bertanggung jawab atas kegagalan berangkat akibat kelalaian pribadi (telat ke bandara, dokumen tidak sah, pelanggaran imigrasi/bea cukai).

BIAYA PASPOR, VISA, PAJAK BANDARA & BEA MASUK:
Seluruh biaya dokumen perjalanan & kewajiban fiskal menjadi tanggung jawab masing-masing peserta.
Peserta yang menempati kamar sendiri dikenakan biaya tambahan Single Supplement.
Tips untuk Tour Leader, Local Guide & pengemudi tidak termasuk harga paket kecuali disebutkan.
Pengeluaran pribadi (laundry, minibar, telepon, room service, pembelian pribadi) ditanggung peserta sepenuhnya.

KETENTUAN PASPOR & VISA:
Salinan paspor wajib diserahkan saat pembayaran DP; keterlambatan berisiko menghambat proses visa.
Apabila visa diperlukan, pelunasan biaya visa bersamaan dengan pembayaran DP (kecuali diatur berbeda).
Paspor wajib berlaku minimal 7 bulan terhitung sejak tanggal keberangkatan.
Dokumen tambahan visa (surat keterangan kerja, rekening tabungan, dll) wajib diserahkan tepat waktu.

KETENTUAN TAMBAHAN (PENTING):
Dilarang memesan optional tour melalui internet/agen pihak ketiga/vendor lokal yang tidak resmi — pelanggaran dikenakan penalti USD 300/orang.
Peserta wajib mengikuti kunjungan ke toko resmi (shopping tour) yang merupakan bagian itinerary (tidak wajib membeli).
Pembayaran DP dianggap telah menyetujui seluruh syarat & ketentuan yang berlaku.
PT. Khasanah Global Internasional berhak mengubah jadwal penerbangan/itinerary demi efisiensi, alasan operasional, atau force majeure.
Penyalahgunaan tujuan wisata untuk bekerja atau melarikan diri dari rombongan: peserta & penjamin wajib membayar denda IDR 30.000.000/orang.`,
  khasanah: '',
};

export function defaultTermsFor(brand) {
  return DEFAULT_SYARAT_KETENTUAN[brand] || '';
}
