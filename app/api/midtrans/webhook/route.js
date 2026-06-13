// Webhook notifikasi Midtrans. Brand ditentukan dari host (teone.dev / travelingeropa.com
// vs khasanahtravel.com). /api/* di-skip dari middleware (lihat middleware.js).
import { NextResponse } from 'next/server';
import { resolveBrandCode } from '@/lib/brand-shared';
import { verifyNotificationSignature, mapTransactionStatus } from '@/lib/midtrans';
import { fulfillPaidBooking, recordMilestonePayment } from '@/lib/shop/fulfillment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let n;
  try { n = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const host = request.headers.get('host') || '';
  const code = resolveBrandCode({ host });

  // order_id = "<ORDER_CODE>-<suffix>" → ambil order_code asli
  const rawOrderId = String(n.order_id || '');
  const parts = rawOrderId.split('-');
  const orderCode = parts.slice(0, 2).join('-'); // mis: TE-ABC123
  // bayar lanjutan ditandai segmen ke-3 'M<type>' (mis. TE-ABC123-MP1-xxx)
  const milestoneType = (parts[2] && parts[2][0] === 'M') ? parts[2].slice(1) : null;

  // verifikasi signature pakai server key brand terkait
  const valid = verifyNotificationSignature(code, {
    order_id: n.order_id, status_code: n.status_code, gross_amount: n.gross_amount, signature_key: n.signature_key,
  });
  if (!valid) return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 403 });

  const status = mapTransactionStatus(n);
  if (status === 'paid') {
    try {
      if (milestoneType) await recordMilestonePayment(orderCode, milestoneType);
      else await fulfillPaidBooking(orderCode);
    } catch (e) { /* tetap 200 agar Midtrans tak retry loop; bisa dicek manual */ }
  }
  // Midtrans mengharap 200 OK
  return NextResponse.json({ ok: true, status });
}
