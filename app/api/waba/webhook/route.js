// Webhook Meta WhatsApp Cloud API (Khasanah). FITUR BARU — tidak menyentuh alur lama.
// GET  = verifikasi langganan (hub.challenge).
// POST = terima pesan masuk + update status pesan keluar.
// Brand ditentukan dari host (khasanahtravel.app). Skip di middleware (/api/*).
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { resolveBrandCode } from '@/lib/brand-shared';
import { serviceClientFor } from '@/lib/supabase/service-env';
import { getApicoidCustomerName, apicoidKeyForBrand } from '@/lib/utils/waba-apicoid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WABA_BRANDS = ['khasanah', 'teone'];

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

// Cari brand pemilik sebuah phone_number_id. Cek wa_numbers dulu, lalu employees.waba_phone_id.
// Khasanah diperiksa lebih dulu supaya perilaku lama tak berubah. Kalau tak ketemu di mana pun,
// fallback ke brand host (kalau brand WABA), else null (di-skip).
async function resolveBrandForPhoneId(phoneNumberId, hostBrand) {
  if (phoneNumberId) {
    const pnid = String(phoneNumberId);
    for (const b of WABA_BRANDS) {
      const db = serviceClientFor(b);
      if (!db) continue;
      try {
        const { data: n } = await db.from('wa_numbers').select('id').eq('phone_number_id', pnid).maybeSingle();
        if (n) return { brand: b, db };
      } catch {}
      try {
        const { data: e } = await db.from('employees').select('id').eq('waba_phone_id', pnid).maybeSingle();
        if (e) return { brand: b, db };
      } catch {}
    }
  }
  if (WABA_BRANDS.includes(hostBrand)) {
    const db = serviceClientFor(hostBrand);
    if (db) return { brand: hostBrand, db };
  }
  return null;
}

function extractPhoneNumberId(payload) {
  if (!payload) return null;
  if (payload.event_type || payload.data) return payload.data?.phone_number_id || null;
  for (const entry of (payload.entry || [])) {
    for (const ch of (entry.changes || [])) {
      const pnid = ch.value?.metadata?.phone_number_id;
      if (pnid) return pnid;
    }
  }
  return null;
}

function textFromMessage(m) {
  if (!m) return '';
  if (m.type === 'text') return m.text?.body || '';
  if (m.type === 'button') return m.button?.text || '';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
  if (['image', 'document', 'video', 'audio', 'sticker'].includes(m.type)) return `[${m.type}]${m[m.type]?.caption ? ' ' + m[m.type].caption : ''}`;
  return `[${m.type || 'pesan'}]`;
}

function textFromApicoidRaw(raw) {
  if (!raw) return '';
  if (raw.type === 'text') return raw.text?.body || '';
  if (raw.type === 'button') return raw.button?.text || '';
  if (raw.type === 'interactive') return raw.interactive?.button_reply?.title || raw.interactive?.list_reply?.title || '';
  if (['image', 'document', 'video', 'audio', 'sticker'].includes(raw.type)) return `[${raw.type}]${raw[raw.type]?.caption ? ' ' + raw[raw.type].caption : ''}`;
  return '';
}

// Format Api.co.id (BSP): { event_type, event_id, timestamp, data:{...} }
async function handleApicoid(db, payload, brand) {
  const ev = String(payload.event_type || '');
  const d = payload.data || {};
  if (ev === 'test') return;
  const phoneNumberId = d.phone_number_id || null;
  const dir = String(d.direction || '').toLowerCase();
  const wamid = d.message_id || d.raw?.id || null;

  // Event pesan KELUAR. Dua kemungkinan:
  //  (a) status pesan yang KITA kirim (wamid sudah ada di DB) -> update status saja.
  //  (b) ECHO pesan yang PIC balas dari HP (coexistence) -> wamid belum ada + ada isi
  //      -> simpan sebagai pesan keluar supaya muncul di inbox & terhitung "dibalas".
  if (dir === 'outbound' || /sent|delivered|read|failed|status/.test(ev)) {
    const status = ev.includes('.') ? ev.split('.').pop() : (d.status || null);
    if (wamid) {
      const { data: existing } = await db.from('wa_messages').select('id').eq('wa_message_id', wamid).maybeSingle();
      if (existing) { if (status) { try { await db.from('wa_messages').update({ status }).eq('id', existing.id); } catch {} } return; }
    }
    // Echo dari HP: butuh isi pesan atau media + nomor bisnis.
    const echoBody = d.content || textFromApicoidRaw(d.raw) || '';
    const echoMedia = d.media_url || null;
    if (!phoneNumberId || (!echoBody && !echoMedia)) return;
    const toPhone = String(d.customer_phone || '').replace(/[^0-9]/g, '');
    if (!toPhone) return;
    const nowE = new Date().toISOString();
    const prevE = echoBody || `[${d.message_type || 'media'}]`;
    const { data: numRowE } = await db.from('wa_numbers').select('id').eq('phone_number_id', phoneNumberId).maybeSingle();
    let { data: convE } = await db.from('wa_conversations').select('id, first_reply_at').eq('phone_number_id', phoneNumberId).eq('customer_phone', toPhone).maybeSingle();
    if (!convE) {
      const insE = await db.from('wa_conversations').insert({
        brand, number_id: numRowE?.id || null, phone_number_id: phoneNumberId, customer_phone: toPhone,
        status: 'open', last_message_at: nowE, last_message_preview: prevE.slice(0, 120), first_reply_at: nowE,
      }).select('id').maybeSingle();
      convE = insE.data;
    } else {
      await db.from('wa_conversations').update({
        last_message_at: nowE, last_message_preview: prevE.slice(0, 120), ...(convE.first_reply_at ? {} : { first_reply_at: nowE }),
      }).eq('id', convE.id);
    }
    if (convE?.id) {
      const tsE = Number(d.raw?.timestamp);
      await db.from('wa_messages').insert({
        brand, conversation_id: convE.id, direction: 'out', type: d.message_type || 'text',
        body: echoBody || null, media_url: echoMedia, wa_message_id: wamid || null, status: status || 'sent',
        created_at: tsE ? new Date(tsE * 1000).toISOString() : nowE,
      });
    }
    return;
  }

  // Pesan MASUK
  if (!phoneNumberId) return;
  const fromPhone = String(d.customer_phone || d.raw?.from || '').replace(/[^0-9]/g, '');
  if (!fromPhone) return;
  const mediaUrl = d.media_url || null;
  const body = mediaUrl ? (d.content || '') : (d.content || textFromApicoidRaw(d.raw) || `[${d.message_type || 'pesan'}]`);
  const preview = body || `[${d.message_type || 'media'}]`;
  const now = new Date().toISOString();
  const tsSec = Number(d.raw?.timestamp);
  const createdAt = tsSec ? new Date(tsSec * 1000).toISOString() : now;

  // Sumber lead: iklan Click-to-WA kirim objek referral -> tandai 'ads'.
  const ref = d.referral || d.raw?.referral || null;
  const leadSource = ref ? 'ads' : 'regular';
  const adHeadline = ref ? (ref.headline || ref.body || ref.source_id || ref.source_url || 'Iklan WA') : null;

  const { data: numRow } = await db.from('wa_numbers').select('id').eq('phone_number_id', phoneNumberId).maybeSingle();

  let { data: conv } = await db.from('wa_conversations')
    .select('id, unread_count, customer_name').eq('phone_number_id', phoneNumberId).eq('customer_phone', fromPhone).maybeSingle();

  // Nama: pakai yang sudah tersimpan; kalau kosong cari di CRM; kalau tetap kosong ambil
  // push name WA dari Api.co.id (GET /customers/:id). Cuma di-fetch saat belum ada nama.
  let custName = conv?.customer_name || null;
  if (!custName) {
    try {
      const forms = fromPhone.startsWith('62') ? [fromPhone, '0' + fromPhone.slice(2)] : [fromPhone];
      let cr = await db.from('customers').select('name').in('phone', forms).limit(1).maybeSingle();
      if (!cr.data) cr = await db.from('customers').select('name').in('whatsapp', forms).limit(1).maybeSingle();
      custName = cr.data?.name || null;
    } catch {}
  }
  if (!custName) {
    try { custName = await getApicoidCustomerName(d.customer_id || fromPhone, apicoidKeyForBrand(brand)); } catch {}
  }
  if (!conv) {
    const ins = await db.from('wa_conversations').insert({
      brand, number_id: numRow?.id || null, phone_number_id: phoneNumberId,
      customer_phone: fromPhone, customer_name: custName, status: 'open',
      lead_source: leadSource, ad_headline: adHeadline, first_msg_at: now,
      last_message_at: now, last_customer_msg_at: now, last_message_preview: preview.slice(0, 120), unread_count: 1,
    }).select('id').maybeSingle();
    conv = ins.data;
  } else {
    await db.from('wa_conversations').update({
      customer_name: custName || undefined, last_message_at: now, last_customer_msg_at: now, last_message_preview: preview.slice(0, 120),
      ...(ref ? { lead_source: 'ads', ad_headline: adHeadline } : {}),
      unread_count: (Number(conv.unread_count) || 0) + 1, status: 'open',
    }).eq('id', conv.id);
  }
  if (conv?.id) {
    await db.from('wa_messages').insert({
      brand, conversation_id: conv.id, direction: 'in', type: d.message_type || 'text',
      body, media_url: mediaUrl, wa_message_id: wamid, status: 'received', created_at: createdAt,
    });
  }
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
  const hostBrand = resolveBrandCode({ host });
  const pnid = extractPhoneNumberId(payload);
  const resolved = await resolveBrandForPhoneId(pnid, hostBrand);
  // Bukan brand WABA & nomor tak dikenal -> abaikan (200 supaya provider tak retry).
  if (!resolved) return NextResponse.json({ ok: true, skipped: true });
  const { brand, db } = resolved;
  if (!db) return NextResponse.json({ ok: true, nodb: true });

  try {
    // Api.co.id (provider utama) kirim format sendiri; Meta format sbg fallback.
    if (payload && (payload.event_type || payload.data)) {
      await handleApicoid(db, payload, brand);
    } else {
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
              brand, number_id: numRow?.id || null, phone_number_id: phoneNumberId,
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
              brand, conversation_id: conv.id, direction: 'in', type: m.type || 'text',
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
    }
  } catch (e) {
    console.error('[waba webhook]', e?.message);
  }
  // Selalu 200 supaya Meta tidak retry berlebihan.
  return NextResponse.json({ ok: true });
}
