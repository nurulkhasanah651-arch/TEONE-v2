// Emoji rusak jadi "◆" saat template WA disalin manual dari browser lalu di-paste
// ke WhatsApp Desktop. Untuk Khasanah — di mana PIC memang menyalin pesan secara
// manual — pesan dibersihkan dari emoji supaya rapi. TEONE tidak diubah.

import { currentBrandCode } from '@/lib/supabase/service-env';

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{FE0E}\u{20E3}\u{200D}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F000}-\u{1FAFF}]/gu;

/** Buang emoji + rapikan spasi/baris kosong sisa. */
export function stripEmoji(text) {
  if (!text) return text;
  return String(text)
    .replace(EMOJI, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, '').replace(/^[ \t]+/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function brandSafe() {
  try { return currentBrandCode() || ''; } catch { return ''; }
}

/** Khasanah: tanpa emoji. Brand lain: apa adanya. */
export function plainForBrand(text) {
  return String(brandSafe()).toLowerCase() === 'khasanah' ? stripEmoji(text) : text;
}
