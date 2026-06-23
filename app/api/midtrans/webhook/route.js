// Webhook notifikasi Midtrans. Brand DITENTUKAN dari order_id (BUKAN host) — karena
// Midtrans hanya mengirim ke 1 URL/host, sedangkan order khasanah ber-prefix KH- dan
// teone TE-. Ini mencegah order khasanah diproses di DB teone (gagal update + tak ada WA).
// /api/* di-skip dari middleware (lihat middleware.js).
import { NextResponse } from 'next/server';
import { resolveBrandCode } from '@/lib/brand-shared';
import { runWithBrand } from '@/lib/supabase/service-env';
import { verifyNotificationSignature, mapTransactionStatus, midtransMethodLabel } from '@/lib/midtrans';
import { fulfillPaidBooking, recordMilestonePayment, recordInvoiceMilestone, applyInvoiceOnlinePaid } from '@/lib/shop/fulfillment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  let n;
  try { n = await request.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const host = request.headers.get('host') || '';
  const rawOrderId = String(n.order_id || '');
  const parts = rawOrderId.split('-');

  // === Tentukan brand dari order_id ===
  let code;
  let invIdx = 1; // index id invoice (format lama: INVID-<id>-...)
  if (parts[0] === 'INVID' || parts[0] === 'INVP') {
    if (parts[1] === 'KH' || parts[1] === 'TE') {
      code = parts[1] === 'KH' ? 'khasanah' : 'teone'; // format baru: INVID-KH-<id>-...
      invIdx = 2;
    } else {
      code = resolveBrandCode({ host }); // backward-compat order lama
    }
  } else if (parts[0] === 'KH') {
    code = 'khasanah';
  } else if (parts[0] === 'TE') {
    code = 'teone';
  } else {
    code = resolveBrandCode({ host });
  }

  // order_id = "<ORDER_CODE>-<suffix>" → ambil order_code asli (mis: KH-ABC123)
  const orderCode = parts.slice(0, 2).join('-');
  // bayar lanjutan ditandai segmen ke-3 'M<type>' (mis. KH-ABC123-MP1-xxx)
  const milestoneType = (parts[2] && parts[2][0] === 'M') ? parts[2].slice(1) : null;

  // verifikasi signature pakai server key brand terkait
  const valid = verifyNotificationSignature(code, {
    order_id: n.order_id, status_code: n.status_code, gross_amount: n.gross_amount, signature_key: n.signature_key,
  });
  if (!valid) return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 403 });

  const status = mapTransactionStatus(n);
  const method = midtransMethodLabel(n.payment_type);
  if (status === 'paid') {
    try {
      // Jalankan fulfillment DALAM konteks brand → DB, WA Fonnte, & link sesuai brand.
      await runWithBrand(code, async () => {
        if (parts[0] === 'INVID') {
          await applyInvoiceOnlinePaid(parseInt(parts[invIdx]) || 0, n.gross_amount, method);
        } else if (parts[0] === 'INVP') {
          await recordInvoiceMilestone(parseInt(parts[invIdx]) || 0, parts[invIdx + 1], n.gross_amount, method);
        } else if (milestoneType) {
          await recordMilestonePayment(orderCode, milestoneType, method);
        } else {
          await fulfillPaidBooking(orderCode, method);
        }
      });
    } catch (e) { /* tetap 200 agar Midtrans tak retry loop */ }
  }
  // Midtrans mengharap 200 OK
  return NextResponse.json({ ok: true, status });
}
