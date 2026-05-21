-- =====================================================================
-- DIAGNOSTIC: Cek apakah peserta SUDAH ada di trip_passengers untuk trip
-- yang kamu test di /visa
-- =====================================================================
-- Jalankan di Supabase → SQL Editor → New Query satu per satu.
-- Note hasil tiap query, lalu kasih tau aku.
-- =====================================================================

-- Q1: Berapa total peserta di SEMUA trip?
SELECT COUNT(*) AS total_passengers_all_trips FROM trip_passengers;

-- Q2: Trip mana saja yang punya peserta? (top 10)
SELECT
  trip_id,
  COUNT(*) AS passenger_count
FROM trip_passengers
GROUP BY trip_id
ORDER BY passenger_count DESC
LIMIT 10;

-- Q3: List semua trip + jumlah peserta-nya (sort by departure)
SELECT
  t.id,
  t.kode_trip,
  t.name,
  t.departure,
  (SELECT COUNT(*) FROM trip_passengers WHERE trip_id = t.id) AS jumlah_peserta
FROM trips t
WHERE t.status NOT IN ('completed', 'cancelled')
ORDER BY t.departure ASC NULLS LAST
LIMIT 20;

-- Q4: Cek RLS status di trip_passengers
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'trip_passengers';
-- Kalau relrowsecurity = true, RLS ON. Kalau false, RLS OFF.

-- Q5: Kalau RLS ON dan blocking, disable buat testing:
-- ALTER TABLE trip_passengers DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE customers DISABLE ROW LEVEL SECURITY;

-- =====================================================================
-- INTERPRETASI HASIL:
-- =====================================================================
-- Kalau Q1 = 0:
--   → Belum ada peserta SAMA SEKALI di DB. Input dulu via:
--     /trips/[tripId]/edit → scroll ke section peserta → Tambah
--     ATAU /cs (form CS daily juga sekalian input peserta)
--
-- Kalau Q1 > 0 tapi Q2 tidak menyebut trip_id yang kamu test:
--   → Peserta diinput ke TRIP LAIN, bukan ke trip yang sedang dibuka
--     di /visa. Buka URL trip yang ada peserta-nya.
--
-- Kalau Q3 nunjukin "jumlah_peserta > 0" untuk trip yg kamu test
-- tapi /visa bilang kosong:
--   → RLS issue. Cek Q4 → kalau RLS ON, jalankan Q5 untuk disable.
--
-- =====================================================================
