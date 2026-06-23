// Konten marketing storefront — mudah diedit tanpa ubah layout.
// Per brand: hero, statistik "market leader", tentang, testimoni (Google Review), video YouTube.

export const STOREFRONT = {
  teone: {
    brandName: 'Traveling Eropa',
    badge: '#1 Market Leader Open Trip Eropa di Indonesia',
    heroTitle: 'Wujudkan Liburan Impian ke Eropa & Dunia',
    heroSubtitle: 'Open trip terkurasi dengan tour leader berpengalaman. Sudah lebih dari 10.000 peserta berangkat bersama kami ke 20+ negara di 5 benua.',
    heroImages: [
      'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=1600&q=80',
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=1600&q=80',
      'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1600&q=80',
      'https://images.unsplash.com/photo-1520986606214-8b456906c813?w=1600&q=80',
    ],
    waNumber: '6282210991200',
    contact: {
      phone: '6282210991200',
      email: 'info@travelingeropa.com',
      address: 'Traveling Eropa HQ — PT Khasanah Global Internasional. Ruko Graha Boulevard, Jl. Gading Serpong Boulevard, Curug Sangereng, Kec. Kelapa Dua, Kab. Tangerang, Banten 15810',
      instagram: 'https://www.instagram.com/travelingeropa/',
      tiktok: 'https://www.tiktok.com/@travelingeropa',
    },
    bank: { nama: 'BCA', norek: '1234567890', an: 'PT Khasanah Global Internasional' },
    stats: [
      { value: '10.000+', label: 'Peserta Berangkat' },
      { value: '20+', label: 'Negara' },
      { value: '5', label: 'Benua' },
      { value: '5.0★', label: 'Rating Google' },
    ],
    about: {
      title: 'Tentang Traveling Eropa Group',
      body: 'Traveling Eropa Group adalah travel open trip yang berdiri sejak 2018 dan telah memberangkatkan lebih dari 10.000 peserta menjelajah 20+ negara di 5 benua. Kami percaya perjalanan terbaik adalah yang terencana matang, aman, dan penuh cerita — ditemani tour leader profesional dari keberangkatan hingga kembali ke tanah air.',
      image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1000&q=80',
      points: ['Berdiri sejak 2018', 'Tour leader berpengalaman', 'Itinerary terkurasi', 'Pembayaran aman & bisa DP'],
    },
    googlePlaceId: 'ChIJZxvP9n77aS4Ry1RiFPNh1gw', // Traveling Eropa — review Google live (perlu env GOOGLE_PLACES_API_KEY)
    googleReviewUrl: 'https://www.google.com/maps?cid=925034470118151371',
    googleRating: '5,0',
    googleCount: '600',
    testimonials: [
      { name: 'Prita Andriani', text: 'Pengalaman trip ke Eropa bareng Traveling Eropa luar biasa! Tour leader ramah, itinerary padat tapi tetap nyaman. Pasti ikut lagi.', stars: 5 },
      { name: 'Septianus Heryanto', text: 'Pelayanan profesional dari awal sampai akhir. Semua dokumen dibantu, hotel bagus, dan jadwal on time. Recommended banget!', stars: 5 },
      { name: 'Filia Tjoanda', text: 'Sudah 2x ikut open trip dan selalu memuaskan. Harga worth it dengan fasilitas yang didapat. Terima kasih Traveling Eropa!', stars: 5 },
    ],
    youtube: [], // isi dengan ID video YouTube, mis: ['dQw4w9WgXcQ']
    youtubeChannel: 'https://www.youtube.com/@travelingeropa',
  },
  khasanah: {
    brandName: 'Khasanah Travel',
    badge: 'Travel Umroh & Wisata Halal Terpercaya',
    heroTitle: 'Umroh Khusyuk, Wisata Halal Berkesan',
    heroSubtitle: 'Bimbingan ibadah amanah dengan pembimbing berpengalaman. Berangkat tenang, pulang penuh berkah.',
    heroImages: [
      'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?w=1600&q=80',
      'https://images.unsplash.com/photo-1564769662533-4f00a87b4056?w=1600&q=80',
      'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?w=1600&q=80',
    ],
    waNumber: '6282124144331',
    contact: {
      phone: '6282124144331',
      email: '',
      address: '',
      instagram: '',
      tiktok: '',
    },
    bank: { nama: 'BCA', norek: '0987654321', an: 'PT Khasanah Global Internasional' },
    stats: [
      { value: 'Ribuan', label: 'Jamaah' },
      { value: 'Amanah', label: 'Bimbingan Ibadah' },
      { value: 'Resmi', label: 'Izin PPIU/PIHK' },
      { value: '5.0★', label: 'Rating Google' },
    ],
    about: {
      title: 'Tentang Khasanah Travel',
      body: 'Khasanah Travel adalah penyelenggara umroh dan wisata halal yang mengutamakan kenyamanan ibadah jamaah. Dengan pembimbing berpengalaman, akomodasi dekat Masjidil Haram & Nabawi, serta pelayanan amanah, kami menemani perjalanan spiritual Anda dari awal hingga kembali ke tanah air.',
      image: 'https://images.unsplash.com/photo-1564769662533-4f00a87b4056?w=1000&q=80',
      points: ['Bimbingan ibadah amanah', 'Hotel dekat Masjid', 'Pembimbing berpengalaman', 'Pembayaran aman & bisa DP'],
    },
    googlePlaceId: '', // isi Place ID Google Maps Khasanah Travel untuk review live
    googleReviewUrl: 'https://www.google.com/search?q=khasanah+travel+review',
    googleRating: '5,0',
    googleCount: '30',
    testimonials: [
      { name: 'Hamba Allah', text: 'Alhamdulillah umroh bersama Khasanah sangat berkesan. Pembimbing sabar, hotel dekat masjid. Barakallah.', stars: 5 },
      { name: 'Jamaah Khasanah', text: 'Pelayanan amanah dan profesional. Semua kebutuhan ibadah dibantu dengan baik. Insya Allah ikut lagi.', stars: 5 },
      { name: 'Keluarga Bahagia', text: 'Perjalanan lancar, jadwal rapi, dan jamaah diperhatikan. Terima kasih Khasanah Travel.', stars: 5 },
    ],
    youtube: [],
    youtubeChannel: 'https://www.youtube.com/results?search_query=khasanah+travel',
  },
};

export function storefrontConfig(code) { return STOREFRONT[code] || STOREFRONT.teone; }
