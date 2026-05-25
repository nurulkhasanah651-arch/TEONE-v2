═══════════════════════════════════════════════════════════════
ROUND 104 — Saldo Bank Auto-Sync dengan Cash In/Out
═══════════════════════════════════════════════════════════════

BUG SEBELUMNYA:
- Saldo Bank di /accounting cuma hitung dari manual entries (accounting_entries)
- Payments peserta + HPP lunas vendor tampil di "Transaksi Terbaru" tapi
  TIDAK ikut hitung saldo bank → saldo statis padahal cashflow ada

FIX ROUND 104:
Saldo Bank sekarang AUTO-SYNC dengan SEMUA cash in/out:
- ✅ Cash In = ALL participant_payments + manual entries type='in'
- ✅ Cash Out = ALL HPP lunas + manual entries type='out'
- Saldo Final = Starting Balance + Cash In − Cash Out

UI BARU:
Section khusus "🏦 Saldo Bank/Kas" muncul di atas dengan breakdown:
- Starting Balance (per account)
- + Cash In (auto + manual)
- − Cash Out (auto + manual)
- = Saldo Final (total)
Plus saldo per-account (untuk manual entries dengan account_id explicit).

Transaksi list ditambah badge source:
- 🤝 Peserta (dari participant_payments)
- 💼 Vendor (dari HPP lunas)
- ✎ Manual (dari accounting_entries)

═══════════════════════════════════════════════════════════════
STEP 1: UPLOAD 1 FILE (REPLACE)
═══════════════════════════════════════════════════════════════

────────────────────────────────────────────────
FILE 1 (REPLACE): app/(app)/accounting/page.jsx
────────────────────────────────────────────────
- Buka file existing → ✎ Edit
- Select All → Delete → Paste isi: app_accounting_page.txt
- Commit: "fix: Round 104 - saldo bank auto-sync dengan payments + HPP"

CHANGES:
✓ totalBank = manualBankSum + autoNet (payments - HPP lunas)
✓ Hapus StatCard "Saldo Bank/Kas" basic → diganti section card lengkap
✓ Stat cards lain: Piutang, Hutang, Net Equity (tetap)
✓ Transaksi list: badge source per entry

═══════════════════════════════════════════════════════════════
STEP 2: TUNGGU DEPLOY → HARD REFRESH
═══════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════
TEST SCENARIO
═══════════════════════════════════════════════════════════════

Misal starting balance: Kas Kecil 0, BCA 0 → starting = 0

1. Peserta bayar DP 5jt (via DP approval) → participant_payment record
   → Saldo Bank: +5jt (Cash In 🤝 Peserta)

2. HPP "Hotel" 10jt mark lunas → trip_finance_items.payment_status='lunas'
   → Saldo Bank: -10jt (Cash Out 💼 Vendor)
   → Total: 5jt - 10jt = -5jt

3. Manual entry "Topup BCA" 50jt (via /accounting/new) → accounting_entries
   → Saldo Bank: +50jt (Cash In ✎ Manual, account: BCA)
   → Total: -5jt + 50jt = 45jt

Display:
🏦 Saldo Bank/Kas: Rp 45.000.000
  Starting Balance: 0
  + Cash In: 55jt (5jt peserta + 50jt manual)
  − Cash Out: 10jt (10jt vendor)
  = Saldo Final: 45jt

Per account saldo (manual entries only):
  Kas Kecil: 0
  BCA: 50jt (dari Topup manual)

═══════════════════════════════════════════════════════════════
CATATAN PENTING
═══════════════════════════════════════════════════════════════

Saldo total = akurat ✓
Saldo per-account = HANYA hitung manual entries dengan account_id.
Untuk attribute payments/HPP ke specific account, harus bikin
journal entry manual (atau future enhancement: pilih account waktu approve).

═══════════════════════════════════════════════════════════════
RECAP — 1 FILE REPLACE
═══════════════════════════════════════════════════════════════

  □ app/(app)/accounting/page.jsx ← app_accounting_page.txt

═══════════════════════════════════════════════════════════════
