'use server';
// Template Copy WA per trip (Master Trip). Itinerary garis besar per hari dari itinerary web.
import { createClient } from '@/lib/supabase/server';
import { getBrandBank } from '@/lib/shop/data';
import { getBrandCode } from '@/lib/brand';
import { customerSiteUrlFor } from '@/lib/brand-shared';

const MON = ['JANUARI','FEBRUARI','MARET','APRIL','MEI','JUNI','JULI','AGUSTUS','SEPTEMBER','OKTOBER','NOVEMBER','DESEMBER'];
function jt(n) {
  const v = (Number(n) || 0) / 1e6;
  return (Math.round(v * 10) / 10).toString(); // 18.9 , 9.5 , 65
}
function dateParts(x) {
  if (!x) return null;
  const d = new Date(String(x) + 'T00:00:00');
  if (isNaN(d)) return null;
  return { day: d.getDate(), mon: MON[d.getMonth()], year: d.getFullYear() };
}
function tanggalRange(dep, ret) {
  const a = dateParts(dep), b = dateParts(ret);
  if (!a) return '';
  if (!b) return `${a.day} ${a.mon} ${a.year}`;
  const sameYear = a.year === b.year;
  const left = sameYear ? `${a.day} ${a.mon}` : `${a.day} ${a.mon} ${a.year}`;
  return `${left} - ${b.day} ${b.mon} ${b.year}`;
}
function titleCase(s) {
  return String(s || '').toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}
function routeFromItin(it, i) {
  const t = String(it?.title || '').trim();
  let route = t.includes('|') ? t.split('|').slice(1).join('|').trim() : t;
  route = route.replace(/^Day\s*\d+\s*[:\-|]?\s*/i, '').trim();
  return titleCase(route || `Hari ${it?.day || i + 1}`);
}
function bulletLines(text) {
  return String(text || '')
    .split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    .map((s) => `• ${s}`);
}

export async function getTripWaTemplate(tripId) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const { data: t } = await supabase.from('trips')
    .select('id, kode_trip, name, public_title, departure, return_date, price, public_price, dp_amount, slug, itinerary, included, excluded')
    .eq('id', tripId).maybeSingle();
  if (!t) return { error: 'Trip tidak ditemukan' };

  const bank = await getBrandBank().catch(() => null);
  const domain = customerSiteUrlFor(getBrandCode());

  const promo = Number(t.public_price) || Number(t.price) || 0;
  const normal = promo > 0 ? promo + 10000000 : 0; // harga coret = promo + Rp 10jt
  const nama = (t.public_title || t.name || '').trim();

  const itin = Array.isArray(t.itinerary) ? t.itinerary : [];
  const itinLines = itin.map((it, i) => ` ${it?.day || i + 1}. ${routeFromItin(it, i)}`);

  const inc = bulletLines(t.included);
  const exc = bulletLines(t.excluded);

  const L = [];
  L.push(`*${t.kode_trip ? t.kode_trip + '. ' : ''}${nama}*`);
  L.push('');
  L.push(`Tanggal : ${tanggalRange(t.departure, t.return_date)}`);
  let hargaLine = `*HARGA PROMO ${jt(promo)}JUTAAN ‼️*`;
  if (normal) hargaLine += ` _(Normal ${jt(normal)}jutaan)_`;
  L.push(hargaLine);
  if (itinLines.length) { L.push(''); L.push('*Itinerary*'); L.push(...itinLines); }
  if (inc.length) { L.push(''); L.push('*Include*'); L.push(...inc); }
  if (exc.length) { L.push(''); L.push('*Exclude*'); L.push(...exc); }
  L.push('');
  L.push(`*BOOKSEAT DP ${jt(t.dp_amount)}JT/PAX*`);
  if (bank?.bank_account_no) {
    L.push(`• manual bisa transfer No. Rek ${bank.bank_name || 'BCA'}: ${bank.bank_account_no} a/n ${bank.bank_account_name || ''}`.trimEnd());
  }
  L.push('• pembayaran online langsung confirm bisa via web (link dibawah)');
  L.push('');
  L.push('*CHECK OUT CEPAT TANPA ANTRI & ITINERARY CEK DILINK INI⤵️*');
  L.push(`${domain.replace(/\/$/, '')}/trip/${t.slug || t.id}`);

  return { ok: true, text: L.join('\n') };
}
