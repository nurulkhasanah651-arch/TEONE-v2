'use client';

// Round 163: PreviewToolbar — + tombol PDF Download native
// Path: components/quotations/PreviewToolbar.jsx

import { useState } from 'react';
import Link from 'next/link';

export default function PreviewToolbar({ editHref, publicHref, filename = 'penawaran' }) {
  const [pdfLoading, setPdfLoading] = useState(false);

  async function downloadPDF() {
    setPdfLoading(true);
    try {
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      // Find the QuotationPreview element
      const element = document.querySelector('.quotation-preview') || document.querySelector('[data-quotation-preview]');
      if (!element) {
        alert('Element preview gak ketemu');
        setPdfLoading(false);
        return;
      }

      const opt = {
        margin: 0,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: true,
        },
        pagebreak: { mode: ['css', 'legacy'] },
      };

      await html2pdf().set(opt).from(element).save();
    } catch (e) {
      alert('Gagal generate PDF: ' + e.message);
    } finally {
      setPdfLoading(false);
    }
  }

  function browserPrint() {
    window.print();
  }

  return (
    <div className="fixed top-4 right-4 z-50 bg-white rounded-full shadow-lg border border-slate-200 flex items-center gap-1 px-2 py-1 print:hidden">
      {editHref && (
        <Link href={editHref} className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-full">
          ← Edit
        </Link>
      )}
      <button
        type="button"
        onClick={downloadPDF}
        disabled={pdfLoading}
        className="px-3 py-1.5 text-xs font-semibold bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full"
      >
        {pdfLoading ? '⏳ Generating...' : '📄 Download PDF'}
      </button>
      <button
        type="button"
        onClick={browserPrint}
        className="px-3 py-1.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-full"
      >
        🖨 Print
      </button>
      {publicHref && (
        <a href={publicHref} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs font-semibold bg-green-100 hover:bg-green-200 text-green-700 rounded-full">
          🔗 Public
        </a>
      )}
    </div>
  );
}
