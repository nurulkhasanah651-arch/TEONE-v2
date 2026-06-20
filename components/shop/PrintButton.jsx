'use client';
export default function PrintButton() {
  return (
    <button onClick={() => window.print()} className="no-print px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-bold hover:bg-slate-800">
      🖨️ Cetak / Simpan PDF
    </button>
  );
}
