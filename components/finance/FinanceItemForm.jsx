═══════════════════════════════════════════════════════════════
ROUND 127 — HPP Form Auto-Fill Qty + Custom-able
═══════════════════════════════════════════════════════════════

FITUR:

Saat tambah item HPP/Income di Proyeksi Income:
✓ Field "Qty (Jumlah Pax)" otomatis terisi dengan jumlah pax aktif
✓ Ada 2 tombol quick:
  - "= 20 pax" → set ke jumlah pax aktif
  - "= 1" → set ke 1 (untuk item satuan: group permit, dll)
✓ User bisa edit qty manual (custom-able)
✓ Live preview formula: "Rp 100.000 × 20 = Rp 2.000.000"
✓ Total Amount auto-compute (basic_fare × qty)

═══════════════════════════════════════════════════════════════
2 FILE REPLACE
═══════════════════════════════════════════════════════════════

────────────────────────────────────────────────
FILE 1: components/finance/FinanceItemForm.jsx
────────────────────────────────────────────────

1. GitHub → components/finance/FinanceItemForm.jsx → ✎ Edit
2. Cmd+A → Delete semua
3. Paste dari: PASTE_THIS_TO_components_finance_FinanceItemForm.jsx.txt
4. Commit: "feat: r127 - HPP form auto-fill qty with pax count"

────────────────────────────────────────────────
FILE 2: app/(app)/finance/cashflow/[tripId]/page.jsx
────────────────────────────────────────────────

(Update untuk pass paxCount ke FinanceItemForm)

1. GitHub → app/(app)/finance/cashflow/[tripId]/page.jsx → ✎ Edit
2. Cmd+A → Delete semua
3. Paste dari: PASTE_THIS_TO_finance_cashflow_tripId_page.jsx.txt
4. Commit: "feat: r127 - pass paxCount to FinanceItemForm"

═══════════════════════════════════════════════════════════════
TEST
═══════════════════════════════════════════════════════════════

1. Buka /finance/cashflow/[tripId] (mis. trip dengan 20 peserta aktif)
2. Scroll ke section HPP → klik "+ Tambah Item HPP"
3. Form muncul:
   - Field "Qty (Jumlah Pax)": OTOMATIS terisi 20
   - Hint di bawah: "Default = 20 pax aktif. Bisa custom."
   - 2 tombol di kanan: "= 20 pax" dan "= 1"
4. Pilih kategori (mis. Visa) + component
5. Isi Basic Fare: 100000
6. Total Amount otomatis: 2.000.000
7. Preview formula muncul: "Rp 100.000 × 20 = Rp 2.000.000"
8. Atau kalau visa cuma untuk 5 orang, edit qty jadi 5
9. Submit

═══════════════════════════════════════════════════════════════
CONTOH PENGGUNAAN
═══════════════════════════════════════════════════════════════

A. ITEM PER-PAX (default):
   - Visa per pax: 100rb × 20 pax = 2jt
   - Tips per pax: 50rb × 20 pax = 1jt
   - Klik "Tambah HPP" → qty auto 20 → tinggal isi fare

B. ITEM SATUAN (group):
   - Group permit: Rp 5jt × 1 = 5jt
   - Bus rental: Rp 8jt × 1 = 8jt
   - Klik tombol "= 1" untuk reset qty ke 1

C. ITEM PARTIAL (mis. visa cuma untuk yang butuh):
   - Visa: Rp 100rb × 5 = 500rb (cuma 5 dari 20 pax)
   - Edit qty manual ke 5

═══════════════════════════════════════════════════════════════
RECAP
═══════════════════════════════════════════════════════════════

  □ REPLACE: components/finance/FinanceItemForm.jsx
  □ REPLACE: app/(app)/finance/cashflow/[tripId]/page.jsx
  □ Test tambah HPP → qty auto-fill + bisa custom

═══════════════════════════════════════════════════════════════
