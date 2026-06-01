// Round 177v4: TL Payment detail (HR view) — + sync to accounting binding
// Path: app/(app)/hr/tl-payments/[id]/page.jsx

import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import TLPaymentDetail from '@/components/hr/TLPaymentDetail';
import {
  approveTLPayment,
  rejectTLPayment,
  resetTLPaymentToRequested,
  markTLPaymentPaid,
  unmarkTLPaymentPaid,
  markFinalReportSubmitted,
  unmarkFinalReportSubmitted,
  deleteTLPayment,
  uploadTLPaymentProof,
  deleteTLPaymentProof,
  getTLPaymentProofSignedUrl,
  sendTLPaymentSlipToWA,
  syncTLPaymentToAccounting,
} from '@/lib/actions/tl-payments';

export const dynamic = 'force-dynamic';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function TLPaymentDetailPage(props) {
  const params = await Promise.resolve(props.params);
  const id = params?.id;

  const supabase = getServiceClient() || createClient();
  const { data: payment, error } = await supabase
    .from('tl_payments')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !payment) {
    return (
      <div className="max-w-2xl mx-auto p-8 bg-white rounded-xl border border-red-200 shadow-card">
        <Link href="/hr/tl-payments" className="text-sm text-brand-600 font-medium hover:underline">← TL Payments</Link>
        <h1 className="mt-2 text-2xl font-bold text-red-700">Payment tidak ditemukan</h1>
        <p className="mt-2 text-sm text-slate-600">ID: {id}</p>
        {error && <p className="mt-2 text-xs text-red-600">{error.message}</p>}
      </div>
    );
  }

  // R177v4: Cek apakah ada linked trip_finance_items
  let linkedFinanceItem = null;
  if (payment.hpp_item_id) {
    try {
      const { data } = await supabase
        .from('trip_finance_items')
        .select('id, total_amount, payment_status, component')
        .eq('id', payment.hpp_item_id)
        .maybeSingle();
      linkedFinanceItem = data;
    } catch {}
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <Link href="/hr/tl-payments" className="text-sm text-brand-600 font-medium hover:underline">← TL Payments</Link>
      <TLPaymentDetail
        payment={payment}
        linkedFinanceItem={linkedFinanceItem}
        approveAction={approveTLPayment.bind(null, payment.id)}
        rejectAction={rejectTLPayment.bind(null, payment.id)}
        resetAction={resetTLPaymentToRequested.bind(null, payment.id)}
        markPaidAction={markTLPaymentPaid.bind(null, payment.id)}
        unmarkPaidAction={unmarkTLPaymentPaid.bind(null, payment.id)}
        markFinalReportAction={markFinalReportSubmitted.bind(null, payment.id)}
        unmarkFinalReportAction={unmarkFinalReportSubmitted.bind(null, payment.id)}
        deleteAction={deleteTLPayment.bind(null, payment.id)}
        uploadProofAction={uploadTLPaymentProof.bind(null, payment.id)}
        deleteProofAction={deleteTLPaymentProof.bind(null, payment.id)}
        getProofUrlAction={getTLPaymentProofSignedUrl.bind(null, payment.id)}
        sendWAAction={sendTLPaymentSlipToWA.bind(null, payment.id)}
        syncAccountingAction={syncTLPaymentToAccounting.bind(null, payment.id)}
      />
    </div>
  );
}
