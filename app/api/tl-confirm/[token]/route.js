// app/api/tl-confirm/[token]/route.js
// R198: Public endpoint untuk TL klik dari WA — approve / reject

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
      padding: 48px 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      color: ${color};
      margin-bottom: 12px;
    }
    p {
      color: #4b5563;
      line-height: 1.6;
      margin-bottom: 8px;
    }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    ${body}
    <div class="footer">Khasanah Travel / Traveling Eropa</div>
  </div>
</body>
</html>`;
}

export async function GET(request, { params }) {
  const { token } = params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action'); // 'approve' atau 'reject'

  if (!token) {
    return new NextResponse(
      htmlPage(
        'Token Tidak Valid',
        `<div class="icon">⚠️</div>
         <h1>Link Tidak Valid</h1>
         <p>Token tidak ditemukan. Mohon hubungi admin.</p>`,
        '#EF4444'
      ),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  if (!['approve', 'reject'].includes(action)) {
    return new NextResponse(
      htmlPage(
        'Action Tidak Valid',
        `<div class="icon">⚠️</div>
         <h1>Action Tidak Dikenal</h1>
         <p>Mohon pakai link approve / reject yang dikirim via WhatsApp.</p>`,
        '#EF4444'
      ),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return new NextResponse(
      htmlPage(
        'Server Error',
        `<div class="icon">⚠️</div>
         <h1>Sistem Bermasalah</h1>
         <p>Mohon hubungi admin.</p>`,
        '#EF4444'
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // Cari trip dgn token ini
  const { data: trip, error: findErr } = await supabase
    .from('trips')
    .select('id, name, start_date, end_date, tl_assignment_status, tl_assignment_token')
    .eq('tl_assignment_token', token)
    .maybeSingle();

  if (findErr || !trip) {
    return new NextResponse(
      htmlPage(
        'Link Kadaluarsa',
        `<div class="icon">⏰</div>
         <h1>Link Sudah Kadaluarsa</h1>
         <p>Link ini sudah tidak berlaku atau sudah pernah digunakan.</p>
         <p>Mohon hubungi admin kalau Kakak belum sempat konfirmasi.</p>`,
        '#F59E0B'
      ),
      { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // Kalau sudah pernah respon, jangan biarkan respon lagi
  if (trip.tl_assignment_status !== 'pending') {
    const wasApproved = trip.tl_assignment_status === 'approved';
    return new NextResponse(
      htmlPage(
        'Sudah Pernah Konfirmasi',
        `<div class="icon">${wasApproved ? '✅' : '❌'}</div>
         <h1>Sudah Pernah Konfirmasi</h1>
         <p>Trip "<b>${trip.name || trip.id}</b>" sudah Kakak ${wasApproved ? 'Approve ✅' : 'Reject ❌'}.</p>
         <p>Hubungi admin kalau mau ubah konfirmasi.</p>`,
        wasApproved ? '#10B981' : '#EF4444'
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // Update status
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
      htmlPage(
        'Gagal Update',
        `<div class="icon">⚠️</div>
         <h1>Gagal Simpan Konfirmasi</h1>
         <p>Error: ${updateErr.message}</p>
         <p>Mohon coba lagi atau hubungi admin.</p>`,
        '#EF4444'
      ),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  // Success
  if (newStatus === 'approved') {
    return new NextResponse(
      htmlPage(
        'Approve Berhasil',
        `<div class="icon">✅</div>
         <h1>Approve Berhasil!</h1>
         <p>Terima kasih sudah konfirmasi 🙏</p>
         <p>Kakak akan ter-assign sebagai Tour Leader untuk:</p>
         <p style="margin-top: 12px; font-weight: 600; color: #111;">${trip.name || 'Trip #' + trip.id}</p>
         <p style="margin-top: 16px; font-size: 13px; color: #6b7280;">Detail lengkap akan dikirim via WA terpisah oleh admin.</p>`,
        '#10B981'
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  } else {
    return new NextResponse(
      htmlPage(
        'Reject Berhasil',
        `<div class="icon">❌</div>
         <h1>Trip Di-Reject</h1>
         <p>Konfirmasi diterima.</p>
         <p>Trip "<b>${trip.name || trip.id}</b>" sudah Kakak reject.</p>
         <p style="margin-top: 16px; font-size: 13px; color: #6b7280;">Admin akan mencari TL pengganti. Terima kasih atas konfirmasinya 🙏</p>`,
        '#EF4444'
      ),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
