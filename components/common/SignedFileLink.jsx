'use client';

// Link ke file privat: arahkan ke /api/proof yang redirect ke signed URL.
// <a target=_blank> native → tab baru pasti terbuka (tak ada window.open/popup-block).
export default function SignedFileLink({ url, className = '', children }) {
  if (!url) return <span className={className}>{children}</span>;
  const href = `/api/proof?u=${encodeURIComponent(url)}`;
  return (
    <a href={href} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  );
}
