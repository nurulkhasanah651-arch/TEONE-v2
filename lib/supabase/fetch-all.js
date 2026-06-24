// Ambil SEMUA baris dari sebuah query (paginasi server-side via .range), bukan terpotong 1000.
// Dipakai untuk komputasi agregat (total kas, ringkasan) agar akurat & tahan skala.
// makeQuery: fungsi yang mengembalikan query Supabase BARU tiap dipanggil, mis. () => supabase.from('x').select('a,b')
export async function fetchAll(makeQuery, { chunk = 1000, max = 500000 } = {}) {
  const out = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + chunk - 1);
    if (error) { if (out.length) break; return []; }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < chunk || out.length >= max) break;
    from += chunk;
  }
  return out;
}
