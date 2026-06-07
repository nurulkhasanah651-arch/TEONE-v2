// app/api/tl-confirm/[token]/route.js
// R198 v3: 2-step flow — GET tampil halaman konfirmasi, POST eksekusi
// Hindari WA/bot preview yg auto-trigger approve/reject

import { createClient } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';
import { NextResponse } from 'next/server';

function getServiceClient() {
  const url = brandSupabaseUrl();
  const key = brandServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function htmlPage(title, body, color = '#10B981') {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.1);
      padding: 40px 28px;
      max-width: 440px;
      width: 100%;
      text-align: center;
    }
    .icon { font-size: 64px; margin-bottom: 16px; }
    h1 { font-size: 22px; color: ${color}; margin-bottom: 12px; line-height: 1.3; }
    p { color: #4b5563; line-height: 1.6; margin-bottom: 8px; font-size: 15px; }
    .trip-info {
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
      text-align: left;
    }
    .trip-info b { color: #111; }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 20px;
    }
    button {
      width: 100%;
      padding: 14px 20px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.1s;
    }
    button:active { transform: scale(0.98); }
    .btn-approve {
      background: #10B981;
      color: white;
    }
    .btn-approve:hover { background: #059669; }
    .btn-reject {
      background: #EF4444;
      color: white;
    }
    .btn-reject:hover { background: #DC2626; }
    .btn-cancel {
      background: #f3f4f6;
      color: #4b5563;
    }
    .btn-cancel:hover { background: #e5e7eb; }
    .footer {
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: 13px;
    }
    .debug {
      margin-top: 16px;
      padding: 8px;
      background: #f9fafb;
      border-radius: 6px;
      font-size: 11px;
      color: #6b7280;
      font-family: monospace;
      word-break: break-all;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="card">
    ${body}
    <div class="footer">TEONE — Traveling Eropa</div>
  </div>
</body>
</html>`;
}

function formatDate(date) {
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return null;
  }
}

// ========================================
// GET — Tampil halaman konfirmasi (BUKAN auto-execute)
// ========================================
export async function GET(request, context) {
  const params = await context.params;
  const token = params?.token;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (!token) {
    return new NextResponse(
      htmlPage('Link Tidak Valid',
        `<div class="icon">⚠️</div>
         <h1>Link Tidak Valid</h1>
         <p>Token tidak ditemukan.</p>`,
        '#EF4444'
      ),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new NextResponse(
      htmlPage('Server Error',
        `<div class="icon">⚠️</div>
         <h1>Sistem Bermasalah</h1>
         <p>Hubungi admin.</p>`,
        '#EF4444'
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const { data: trip } = await supabase
    .from('trips')
    .select('id, name, kode_trip, destination, departure, arrival, quota, tl_assignment_status')
    .eq('tl_assignment_token', token)
    .maybeSingle();

  if (!trip) {
    return new NextResponse(
      htmlPage('Link Kadaluarsa',
        `<div class="icon">⏰</div>
         <h1>Link Sudah Kadaluarsa</h1>
         <p>Link ini sudah tidak berlaku. Mungkin admin sudah kirim ulang dengan link baru.</p>
         <p>Cek WA terakhir atau hubungi admin.</p>`,
        '#F59E0B'
      ),
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  if (trip.tl_assignment_status !== 'pending') {
    const wasApproved = trip.tl_assignment_status === 'approved';
    const displayName = trip.name || trip.kode_trip || `Trip #${trip.id}`;
    return new NextResponse(
      htmlPage('Sudah Pernah Konfirmasi',
        `<div class="icon">${wasApproved ? '✅' : '❌'}</div>
         <h1>Sudah Pernah Konfirmasi</h1>
         <p>Trip "<b>${displayName}</b>" sudah ${wasApproved ? 'Approve ✅' : 'Reject ❌'}.</p>
         <p>Hubungi admin kalau mau ubah konfirmasi.</p>`,
        wasApproved ? '#10B981' : '#EF4444'
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // Status masih pending → tampil halaman konfirmasi dgn 2 tombol
  const displayName = trip.name || trip.kode_trip || `Trip #${trip.id}`;
  const tripStart = formatDate(trip.departure);
  const tripEnd = formatDate(trip.arrival);
  const pax = trip.quota || '-';

  const initialAction = action === 'reject' ? 'reject' : 'approve';
  const isApprove = initialAction === 'approve';

  return new NextResponse(
    htmlPage('Konfirmasi Tour Leader',
      `<div class="icon">${isApprove ? '✅' : '❌'}</div>
       <h1>Konfirmasi ${isApprove ? 'APPROVE' : 'REJECT'}</h1>
       <p>Pastikan Kakak ingin <b>${isApprove ? 'menerima' : 'menolak'}</b> assignment trip berikut:</p>

       <div class="trip-info">
         <p style="margin: 0;">🌍 <b>${displayName}</b></p>
         ${trip.destination ? `<p style="margin: 4px 0 0 0;">📍 ${trip.destination}</p>` : ''}
         ${tripStart ? `<p style="margin: 4px 0 0 0;">📅 ${tripStart}${tripEnd ? ` → ${tripEnd}` : ''}</p>` : ''}
         ${pax !== '-' ? `<p style="margin: 4px 0 0 0;">👥 ${pax} pax</p>` : ''}
       </div>

       <div class="actions">
         ${isApprove ? `
           <form method="POST" action="/api/tl-confirm/${token}" style="margin:0;">
             <input type="hidden" name="action" value="approve">
             <button type="submit" class="btn-approve">✅ Ya, APPROVE Trip Ini</button>
           </form>
           <form method="GET" action="/api/tl-confirm/${token}" style="margin:0;">
             <input type="hidden" name="action" value="reject">
             <button type="submit" class="btn-cancel">Ganti ke Reject</button>
           </form>
         ` : `
           <form method="POST" action="/api/tl-confirm/${token}" style="margin:0;">
             <input type="hidden" name="action" value="reject">
             <button type="submit" class="btn-reject">❌ Ya, REJECT Trip Ini</button>
           </form>
           <form method="GET" action="/api/tl-confirm/${token}" style="margin:0;">
             <input type="hidden" name="action" value="approve">
             <button type="submit" class="btn-cancel">Ganti ke Approve</button>
           </form>
         `}
       </div>`,
      isApprove ? '#10B981' : '#EF4444'
    ),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

// ========================================
// POST — Eksekusi update (cuma user beneran yg POST)
// ========================================
export async function POST(request, context) {
  const params = await context.params;
  const token = params?.token;

  const formData = await request.formData();
  const action = formData.get('action');

  if (!token || !['approve', 'reject'].includes(action)) {
    return new NextResponse(
      htmlPage('Invalid',
        `<div class="icon">⚠️</div>
         <h1>Action Tidak Valid</h1>
         <p>Hubungi admin.</p>`,
        '#EF4444'
      ),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new NextResponse(
      htmlPage('Server Error',
        `<div class="icon">⚠️</div>
         <h1>Sistem Bermasalah</h1>`,
        '#EF4444'
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const { data: trip } = await supabase
    .from('trips')
    .select('id, name, kode_trip, tl_assignment_status')
    .eq('tl_assignment_token', token)
    .maybeSingle();

  if (!trip) {
    return new NextResponse(
      htmlPage('Link Kadaluarsa',
        `<div class="icon">⏰</div>
         <h1>Link Sudah Kadaluarsa</h1>
         <p>Hubungi admin.</p>`,
        '#F59E0B'
      ),
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  if (trip.tl_assignment_status !== 'pending') {
    const wasApproved = trip.tl_assignment_status === 'approved';
    const displayName = trip.name || trip.kode_trip || `Trip #${trip.id}`;
    return new NextResponse(
      htmlPage('Sudah Pernah Konfirmasi',
        `<div class="icon">${wasApproved ? '✅' : '❌'}</div>
         <h1>Sudah Pernah Konfirmasi</h1>
         <p>Trip "<b>${displayName}</b>" sudah ${wasApproved ? 'Approve' : 'Reject'}.</p>`,
        wasApproved ? '#10B981' : '#EF4444'
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  const { error: updateErr } = await supabase
    .from('trips')
    .update({
      tl_assignment_status: newStatus,
      tl_assignment_responded_at: new Date().toISOString(),
    })
    .eq('id', trip.id);

  if (updateErr) {
    return new NextResponse(
      htmlPage('Gagal Update',
        `<div class="icon">⚠️</div>
         <h1>Gagal Simpan Konfirmasi</h1>
         <p>Error: ${updateErr.message}</p>`,
        '#EF4444'
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const displayName = trip.name || trip.kode_trip || `Trip #${trip.id}`;

  if (newStatus === 'approved') {
    return new NextResponse(
      htmlPage('Approve Berhasil',
        `<div class="icon">✅</div>
         <h1>Approve Berhasil!</h1>
         <p>Terima kasih sudah konfirmasi 🙏</p>
         <p>Kakak ter-assign sebagai Tour Leader untuk:</p>
         <p style="margin-top: 12px; font-weight: 600; color: #111;">${displayName}</p>
         <p style="margin-top: 16px; font-size: 13px; color: #6b7280;">Detail trip lengkap akan dikirim admin via WA terpisah.</p>`,
        '#10B981'
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } else {
    return new NextResponse(
      htmlPage('Reject Berhasil',
        `<div class="icon">❌</div>
         <h1>Trip Di-Reject</h1>
         <p>Konfirmasi diterima.</p>
         <p>Trip "<b>${displayName}</b>" sudah Kakak reject.</p>
         <p style="margin-top: 16px; font-size: 13px; color: #6b7280;">Admin akan mencari TL pengganti. Terima kasih 🙏</p>`,
        '#EF4444'
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
