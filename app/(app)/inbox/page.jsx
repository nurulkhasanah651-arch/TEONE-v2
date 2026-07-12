// Inbox WhatsApp (Khasanah) — FITUR BARU. Chat room ala Qontak/Qiscus.
import { getInboxData } from '@/lib/actions/wa-inbox';
import InboxClient from '@/components/inbox/InboxClient';

export const dynamic = 'force-dynamic';

export default async function InboxPage() {
  const data = await getInboxData({});
  if (data?.notKhasanah) {
    return <div className="p-6 text-sm text-slate-500">Inbox WhatsApp khusus Khasanah.</div>;
  }
  if (data?.error) {
    return <div className="p-6 text-sm text-red-600">{data.error}</div>;
  }
  return <InboxClient initial={data} />;
}
