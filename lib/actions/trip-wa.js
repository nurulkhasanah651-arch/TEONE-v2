'use server';
// Template Copy WA per trip (Master Trip). Itinerary garis besar per hari dari itinerary web.
import { createClient } from '@/lib/supabase/server';
import { getBrandBank } from '@/lib/shop/data';
import { getBrandCode } from '@/lib/brand';
import { customerSiteUrlFor, BRAND_CODES } from '@/lib/brand-shared';
import { serviceClientFor } from '@/lib/supabase/service-env';

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

export async function getTripWaTemplate(tripId, brandCode) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // Brand target: default brand aktif. Kalau brandCode diisi & beda brand (mis. TL/mitra
  // buka trip Khasanah saat di TEONE), baca trip + bank dari DB brand tsb via service-role.
  const active = getBrandCode();
  const brand = (brandCode && BRAND_CODES.includes(brandCode)) ? brandCode : active;
  const crossBrand = brand !== active;
  const db = crossBrand ? (serviceClientFor(brand) || supabase) : supabase;

  const { data: t } = await db.from('trips')
    .select('id, kode_trip, name, public_title, departure, return_date, price, public_price, dp_amount, slug, itinerary, included, excluded')
    .eq('id', tripId).maybeSingle();
  if (!t) return { error: 'Trip tidak ditemukan' };

  const bank = await getBrandBank(crossBrand ? brand : undefined).catch(() => null);
  const isKh = String(brand || '').toLowerCase() === 'khasanah';
  const domain = customerSiteUrlFor(brand);

  const promo = Number(t.public_price) || Number(t.price) || 0;
  const normal = promo > 0 ? promo + 10000000 : 0; // harga coret = promo + Rp 10jt
  const nama = (t.public_title || t.name || '').trim();

  const itin = Array.isArray(t.itinerary) ? t.itinerary : [];
  const itinLines = itin.map((it, i) => ` ${it?.day || i + 1}. ${routeFromItin(it, i)}`);

  const inc = bulletLines(t.included);
  // KHASANAH: exclude yang ditampilkan HANYA yang ada nominal harga (Rp/angka) + "optional tour".
  // (Item tanpa harga seperti "Paspor & dokumen pribadi" tidak ditampilkan.) TEONE: tampil semua.
  const _excKeep = (s) => /rp\s*[\d.]/i.test(s) || /\d{3,}/.test(s) || /optional/i.test(s);
  const exc = bulletLines(t.excluded).filter((line) => (isKh ? _excKeep(line) : true));

  const L = [];
  L.push(`*${t.kode_trip ? t.kode_trip + '. ' : ''}${nama}*`);
  L.push('');
  L.push(`Tanggal : ${tanggalRange(t.departure, t.return_date)}`);
  let hargaLine = `*HARGA PROMO ${jt(promo)}JUTAAN ‼️*`;
  if (normal) hargaLine += ` _(Normal ${jt(normal)}jutaan)_`;
  L.push(hargaLine);
  // KHASANAH: itinerary TIDAK ditampilkan (cek di link web). TEONE: tetap tampil garis besar.
  if (!isKh && itinLines.length) { L.push(''); L.push('*Itinerary*'); L.push(...itinLines); }
  if (inc.length) { L.push(''); L.push('*Include*'); L.push(...inc); }
  if (exc.length) { L.push(''); L.push('*Exclude*'); L.push(...exc); }
  L.push('');
  L.push(`*BOOKSEAT DP ${jt(t.dp_amount)}JT/PAX*`);
  // Rekening bisa lebih dari satu (mis. Khasanah: Mandiri + BCA).
  const waAccts = (Array.isArray(bank?.accounts) && bank.accounts.length)
    ? bank.accounts
    : (bank?.bank_account_no ? [{ bank_name: bank.bank_name, account_no: bank.bank_account_no, account_name: bank.bank_account_name }] : []);
  if (waAccts.length === 1) {
    const a = waAccts[0];
    L.push(`• manual bisa transfer No. Rek ${a.bank_name || 'BCA'}: ${a.account_no} a/n ${a.account_name || ''}`.trimEnd());
  } else if (waAccts.length > 1) {
    L.push('• manual bisa transfer ke salah satu rekening:');
    for (const a of waAccts) {
      L.push(`   - ${a.bank_name || 'BCA'}: ${a.account_no} a/n ${a.account_name || ''}`.trimEnd());
    }
  }
  L.push('• pembayaran online langsung confirm bisa via web (link dibawah)');
  L.push('');
  L.push('*CHECK OUT CEPAT TANPA ANTRI & ITINERARY CEK DILINK INI⤵️*');
  L.push(`${domain.replace(/\/$/, '')}/trip/${t.slug || t.id}`);

  return { ok: true, text: L.join('\n') };
}
