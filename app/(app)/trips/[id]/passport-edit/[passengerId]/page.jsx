// Round 141 HOTFIX: Passport edit page — pakai 2 query terpisah
// Path: app/(app)/trips/[id]/passport-edit/[passengerId]/page.jsx

import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import EditPassportClient from './EditPassportClient';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const dynamic = 'force-dynamic';

export default async function EditPassportPage({ params }) {
  const { id: tripId, passengerId } = await params;

  const supabase = getServiceClient() || createClient();

  // QUERY 1: ambil trip_passenger (tanpa nested customers)
  const { data: pax } = await supabase
    .from('trip_passengers')
    .select('*')
    .eq('id', passengerId)
    .maybeSingle();

  if (!pax) {
    redirect(`/trips/${tripId}`);
  }

  // QUERY 2: ambil customer separately
  let c = {};
  if (pax.customer_id) {
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', pax.customer_id)
      .maybeSingle();
    c = customer || {};
  }

  const initialData = {
    first_name: c.first_name || '',
    last_name: c.surname || '',
    city: c.city || '',
    birthday: c.birthday || '',
    gender: c.gender || '',
    phone: c.phone || c.whatsapp || '',
    email: c.email || '',
    passport_no: c.passport_no || '',
    passport_issued_at: c.passport_issued_at || '',
    passport_issued_date: c.passport_issued_date || '',
    passport_expiry: c.passport_expiry || '',
    passport_photo_url: c.passport_photo_url || '',
    nationality: c.nationality || '',
    room_type: pax.room_type || '',
    price_paid: pax.price_paid || '',
  };

  const fullName = `${initialData.first_name} ${initialData.last_name}`.trim() || c.name || `Peserta #${passengerId}`;

  return (
    <EditPassportClient
      tripId={tripId}
      passengerId={passengerId}
      customerId={pax.customer_id}
      initial={initialData}
      paxFullName={fullName}
    />
  );
}
