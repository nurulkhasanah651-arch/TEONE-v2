// Export jawaban Form Tambahan Visa per peserta -> Excel (.xlsx) / Word (.doc HTML).
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { brandSupabaseUrl, brandServiceRoleKey } from '@/lib/supabase/service-env';
import { assertStaff } from '@/lib/auth/require-staff';
import { getVisaForm, visaFormLabel } from '@/lib/utils/visa-form-defs';

function svc() {
  const u = brandSupabaseUrl(), k = brandServiceRoleKey();
  if (!u || !k) return null;
  return createServiceClient(u, k, { auth: { persistSession: false, autoRefreshToken: false } });
}
function safe(s) { return String(s || '').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 50); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

export async function GET(req) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const g = await assertStaff(user, '/visa');
  if (g.error) return NextResponse.json({ error: g.error }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const passengerId = searchParams.get('passenger');
  const formType = searchParams.get('type') || 'france';
  const fmt = (searchParams.get('fmt') || 'xlsx').toLowerCase();
  const form = getVisaForm(formType);
  if (!passengerId || !form) return NextResponse.json({ error: 'Parameter tidak valid' }, { status: 400 });

  const db = svc();
  if (!db) return NextResponse.json({ error: 'Service tidak tersedia' }, { status: 500 });

  const { data: resp } = await db.from('visa_form_responses')
    .select('data, status, submitted_at').eq('passenger_id', passengerId).eq('form_type', formType).maybeSingle();
  if (!resp) return NextResponse.json({ error: 'Belum ada jawaban form untuk peserta ini' }, { status: 404 });

  let paxName = `Peserta-${passengerId}`;
  try {
    const { data: pax } = await db.from('trip_passengers').select('customer_id').eq('id', passengerId).maybeSingle();
    if (pax?.customer_id) { const { data: c } = await db.from('customers').select('name').eq('id', pax.customer_id).maybeSingle(); if (c?.name) paxName = c.name; }
  } catch {}

  const data = resp.data || {};
  const label = visaFormLabel(formType);
  const fileBase = `Form-${safe(formType)}-${safe(paxName)}`;

  if (fmt === 'xlsx') {
    const rows = [[`FORMULIR APLIKASI VISA ${label.toUpperCase()}`], [`Peserta: ${paxName}`], [`Status: ${resp.status}`], []];
    for (const sec of form.sections) {
      rows.push([sec.title.toUpperCase()]);
      for (const f of sec.fields) rows.push([f.label, data[f.key] || '']);
      rows.push([]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 48 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Form');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return new NextResponse(buf, { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileBase}.xlsx"`,
    }});
  }

  // Word (HTML .doc)
  let body = `<h2 style="font-family:Arial">FORMULIR APLIKASI VISA ${esc(label).toUpperCase()}</h2>`;
  body += `<p style="font-family:Arial"><b>Peserta:</b> ${esc(paxName)} &nbsp; | &nbsp; <b>Status:</b> ${esc(resp.status)}</p>`;
  for (const sec of form.sections) {
    body += `<h3 style="font-family:Arial;color:#1e40af">${esc(sec.title)}</h3>`;
    body += `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;font-family:Arial;font-size:12px;width:100%">`;
    for (const f of sec.fields) {
      body += `<tr><td style="width:45%;background:#f1f5f9"><b>${esc(f.label)}</b></td><td>${esc(data[f.key] || '')}</td></tr>`;
    }
    body += `</table><br/>`;
  }
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>${body}</body></html>`;
  return new NextResponse(html, { headers: {
    'Content-Type': 'application/msword',
    'Content-Disposition': `attachment; filename="${fileBase}.doc"`,
  }});
}
