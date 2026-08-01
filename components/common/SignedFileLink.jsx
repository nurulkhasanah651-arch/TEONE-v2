'use client';

// Link ke file privat: arahkan ke /api/proof yang redirect ke signed URL.
// <a target=_blank> native → tab baru pasti terbuka (tak ada window.open/popup-block).
export default function SignedFileLink({ url, sig, exp, className = '', children }) {
  if (!url) return <span className={className}>{children}</span>;
  let href = `/api/proof?u=${encodeURIComponent(url)}`;
  // Kalau ada tanda tangan (dipakai di halaman publik tanpa login), sertakan.
  if (sig && exp) href += `&e=${encodeURIComponent(exp)}&s=${encodeURIComponent(sig)}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}
