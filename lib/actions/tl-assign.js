'use server';

// TL Assignment via WhatsApp Fonnte API
// Plus helper untuk H-14 cron reminder (Round 70)

import { revalidatePath } from 'next/cache';
import { createClient as createAuthClient, createPublicClient as createClient } from '@/lib/supabase/server';
import { getFonnteToken, sendFonnte, normalizePhone } from '@/lib/utils/fonnte';
import { currentBrandCode } from '@/lib/supabase/service-env';
import { siteUrlFor } from '@/lib/brand-shared';

function generateToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 32; i++) t += chars[Math.floor(Math.random() * chars.length)];
  return t;
}

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/[^0-9]/g, '');
  if (p.startsWith('0')) p = '62' + p.substring(1);
  if (p.startsWith('8')) p = '62' + p;
  return p;
}

// Send via Fonnte API
const PIC_OPS = '📞 PIC Ops (jika ada kendala):\nLuthfi 081290199059\nYuyun 0895348816125';

async function sendFonnteMessage(phone, message) {
  // WA ke Tour Leader → nomor CS (context 'cs'), brand-aware.
  // Pakai util bersama: sudah handle token CS, retry, + catat kegagalan ke wa_outbox (/wa-pending).
  const brand = (() => { try { return currentBrandCode(); } catch { return ''; } })();
  const r = await sendFonnte(phone, message, { context: 'cs', brand });
  if (r?.ok) return { ok: true, sentVia: r.sentVia };
  return { error: r?.error || 'Gagal kirim WA (Fonnte).' };
}

// Generate WA assignment + send via Fonnte
export async function sendTLAssignment(tripId) {
  const supabase = createClient();
  const authClient = createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const role = user.app_metadata?.role || user.user_metadata?.role;
  if (!['owner', 'accounting', 'manager', 'ops'].includes(role)) {
    return { error: 'Hanya Owner/Manager/Ops yang bisa assign TL.' };
  }

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip) return { error: 'Trip tidak ditemukan' };
  if (!trip.tl_id) return { error: 'Trip belum ada TL terpilih. Set TL di Edit Trip dulu.' };

  const { data: tl } = await supabase.from('tour_leaders').select('*').eq('id', trip.tl_id).maybeSingle();
  if (!tl) return { error: 'TL tidak ditemukan di master TL' };
  if (!tl.phone) return { error: `TL ${tl.name} belum ada no HP di master TL. Edit Master TL dulu.` };

  // Generate token + save state pending
  const token = generateToken();
  const { error } = await supabase.from('trips').update({
    tl_assignment_token: token,
    tl_assignment_status: 'pending',
    tl_assignment_sent_at: new Date().toISOString(),
    tl_assignment_decided_at: null,
    tl_assignment_reject_note: null,
  }).eq('id', tripId);

  if (error) return { error: error.message };

  const phone = normalizePhone(tl.phone);
  const tripLabel = trip.kode_trip || `#${trip.id}`;
  const tripName = trip.name || '—';
  const departure = trip.departure || '—';
  const arrival = trip.arrival || '—';

  const baseUrl = siteUrlFor((() => { try { return currentBrandCode(); } catch { return ''; } })()) || process.env.NEXT_PUBLIC_SITE_URL || 'https://teone.dev';
  const confirmUrl = `${baseUrl}/tl-assign/${token}`;

  const message = `Halo ${tl.name}! 👋

Kamu di-assign sebagai *Tour Leader* untuk trip:

📍 *${tripLabel} — ${tripName}*
🛫 ${departure} → ${arrival}
👥 ${trip.sold || 0}/${trip.quota || 0} pax

Mohon konfirmasi ketersediaan (Approve / Reject) di link berikut:
🔗 ${confirmUrl}

Setelah Approve, link login Portal TL dikirim otomatis.

${PIC_OPS}

— Traveling Eropa One System`;

  // Send via Fonnte API
  const result = await sendFonnteMessage(phone, message);

  if (result.error) {
    // JANGAN fallback ke wa.me (itu kirim dari HP pribadi, bukan nomor CS).
    // Surface error saja — token sudah tersimpan, bisa kirim ulang setelah device CS OK.
    return {
      error: result.error + '\n\nPesan TIDAK terkirim dari nomor CS. Pastikan device CS tersambung di Fonnte, lalu klik "Send WA Penugasan" lagi.',
    };
  }

  revalidatePath(`/trips/${tripId}`);
  return { ok: true, tlName: tl.name, phone, sentVia: 'fonnte' };
}

// TL klik link approve (public, no auth)
export async function approveTLAssignment(token) {
  const supabase = createClient();
  const { data: trip } = await supabase
    .from('trips').select('*').eq('tl_assignment_token', token).maybeSingle();
  if (!trip) return { error: 'Token tidak valid atau sudah kadaluarsa.' };
  if (trip.tl_assignment_status === 'approved') return { ok: true, alreadyDecided: true, status: 'approved', trip };
  if (trip.tl_assignment_status === 'rejected') return { error: 'Trip ini sudah pernah kamu reject. Hubungi Ops.' };

  const { error } = await supabase.from('trips').update({
    tl_assignment_status: 'approved',
    tl_assignment_decided_at: new Date().toISOString(),
  }).eq('id', trip.id);
  if (error) return { error: error.message };

  // Kirim WA konfirmasi + link login portal TL (best-effort)
  try {
    const { data: tl } = await supabase.from('tour_leaders').select('name, phone').eq('id', trip.tl_id).maybeSingle();
    if (tl?.phone) {
      const baseUrl = siteUrlFor((() => { try { return currentBrandCode(); } catch { return ''; } })()) || process.env.NEXT_PUBLIC_SITE_URL || 'https://teone.dev';
      const tlLoginUrl = `${baseUrl}/login?tab=tl`;
      const tripLabel = trip.kode_trip || `#${trip.id}`;
      const confirmMsg = `Halo ${tl.name || 'Kak'} 🙏

Terima kasih, penugasan sebagai Tour Leader untuk trip *${tripLabel} — ${trip.name || ''}* sudah kamu *KONFIRMASI* ✅

Silakan login ke web untuk pantau tripmu (peserta, dokumen, manifest, roomlist, expense):
🔗 ${tlLoginUrl}

(Login pakai akun Google yang sudah didaftarkan Ops.)

${PIC_OPS}

— Traveling Eropa One System`;
      await sendFonnteMessage(normalizePhone(tl.phone), confirmMsg);
    }
  } catch (e) { /* best-effort */ }

  revalidatePath(`/trips/${trip.id}`);
  revalidatePath(`/tl/${trip.id}`);
  return { ok: true, status: 'approved', trip };
}

// TL klik link reject (public, no auth)
export async function rejectTLAssignment(token, note) {
  const supabase = createClient();
  const { data: trip } = await supabase
    .from('trips').select('*').eq('tl_assignment_token', token).maybeSingle();
  if (!trip) return { error: 'Token tidak valid atau sudah kadaluarsa.' };
  if (trip.tl_assignment_status === 'rejected') return { ok: true, alreadyDecided: true, status: 'rejected', trip };
  if (trip.tl_assignment_status === 'approved') return { error: 'Trip ini sudah kamu approve.' };

  const { error } = await supabase.from('trips').update({
    tl_assignment_status: 'rejected',
    tl_assignment_decided_at: new Date().toISOString(),
    tl_assignment_reject_note: (note || '').trim() || 'Tidak ada catatan',
  }).eq('id', trip.id);
  if (error) return { error: error.message };

  revalidatePath(`/trips/${trip.id}`);
  revalidatePath(`/trips`);
  return { ok: true, status: 'rejected', trip };
}

// Reset — Ops bisa assign ulang
export async function resetTLAssignment(tripId) {
  const supabase = createClient();
  const authClient = createAuthClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: 'Not authenticated' };
  const role = user.app_metadata?.role || user.user_metadata?.role;
  if (!['owner', 'accounting', 'manager', 'ops'].includes(role)) {
    return { error: 'Hanya Owner/Manager/Ops yang bisa reset.' };
  }

  const { error } = await supabase.from('trips').update({
    tl_assignment_token: null,
    tl_assignment_status: null,
    tl_assignment_sent_at: null,
    tl_assignment_decided_at: null,
    tl_assignment_reject_note: null,
  }).eq('id', tripId);
  if (error) return { error: error.message };

  revalidatePath(`/trips/${tripId}`);
  return { ok: true };
}

// Helper untuk cron H-14 reminder (Round 70)
export async function sendH14Reminder(tripId) {
  const supabase = createClient();
  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).maybeSingle();
  if (!trip || !trip.tl_id) return { skipped: true };

  const { data: tl } = await supabase.from('tour_leaders').select('*').eq('id', trip.tl_id).maybeSingle();
  if (!tl || !tl.phone) return { skipped: true };

  const phone = normalizePhone(tl.phone);
  const tripLabel = trip.kode_trip || `#${trip.id}`;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://teone.dev';

  const message = `📢 H-14 Reminder Trip ${tripLabel}

Halo ${tl.name}, trip ${trip.name} berangkat *${trip.departure}* (14 hari lagi).

Tolong cek pre-departure checklist di Portal TL:
${baseUrl}/tl/${trip.id}

Pastikan:
✓ Manifest peserta
✓ Roomlist
✓ Voucher hotel & tiket
✓ Briefing peserta
✓ Petty cash dari Ops

${PIC_OPS}

Salam,
TEONE System`;

  const result = await sendFonnteMessage(phone, message);
  return result;
}
