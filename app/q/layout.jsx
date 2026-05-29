// Round 160: Layout untuk public quotation pages (gak pakai sidebar/auth)
// Path: app/q/layout.jsx

import '../globals.css';

export default function PublicQuotationLayout({ children }) {
  return (
    <html lang="id">
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
