// TEMPORARY one-time CRM import endpoint (secret-guarded). REMOVE after use.
import { NextResponse } from 'next/server';
import { createClient as createSvc } from '@supabase/supabase-js';
import { brandServiceRoleKey, brandSupabaseUrl } from '@/lib/supabase/service-env';

export const dynamic = 'force-dynamic';
const SECRET = 'te-crm-import-9Qx7bK2wZ';

const normP = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const normPh = (s) => { let d = (s || '').replace(/[^0-9]/g, ''); if (d.startsWith('0')) d = '62' + d.slice(1); return d.length >= 9 ? d : ''; };
const okDate = (s, lo, hi) => { if (!s) return null; const y = +String(s).slice(0, 4); return (y >= lo && y <= hi) ? s : null; };

export async function POST(req) {
  if (req.headers.get('x-import-secret') !== SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const url = brandSupabaseUrl(), key = brandServiceRoleKey();
  if (!url || !key) return NextResponse.json({ error: 'no service key' }, { status: 500 });
  const db = createSvc(url, key, { auth: { persistSession: false } });
  let body; try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const BRAND = 1;

  // fetch existing
  let existing = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('customers').select('id,name,passport_no,passport_number,phone,whatsapp,tags,notes,first_trip_at,last_trip_at,passport_expiry,passport_issued_date,passport_issued_at,place_of_birth,dob,birthday,gender,referral_source').range(from, from + 999);
    if (error) return NextResponse.json({ error: 'fetch: ' + error.message }, { status: 500 });
    existing = existing.concat(data); if (data.length < 1000) break;
  }
  const byPass = new Map(), byPhone = new Map();
  for (const e of existing) { const p = normP(e.passport_no || e.passport_number); if (p && !byPass.has(p)) byPass.set(p, e); const ph = normPh(e.phone || e.whatsapp); if (ph) { if (!byPhone.has(ph)) byPhone.set(ph, []); byPhone.get(ph).push(e); } }

  const toInsert = [], toUpdate = [];
  for (const c of rows) {
    const p = normP(c.pp), ph = normPh(c.p);
    let m = null;
    if (p && byPass.has(p)) m = byPass.get(p);
    else if (!p && ph && byPhone.get(ph)?.length === 1) m = byPhone.get(ph)[0];
    const dob = okDate(c.d, 1900, 2035), exp = okDate(c.pe, 2010, 2045), iss = okDate(c.pi, 2000, 2035);
    const ft = okDate(c.ft, 2019, 2027), lt = okDate(c.lt, 2019, 2027);
    const notes = `Import data lama TEONE 2020-2024 · ${c.tt || 1} trip`;
    if (m) {
      const tags = [...new Set([...(m.tags || []), ...(c.t || [])])];
      const u = { id: m.id, tags };
      if (!(m.notes || '').includes('Import data lama TEONE')) u.notes = (m.notes ? m.notes + '\n\n' : '') + notes;
      if (!m.passport_no && c.pp) { u.passport_no = c.pp; u.passport_number = c.pp; }
      if (!m.passport_expiry && exp) u.passport_expiry = exp;
      if (!m.passport_issued_date && iss) u.passport_issued_date = iss;
      if (!m.passport_issued_at && c.po) u.passport_issued_at = c.po;
      if (!m.place_of_birth && c.pb) u.place_of_birth = c.pb;
      if (!m.dob && dob) { u.dob = dob; if (!m.birthday) u.birthday = dob; }
      if (!m.gender && c.g) u.gender = c.g;
      if (!m.first_trip_at && ft) u.first_trip_at = ft;
      if (!m.last_trip_at && lt) u.last_trip_at = lt;
      if (!m.referral_source && c.rs) u.referral_source = c.rs;
      toUpdate.push(u);
    } else {
      toInsert.push({ brand_id: BRAND, name: c.n, first_name: c.f, surname: c.s || null,
        phone: c.p || null, whatsapp: c.p || null, passport_no: c.pp || null, passport_number: c.pp || null,
        passport_expiry: exp, passport_issued_date: iss, passport_issued_at: c.po || null,
        place_of_birth: c.pb || null, dob, birthday: dob, gender: c.g || null,
        tags: c.t || [], notes, total_trips: c.tt || 1, first_trip_at: ft, last_trip_at: lt,
        referral_source: c.rs || null, status: 'past', created_by: 'import-2020-2024' });
    }
  }
  let ins = 0, upd = 0, errs = [];
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await db.from('customers').insert(toInsert.slice(i, i + 500));
    if (error) { errs.push('ins:' + error.message); } else ins += Math.min(500, toInsert.length - i);
  }
  for (const u of toUpdate) { const { id, ...f } = u; const { error } = await db.from('customers').update(f).eq('id', id); if (error) { if (errs.length < 5) errs.push('upd:' + error.message); } else upd++; }
  return NextResponse.json({ ok: true, received: rows.length, inserted: ins, updated: upd, existing: existing.length, errors: errs });
}
