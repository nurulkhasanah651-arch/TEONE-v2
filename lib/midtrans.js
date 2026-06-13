// Midtrans Snap (redirect) — per-brand keys. Tanpa expose client key (pakai redirect_url).
// Env per brand:
//   teone:    MIDTRANS_SERVER_KEY,          MIDTRANS_IS_PRODUCTION
//   khasanah: MIDTRANS_SERVER_KEY_KHASANAH, MIDTRANS_IS_PRODUCTION_KHASANAH
import crypto from 'crypto';

export function midtransServerKey(code) {
  if (code === 'khasanah') return process.env.MIDTRANS_SERVER_KEY_KHASANAH || '';
  return process.env.MIDTRANS_SERVER_KEY || '';
}
export function midtransIsProduction(code) {
  const v = code === 'khasanah' ? process.env.MIDTRANS_IS_PRODUCTION_KHASANAH : process.env.MIDTRANS_IS_PRODUCTION;
  return String(v || '').toLowerCase() === 'true';
}
export function midtransConfigured(code) { return !!midtransServerKey(code); }

function snapBase(code) {
  return midtransIsProduction(code)
    ? 'https://app.midtrans.com/snap/v1/transactions'
    : 'https://app.sandbox.midtrans.com/snap/v1/transactions';
}

// Buat transaksi Snap → { token, redirect_url } | { error }
export async function createSnapTransaction(code, { orderId, grossAmount, customer = {}, itemName = 'Trip', finishUrl } = {}) {
  const key = midtransServerKey(code);
  if (!key) return { error: 'Midtrans belum dikonfigurasi' };
  const gross = Math.round(Number(grossAmount) || 0);
  if (gross <= 0) return { error: 'Nominal tidak valid' };

  const body = {
    transaction_details: { order_id: orderId, gross_amount: gross },
    item_details: [{ id: 'trip', price: gross, quantity: 1, name: String(itemName).slice(0, 50) }],
    customer_details: {
      first_name: customer.name || 'Peserta',
      email: customer.email || undefined,
      phone: customer.phone || undefined,
    },
    credit_card: { secure: true },
    callbacks: finishUrl ? { finish: finishUrl } : undefined,
  };

  try {
    const res = await fetch(snapBase(code), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Basic ' + Buffer.from(key + ':').toString('base64'),
      },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { error: (j?.error_messages && j.error_messages.join(', ')) || 'Gagal membuat transaksi' };
    return { token: j.token, redirect_url: j.redirect_url };
  } catch (e) {
    return { error: 'Koneksi Midtrans gagal: ' + (e?.message || '') };
  }
}

// Verifikasi signature notifikasi: sha512(order_id + status_code + gross_amount + serverKey)
export function verifyNotificationSignature(code, { order_id, status_code, gross_amount, signature_key }) {
  const key = midtransServerKey(code);
  if (!key || !signature_key) return false;
  const expected = crypto.createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${key}`)
    .digest('hex');
  return expected === signature_key;
}

// Status transaksi → 'paid' | 'pending' | 'failed'
export function mapTransactionStatus(n = {}) {
  const t = n.transaction_status;
  const fraud = n.fraud_status;
  if (t === 'capture') return fraud === 'challenge' ? 'pending' : 'paid';
  if (t === 'settlement') return 'paid';
  if (t === 'pending') return 'pending';
  if (['deny', 'cancel', 'expire', 'failure'].includes(t)) return 'failed';
  return 'pending';
}
