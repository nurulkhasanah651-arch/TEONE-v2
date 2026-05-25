'use client';

// Round 108: Print invoice button — trigger window.print() untuk download PDF
// Browser akan tampilkan dialog Print → user bisa Save as PDF

export default function PrintInvoiceButton({ invoiceNo }) {
  function handlePrint() {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  return (
    <button
      type="button"
      onClick={handlePrint}
      className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold rounded-lg shadow-sm transition-colors"
      title={`Print / Save as PDF: ${invoiceNo || 'invoice'}`}
    >
      <span>🖨</span>
      <span>Print / Save PDF</span>
    </button>
  );
}
