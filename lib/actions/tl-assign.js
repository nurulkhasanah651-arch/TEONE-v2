'use server';

// TL Assignment via WhatsApp Fonnte API
// Plus helper untuk H-14 cron reminder (Round 70)

import { revalidatePath } from 'next/cache';
import { createClient as createAuthClient, createPublicClient as createClient } from '@/lib/supabase/server';
import { getFonnteToken } from '@/lib/utils/fonnte';
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
async function sendFonnteMessage(phone, message) {
  // WA ke Tour Leader → nomor Operasional (context 'ops'), brand-aware
  const { token } = getFonnteToken('ops', (() => { try { return currentBrandCode(); } catch { return ''; } })());
  if (!token) {
    return { error: 'Fonnte token operasional belum di-set (FONNTE_TOKEN_OPS / FONNTE_TOKEN_TL / FONNTE_TOKEN).' };
  }

  try {
    const response = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        target: phone,
        message: message,
        countryCode: '62',
      }),
    });

    const data = await response.json();
    if (!response.ok || data.status === false) {
      return { error: 'Fonnte error: ' + (data.reason || data.message || 'unknown') };
    }
    return { ok: true, response: data };
  } catch (e) {
    return { error: 'Network error Fonnte: ' + (e?.message || 'unknown') };
  }
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
  const tlLoginUrl = `${baseUrl}/login?tab=tl`;
  const approveUrl = `${baseUrl}/tl-assign/${token}?action=approve`;
  const rejectUrl = `${baseUrl}/tl-assign/${token}?action=reject`;

  const message = `Halo ${tl.name}!

Kamu di-assign sebagai Tour Leader untuk trip:

📍 *${tripLabel} — ${tripName}*
🛫 Berangkat: ${departure}
🛬 Pulang: ${arrival}
👥 Peserta: ${trip.sold || 0}/${trip.quota || 0}

Mohon konfirmasi penugasan ini:

✅ APPROVE:
${approveUrl}

❌ REJECT:
${rejectUrl}

Setelah APPROVE, login ke web untuk pantau tripmu (peserta, dokumen, manifest, expense):
🔗 ${tlLoginUrl}

Klik salah satu link untuk respon. Terima kasih!
— Traveling Eropa One System`;

  // Send via Fonnte API
  const result = await sendFonnteMessage(phone, message);

  if (result.error) {
    // Mark as sent failure (still save token so manual fallback bisa)
    return {
      error: result.error +
             '\n\nFallback: kirim manual via wa.me link:\n' +
             `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
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

Salam,
TEONE System`;

  const result = await sendFonnteMessage(phone, message);
  return result;
}
