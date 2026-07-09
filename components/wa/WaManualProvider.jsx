'use client';

// Modal template WA manual dipasang di LAYOUT, bukan di dalam panel.
//
// Kenapa: panel-panel approval dirender bersyarat, mis.
//   {pendingPaymentCount > 0 && <InvoicePaymentApprovalPanel ... />}
// Server action approve memanggil revalidatePath('/invoices'), route dirender
// ulang, hitungan pending jadi 0, panelnya ter-unmount — dan modal yang state-nya
// ada DI DALAM panel ikut hilang seketika, sebelum PIC sempat menyalin pesan.
//
// Dengan provider di layout, modal berada di atas panel dalam pohon React,
// jadi ia bertahan sampai user menutupnya sendiri.

import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import WaManualModal from './WaManualModal';

const WaManualContext = createContext(null);

/**
 * showWaManual({ message, phone, name, title })
 * Aman dipanggil walau provider belum terpasang (fallback: prompt copy).
 */
export function useWaManual() {
  const ctx = useContext(WaManualContext);
  return (
    ctx?.show ||
    ((data) => {
      if (data?.message) window.prompt('Salin pesan WA berikut:', data.message);
    })
  );
}

export default function WaManualProvider({ children }) {
  const router = useRouter();
  const [data, setData] = useState(null);

  const show = useCallback((payload) => {
    if (payload) setData(payload);
  }, []);

  const close = useCallback(() => {
    setData(null);
    router.refresh();
  }, [router]);

  return (
    <WaManualContext.Provider value={{ show }}>
      {children}
      <WaManualModal data={data} onClose={close} title={data?.title || 'Kirim WA manual'} />
    </WaManualContext.Provider>
  );
}
