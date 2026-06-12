// Live Google Reviews via Google Places Details API.
// Aktif jika GOOGLE_PLACES_API_KEY (env Vercel) + googlePlaceId (storefront-config) terisi.
// Jika tidak → return null, pemanggil fallback ke review kurasi manual. Web tidak error.

export async function getGoogleReviews(placeId) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !placeId) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=rating,user_ratings_total,reviews&language=id&reviews_sort=newest&key=${key}`;
    // Cache 1 jam supaya hemat kuota & cepat
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.status !== 'OK' || !j.result) return null;
    const r = j.result;
    const reviews = (r.reviews || [])
      .filter((rv) => (rv.rating || 0) >= 4 && (rv.text || '').trim())
      .slice(0, 6)
      .map((rv) => ({
        name: rv.author_name || 'Google User',
        text: rv.text,
        stars: Math.round(rv.rating || 5),
        photo: rv.profile_photo_url || null,
        when: rv.relative_time_description || '',
      }));
    return {
      rating: r.rating != null ? String(r.rating).replace('.', ',') : null,
      count: r.user_ratings_total != null ? String(r.user_ratings_total) : null,
      reviews,
    };
  } catch {
    return null;
  }
}
