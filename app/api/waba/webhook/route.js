// Webhook Meta WhatsApp Cloud API (Khasanah). FITUR BARU — tidak menyentuh alur lama.
// GET  = verifikasi langganan (hub.challenge).
// POST = terima pesan masuk + update status pesan keluar.
// Brand ditentukan dari host (khasanahtravel.app). Skip di middleware (/api/*).
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { resolveBrandCode } from '@/lib/brand-shared';
import { serviceClientFor } from '@/lib/supabase/service-env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function envFor() {
  return {
    verifyToken: process.env.META_WABA_VERIFY_TOKEN_KHASANAH || '',
    appSecret: process.env.META_WABA_APP_SECRET_KHASANAH || '',
  };
}

// ---- GET: verifikasi webhook ----
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const { verifyToken } = envFor();
  // DEBUG sementara — tidak membocorkan token (cuma panjang & kecocokan).
  console.log('[waba verify] mode=' + mode + ' envSet=' + !!verifyToken + ' envLen=' + (verifyToken ? verifyToken.length : 0) + ' recvLen=' + (token ? String(token).length : 0) + ' match=' + (token === verifyToken));
  if (mode === 'subscribe' && verifyToken && token === verifyToken) {
    return new NextResponse(challenge || '', { status: 200 });
  }
  return new NextResponse('forbidden', { status: 403 });
}

function verifySignature(appSecret, raw, sigHeader) {
  if (!appSecret) return true; // kalau app secret belum di-set, jangan blokir (tetap terima)
  if (!sigHeader) return false;
  try {
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex');
    const a = Buffer.from(sigHeader); const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function textFromMessage(m) {
  if (!m) return '';
  if (m.type === 'text') return m.text?.body || '';
  if (m.type === 'button') return m.button?.text || '';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
  if (['image', 'document', 'video', 'audio', 'sticker'].includes(m.type)) return `[${m.type}]${m[m.type]?.caption ? ' ' + m[m.type].caption : ''}`;
  return `[${m.type || 'pesan'}]`;
}

export async function POST(request) {
  const raw = await request.text();
  const { appSecret } = envFor();
  // Api.co.id (BSP) meneruskan webhook TANPA tanda tangan Meta -> jangan pernah 401,
  // cukup catat validitas utk audit. Kembalikan 200 apa pun kondisinya supaya provider
  // tidak meng-auto-disable webhook karena "delivery failure".
  const sigOk = verifySignature(appSecret, raw, request.headers.get('x-hub-signature-256'));
  // DEBUG sementara: tangkap bentuk payload Api.co.id utk penyesuaian parser.
  console.log('[waba inbound] sigOk=' + sigOk + ' len=' + raw.length + ' body=' + raw.slice(0, 1500));
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ ok: true, parse: false }); }

  const host = request.headers.get('host') || '';
  const brand = resolveBrandCode({ host });
  // Fitur ini KHUSUS Khasanah. Host lain diabaikan (200 supaya Meta tidak retry).
  if (brand !== 'khasanah') return NextResponse.json({ ok: true, skipped: true });
  const db = serviceClientFor('khasanah');
  if (!db) return NextResponse.json({ ok: true, nodb: true });

  try {
    for (const entry of (payload.entry || [])) {
      for (const ch of (entry.changes || [])) {
        const val = ch.value || {};
        const phoneNumberId = val.metadata?.phone_number_id || null;
        if (!phoneNumberId) continue;

        // cari nomor terdaftar
        const { data: numRow } = await db.from('wa_numbers').select('id').eq('phone_number_id', phoneNumberId).maybeSingle();

        // Kontak (nama profil)
        const contactName = val.contacts?.[0]?.profile?.name || null;

        // ---- Pesan MASUK ----
        for (const m of (val.messages || [])) {
          const fromPhone = String(m.from || '').replace(/[^0-9]/g, '');
          if (!fromPhone) continue;
          const body = textFromMessage(m);
          const now = new Date().toISOString();

          // upsert conversation
          let { data: conv } = await db.from('wa_conversations')
            .select('id, unread_count').eq('phone_number_id', phoneNumberId).eq('customer_phone', fromPhone).maybeSingle();
          if (!conv) {
            const ins = await db.from('wa_conversations').insert({
              brand: 'khasanah', number_id: numRow?.id || null, phone_number_id: phoneNumberId,
              customer_phone: fromPhone, customer_name: contactName, status: 'open',
              last_message_at: now, last_customer_msg_at: now, last_message_preview: body.slice(0, 120), unread_count: 1,
            }).select('id').maybeSingle();
            conv = ins.data;
          } else {
            await db.from('wa_conversations').update({
              customer_name: contactName || undefined, last_message_at: now, last_customer_msg_at: now,
              last_message_preview: body.slice(0, 120), unread_count: (Number(conv.unread_count) || 0) + 1, status: 'open',
            }).eq('id', conv.id);
          }
          if (conv?.id) {
            await db.from('wa_messages').insert({
              brand: 'khasanah', conversation_id: conv.id, direction: 'in', type: m.type || 'text',
              body, wa_message_id: m.id || null, status: 'received', created_at: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString(),
            });
          }
        }

        // ---- Update STATUS pesan keluar ----
        for (const st of (val.statuses || [])) {
          if (!st.id) continue;
          try { await db.from('wa_messages').update({ status: st.status || null }).eq('wa_message_id', st.id); } catch {}
        }
      }
    }
  } catch (e) {
    console.error('[waba webhook]', e?.message);
  }
  // Selalu 200 supaya Meta tidak retry berlebihan.
  return NextResponse.json({ ok: true });
}
