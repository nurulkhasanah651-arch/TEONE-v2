// Round 161: QuotationPreview Canada-style template
// + cicilan schedule + syarat visa + S&K standard 8 pasal
// Path: components/quotations/QuotationPreview.jsx

function fmtIDR(v) {
  if (v == null || v === '') return 'Rp 0';
  return 'Rp ' + Number(v || 0).toLocaleString('id-ID');
}

function fmtDate(v) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch { return String(v); }
}

// === STANDARD S&K (sama untuk semua trip Traveling Eropa) ===
const STANDARD_TERMS = [
  {
    title: 'PEMESANAN & PELUNASAN BIAYA',
    items: [
      'Pemesanan program perjalanan dilakukan melalui Customer Service resmi PT. Khasanah Global Internasional ("Penyelenggara") dengan melampirkan data paspor dan pembayaran uang muka (deposit) sesuai nominal yang ditetapkan.',
      'Peserta yang belum memiliki paspor wajib menyerahkan salinan KTP dan menyatakan kesediaan untuk membuat paspor dalam jangka waktu paling lambat 7 (tujuh) hari kalender sejak tanggal pendaftaran.',
      'Apabila peserta telah memiliki paspor, maka data paspor wajib segera dikirimkan kepada Customer Service setelah pendaftaran.',
      'Kegagalan peserta dalam melunasi biaya perjalanan sesuai tenggat waktu yang ditentukan akan dianggap sebagai pembatalan sepihak.',
      'Dengan melakukan pemesanan dan mentransfer dana, Peserta dianggap telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan yang ditetapkan tanpa paksaan dari pihak manapun.',
    ],
  },
  {
    title: 'PEMBATALAN & BIAYA PEMBATALAN',
    items: [
      'Setelah pendaftaran: seluruh dana yang telah dibayarkan (termasuk deposit) tidak dapat dikembalikan.',
      'Pembatalan dalam waktu 30 hari kalender sebelum keberangkatan (H-30): dikenakan biaya pembatalan sebesar 100% dari total biaya perjalanan.',
      'Biaya pembatalan dapat berubah sewaktu-waktu tanpa pemberitahuan terlebih dahulu, terutama dalam masa peak season atau untuk produk yang mencakup optional tour.',
      'Permintaan peserta untuk berpindah ke paket lain atau mengganti tanggal keberangkatan dianggap sebagai pembatalan dan dikenakan biaya sesuai ketentuan.',
      'Peserta tetap wajib membayar biaya proses pengurusan visa apabila pengajuan visa telah dimulai sebelum pembatalan.',
      'Untuk negara yang mewajibkan visa, apabila visa ditolak Kedutaan, maka seluruh biaya pengurusan visa dinyatakan non-refundable.',
      'Tiket internasional maupun domestik bersifat NON-REFUNDABLE, travel dapat sewaktu-waktu membelikan tanpa konfirmasi terlebih dahulu apabila pembayaran telah mencukupi.',
    ],
  },
  {
    title: 'DEVIASI / PERUBAHAN JADWAL',
    items: [
      'Permintaan perubahan atau penyimpangan jadwal (deviasi) di luar itinerary resmi merupakan tanggung jawab penuh Peserta, termasuk tambahan biaya tiket pesawat, akomodasi, transportasi lokal, dan biaya administratif lainnya.',
      'Apabila status deviasi belum mendapatkan konfirmasi hingga tenggat waktu, Peserta wajib mengikuti itinerary asli.',
      'Dalam hal deviasi tidak dapat dipenuhi dan Peserta menolak mengikuti jadwal semula, dianggap sebagai pembatalan sepihak.',
      'Apabila permintaan deviasi ditolak pihak maskapai, reservasi akan otomatis dibatalkan dan dikenakan biaya sesuai kebijakan pembatalan.',
    ],
  },
  {
    title: 'HARGA TOUR, VISA, PAJAK BANDARA, BAHAN BAKAR',
    items: [
      'Harga tour, biaya pengurusan visa, pajak bandara internasional, biaya bahan bakar, dan biaya tambahan transportasi udara dapat berubah sewaktu-waktu tanpa pemberitahuan apabila terjadi fluktuasi kurs USD/Euro terhadap IDR.',
      'Kurs acuan saat penawaran: 1 USD = IDR 17.000 · 1 Euro = IDR 20.000 (mengikuti kurs update)',
      'Selisih nilai tukar pada saat pelunasan menjadi tanggungan peserta sepenuhnya, dan wajib diselesaikan sebelum keberangkatan.',
    ],
  },
  {
    title: 'TANGGUNG JAWAB',
    items: [
      'PT. Khasanah Global Internasional bertindak semata-mata sebagai perantara atau agen perjalanan yang menghubungkan Peserta dengan pihak ketiga penyedia jasa.',
      'Penyelenggara tidak bertanggung jawab atas kejadian di luar kendali, termasuk: kecelakaan, kehilangan/kerusakan barang, keterlambatan/kehilangan bagasi, penahanan oleh otoritas, penolakan masuk negara, gangguan jadwal akibat force majeure, biaya tambahan dari perubahan jadwal maskapai.',
      'Seluruh biaya tambahan akibat karantina, perubahan jadwal, atau kebutuhan medis darurat menjadi tanggung jawab pribadi Peserta.',
      'Apabila jumlah peserta yang mendaftar kurang dari 25 orang, Penyelenggara berhak membatalkan atau menjadwalkan ulang keberangkatan, dengan pemberitahuan paling lambat 14 hari kalender sebelum tanggal keberangkatan.',
      'Penyelenggara tidak bertanggung jawab atas kegagalan keberangkatan Peserta yang disebabkan kelalaian pribadi (terlambat ke bandara, dokumen tidak lengkap, pelanggaran imigrasi).',
    ],
  },
  {
    title: 'BIAYA PASPOR, VISA, PAJAK & BEA MASUK',
    items: [
      'Seluruh biaya dokumen perjalanan dan kewajiban fiskal (paspor, visa, pajak bandara, bea masuk) menjadi tanggung jawab penuh masing-masing Peserta.',
      'Peserta yang memilih kamar sendiri akan dikenakan biaya tambahan Single Supplement sesuai nominal yang ditetapkan.',
      'Biaya tipping Tour Leader, Local Guide, dan pengemudi tidak termasuk dalam harga paket kecuali secara tegas disebutkan.',
      'Pengeluaran pribadi (laundry, minibar, telepon, layanan kamar, pembelian pribadi) menjadi tanggung jawab pribadi Peserta.',
    ],
  },
  {
    title: 'KETENTUAN PASPOR & VISA',
    items: [
      'Peserta wajib menyerahkan salinan paspor yang masih berlaku saat pembayaran uang muka.',
      'Apabila visa diperlukan, Peserta wajib melakukan pelunasan biaya visa bersamaan dengan pembayaran uang muka kecuali diatur berbeda.',
      'Paspor peserta wajib memiliki masa berlaku minimal 7 (tujuh) bulan terhitung sejak tanggal keberangkatan.',
      'Untuk pengajuan visa yang memerlukan dokumen tambahan, Peserta wajib menyerahkannya sesuai batas waktu yang ditentukan Penyelenggara atau Kedutaan.',
      'Untuk pengajuan visa sendiri, kami tidak menyediakan dokumen pendukung dalam bentuk apapun.',
    ],
  },
  {
    title: 'KETENTUAN TAMBAHAN (CATATAN PENTING)',
    items: [
      'Peserta dilarang melakukan pemesanan optional tour (Hot Air Balloon, Jeep Safari, dll) melalui internet/agen pihak ketiga yang tidak ditunjuk Penyelenggara. Pelanggaran dikenakan penalti USD 300 per orang.',
      'Peserta wajib mengikuti kunjungan ke toko resmi (shopping tour) yang merupakan bagian dari itinerary. Kehadiran wajib, namun tidak berkewajiban melakukan pembelian.',
      'Peserta yang telah membayar uang muka dianggap telah membaca, memahami, dan menyetujui seluruh syarat dan ketentuan.',
      'PT. Khasanah Global Internasional berhak melakukan perubahan jadwal penerbangan/susunan acara/itinerary apabila dibutuhkan demi efisiensi perjalanan atau alasan operasional.',
      'Apabila peserta menyalahgunakan tujuan wisata untuk bekerja atau melarikan diri dari rombongan, peserta dan pihak keluarga (penjamin) bersedia bertanggung jawab penuh membayar denda penalty sebesar IDR 30.000.000/orang secara tunai kepada Travelingeropa.',
    ],
  },
];

const CATEGORY_BADGE = {
  europe:        { label: 'EUROPE', emoji: '🗼' },
  asia:          { label: 'ASIA', emoji: '🗾' },
  umroh:         { label: 'UMROH', emoji: '🕋' },
  domestic:      { label: 'DOMESTIK', emoji: '🏝' },
  international: { label: 'INTERNATIONAL', emoji: '✈' },
};

const DEFAULT_BANK_INFO = 'Bank BCA 2063535001 a.n. PT. Khasanah Global Internasional';

export default function QuotationPreview({ quotation, isPublic = false }) {
  const q = quotation;
  const cat = CATEGORY_BADGE[q.category] || CATEGORY_BADGE.international;
  const brandColor = q.brand_color || '#1e3a8a';

  // Group price options visually (Quad, Triple, Double, Single ditampilkan berbeda dari Child, Infant, Land Tour)
  const prices = q.price_options || [];
  const featuredPrice = prices[0]; // The biggest displayed one

  return (
    <div className="quotation-preview bg-white text-slate-800" data-quotation-preview style={{ '--brand': brandColor }}>

      {/* =============== PAGE 1: COVER + PRICES =============== */}
      <section className="relative min-h-screen md:min-h-[900px] flex flex-col">
        {/* Background */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: q.hero_image_url
              ? `linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.85) 100%), url(${q.hero_image_url})`
              : `linear-gradient(135deg, ${brandColor} 0%, ${darken(brandColor, 30)} 100%)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />

        {/* Header brand bar */}
        <div className="relative z-10 bg-white/95 backdrop-blur border-b border-slate-200 py-3 px-4 md:px-12 text-[10px] md:text-xs text-slate-700">
          <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {q.agency_logo_url && <img src={q.agency_logo_url} alt="Logo" className="h-8 w-auto" />}
              <div>
                <p className="font-bold text-brand-700">PT. Khasanah Global Internasional</p>
                <p className="text-[9px] md:text-[11px] text-slate-500">Ruko Golden 8 Blok B.9, Jl. Ki Hajar Dewantara, Tangerang, Banten 15810</p>
              </div>
            </div>
            <div className="text-right">
              {q.contact_wa && <p className="font-bold">{formatWA(q.contact_wa)}</p>}
              <p className="text-[9px] md:text-[11px] text-slate-500">travelingeropa.com</p>
            </div>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex flex-col justify-center items-center text-center text-white p-6 md:p-12">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur px-4 py-1.5 rounded-full mb-4">
            <span>{cat.emoji}</span>
            <span className="text-xs md:text-sm font-bold tracking-widest">{cat.label}</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight mb-3 max-w-4xl">{q.title}</h1>
          {q.subtitle && <p className="text-lg md:text-2xl font-semibold mb-3 opacity-95">{q.subtitle}</p>}
          {q.tagline && <p className="text-base md:text-lg italic opacity-90 mb-4 max-w-2xl">{q.tagline}</p>}
          {(q.departure_date || q.return_date) && (
            <p className="text-lg md:text-2xl font-bold tracking-wide mt-2">
              {q.departure_date && fmtDate(q.departure_date).toUpperCase()}
              {q.departure_date && q.return_date && ' — '}
              {q.return_date && fmtDate(q.return_date).toUpperCase()}
            </p>
          )}
        </div>

        {/* Price grid */}
        {prices.length > 0 && (
          <div className="relative z-10 bg-white p-6 md:p-12">
            <div className="max-w-5xl mx-auto">
              {/* Featured price (biggest) */}
              {featuredPrice && (
                <div
                  className="text-center mb-6 p-6 md:p-8 rounded-2xl text-white shadow-2xl"
                  style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${darken(brandColor, 25)} 100%)` }}
                >
                  <p className="text-xs md:text-sm font-bold uppercase tracking-widest opacity-90">{featuredPrice.label}</p>
                  <p className="text-4xl md:text-6xl font-bold mt-2">{fmtIDR(featuredPrice.price)}</p>
                  {featuredPrice.note && <p className="text-xs md:text-sm opacity-80 mt-1">{featuredPrice.note}</p>}
                </div>
              )}

              {/* Other prices grid */}
              {prices.length > 1 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                  {prices.slice(1).map((p, i) => (
                    <div
                      key={i}
                      className="rounded-xl p-4 text-center shadow-md border-2"
                      style={{ borderColor: brandColor }}
                    >
                      <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider" style={{ color: brandColor }}>{p.label}</p>
                      <p className="text-xl md:text-2xl font-bold text-slate-800 mt-1">{fmtIDR(p.price)}</p>
                      {p.note && <p className="text-[10px] text-slate-500 mt-0.5">{p.note}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* DP */}
              {q.dp_amount > 0 && (
                <div className="text-center bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                  <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">DP (Down Payment)</p>
                  <p className="text-2xl md:text-3xl font-bold text-amber-700 mt-1">{fmtIDR(q.dp_amount)}/Orang</p>
                </div>
              )}

              {/* Single room note */}
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] md:text-xs text-slate-700 italic">
                <strong>📌 Note PENTING:</strong> Bagi peserta yang mendaftar sendirian dan di kemudian hari tidak ditemukan roommate/teman sekamar, maka akan <strong>OTOMATIS TERUPGRADE</strong> menjadi tipe kamar SINGLE. Penambahan selisih biaya adalah tanggung jawab peserta.
              </div>
            </div>
          </div>
        )}
      </section>

      {/* =============== PAGE 2: INCLUDE / EXCLUDE =============== */}
      {(q.inclusions?.length > 0 || q.exclusions?.length > 0) && (
        <PageWrap brandColor={brandColor}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {q.inclusions?.length > 0 && (
              <div>
                <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ color: brandColor }}>
                  ✅ Include
                </h2>
                <ul className="space-y-2">
                  {q.inclusions.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm md:text-base text-slate-700">
                      <span className="text-green-600 font-bold mt-0.5">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {q.exclusions?.length > 0 && (
              <div>
                <h2 className="text-2xl md:text-3xl font-bold mb-4" style={{ color: brandColor }}>
                  ❌ Exclude
                </h2>
                <ul className="space-y-2">
                  {q.exclusions.map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm md:text-base text-slate-700">
                      <span className="text-red-600 font-bold mt-0.5">✗</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </PageWrap>
      )}

      {/* =============== PAGE 3: HIGHLIGHTS (kalau ada) =============== */}
      {q.highlights?.length > 0 && (
        <PageWrap brandColor={brandColor}>
          <h2 className="text-2xl md:text-3xl font-bold mb-4 text-center" style={{ color: brandColor }}>
            ⭐ HIGHLIGHT DESTINATION
          </h2>
          {q.tagline && <p className="text-center text-slate-600 italic mb-6">{q.tagline}</p>}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {q.highlights.map((h, i) => (
              <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-4xl mb-2">{h.icon}</p>
                <p className="text-sm font-semibold text-slate-700">{h.text}</p>
              </div>
            ))}
          </div>
        </PageWrap>
      )}

      {/* =============== PAGE 4: ITINERARY =============== */}
      {q.itinerary?.length > 0 && (
        <PageWrap brandColor={brandColor}>
          <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center" style={{ color: brandColor }}>
            🗓 ITINERARY
          </h2>
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ backgroundColor: brandColor, color: 'white' }}>
                <th className="text-left p-3 text-sm md:text-base font-bold uppercase tracking-wider w-1/3 md:w-1/4">Tanggal</th>
                <th className="text-left p-3 text-sm md:text-base font-bold uppercase tracking-wider">Tujuan</th>
              </tr>
            </thead>
            <tbody>
              {q.itinerary.map((day, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-3 align-top border-b border-slate-200">
                    <p className="font-bold text-sm md:text-base" style={{ color: brandColor }}>Day {day.day || i + 1}</p>
                    <p className="text-xs md:text-sm text-slate-700 mt-0.5">{day.title}</p>
                  </td>
                  <td className="p-3 align-top border-b border-slate-200">
                    <ul className="space-y-1">
                      {(day.activities || []).map((act, j) => (
                        <li key={j} className="text-xs md:text-sm text-slate-700">{act}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PageWrap>
      )}

      {/* =============== PAGE 5: PAYMENT SCHEDULE (CICILAN) =============== */}
      {q.payment_schedule?.length > 0 && (
        <PageWrap brandColor={brandColor}>
          <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center" style={{ color: brandColor }}>
            💳 Jadwal Pembayaran
          </h2>
          <table className="w-full border-collapse mb-4">
            <thead>
              <tr style={{ backgroundColor: brandColor, color: 'white' }}>
                <th className="text-left p-3 text-sm md:text-base font-bold uppercase tracking-wider">Down Payment & Cicilan</th>
                <th className="text-right p-3 text-sm md:text-base font-bold uppercase tracking-wider">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {q.payment_schedule.map((p, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="p-3 border-b border-slate-200">
                    <p className="font-semibold text-sm md:text-base text-slate-800">{p.label}</p>
                    {p.date && <p className="text-xs text-slate-500 mt-0.5">{p.date}</p>}
                  </td>
                  <td className="p-3 text-right border-b border-slate-200 font-bold text-sm md:text-base" style={{ color: brandColor }}>
                    {typeof p.amount === 'number' ? fmtIDR(p.amount) : p.amount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Bank info */}
          <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Semua pembayaran dapat dilakukan dengan transfer ke:</p>
            <p className="text-base md:text-lg font-bold" style={{ color: brandColor }}>
              {q.bank_info || DEFAULT_BANK_INFO}
            </p>
          </div>
        </PageWrap>
      )}

      {/* =============== PAGE 6: SYARAT VISA (kalau ada) =============== */}
      {q.show_visa_requirements !== false && q.visa_requirements?.length > 0 && (
        <PageWrap brandColor={brandColor}>
          <h2 className="text-2xl md:text-3xl font-bold mb-6" style={{ color: brandColor }}>
            🛂 Syarat Visa {q.category === 'europe' ? 'Schengen' : ''}
          </h2>
          <ol className="space-y-2 list-decimal pl-6">
            {q.visa_requirements.map((item, i) => (
              <li key={i} className="text-xs md:text-sm text-slate-700 leading-relaxed">{item}</li>
            ))}
          </ol>
        </PageWrap>
      )}

      {/* =============== PAGE 7+: SYARAT & KETENTUAN STANDARD =============== */}
      {q.show_terms !== false && (
        <PageWrap brandColor={brandColor}>
          <h2 className="text-2xl md:text-3xl font-bold mb-6 text-center" style={{ color: brandColor }}>
            📋 Syarat & Ketentuan
          </h2>
          <div className="space-y-6">
            {STANDARD_TERMS.map((section, i) => (
              <div key={i}>
                <h3 className="font-bold text-base md:text-lg mb-2 pb-1 border-b-2" style={{ color: brandColor, borderColor: brandColor }}>
                  {i + 1}. {section.title}
                </h3>
                <ol className="space-y-1.5 list-decimal pl-6">
                  {section.items.map((item, j) => (
                    <li key={j} className="text-xs md:text-sm text-slate-700 leading-relaxed">{item}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </PageWrap>
      )}

      {/* =============== EXTRA NOTES (kalau ada) =============== */}
      {q.notes && (
        <PageWrap brandColor={brandColor}>
          <h2 className="text-xl md:text-2xl font-bold mb-4" style={{ color: brandColor }}>
            📝 Catatan Tambahan
          </h2>
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{q.notes}</div>
        </PageWrap>
      )}

      {/* =============== CTA — CONTACT =============== */}
      {(q.contact_wa || q.contact_email) && (
        <PageWrap brandColor={brandColor}>
          <div
            className="rounded-3xl p-8 md:p-12 text-white text-center shadow-2xl"
            style={{ background: `linear-gradient(135deg, ${brandColor} 0%, ${darken(brandColor, 30)} 100%)` }}
          >
            <h3 className="text-2xl md:text-4xl font-bold mb-3">Tertarik Booking?</h3>
            <p className="opacity-90 mb-6 text-sm md:text-base">Hubungi kami untuk informasi lebih lanjut & reservasi</p>
            {q.contact_name && (
              <p className="text-sm opacity-90 mb-4">Contact: <strong>{q.contact_name}</strong></p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {q.contact_wa && (
                <a
                  href={`https://wa.me/${q.contact_wa.replace(/[^0-9]/g, '')}?text=Halo,%20saya%20tertarik%20dengan%20penawaran%20${encodeURIComponent(q.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-bold rounded-full shadow-lg transition-transform hover:scale-105"
                >
                  <span className="text-xl">💬</span>
                  <span>Chat WhatsApp</span>
                </a>
              )}
              {q.contact_email && (
                <a
                  href={`mailto:${q.contact_email}?subject=Inquiry: ${encodeURIComponent(q.title)}`}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-slate-800 font-bold rounded-full shadow-lg transition-transform hover:scale-105"
                >
                  <span className="text-xl">✉</span>
                  <span>Email</span>
                </a>
              )}
            </div>
          </div>
        </PageWrap>
      )}

      {/* Footer */}
      <footer className="text-center text-[10px] md:text-xs text-slate-400 py-6 border-t border-slate-200 px-4">
        <p>📷 @travelingeropa · @travelingamerika · travelingeropa.com</p>
        <p className="mt-1">Penawaran ini bersifat estimasi · Harga & ketersediaan dapat berubah sewaktu-waktu</p>
        {!isPublic && (
          <p className="mt-1 opacity-50">Generated by TEONE · {new Date().toLocaleDateString('id-ID')}</p>
        )}
      </footer>
    </div>
  );
}

function PageWrap({ children, brandColor }) {
  return (
    <section className="bg-white p-6 md:p-12 border-t border-slate-200" style={{ pageBreakBefore: 'always' }}>
      <div className="max-w-4xl mx-auto">{children}</div>
    </section>
  );
}

function formatWA(wa) {
  if (!wa) return '';
  const clean = wa.replace(/[^0-9]/g, '');
  if (clean.startsWith('62')) {
    const num = clean.slice(2);
    return `0${num.slice(0, 3)}-${num.slice(3, 7)}-${num.slice(7)}`;
  }
  return wa;
}

function darken(hex, amount) {
  if (!hex || !hex.startsWith('#')) return '#1e3a8a';
  const num = parseInt(hex.slice(1), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
