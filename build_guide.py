# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
                                Table, TableStyle, PageBreak, ListFlowable, ListItem, KeepTogether)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
import datetime

OUT = "/sessions/vigilant-kind-dijkstra/mnt/outputs/Panduan-Kerja-TEONE.pdf"

# Palette
NAVY = colors.HexColor("#0f172a")
EMER = colors.HexColor("#059669")
EMER_D = colors.HexColor("#047857")
SLATE = colors.HexColor("#334155")
GREY = colors.HexColor("#64748b")
LIGHT = colors.HexColor("#f1f5f9")
AMBER_BG = colors.HexColor("#fffbeb")
AMBER_BD = colors.HexColor("#f59e0b")
BLUE_BG = colors.HexColor("#eff6ff")
BLUE_BD = colors.HexColor("#3b82f6")
WHITE = colors.white

styles = getSampleStyleSheet()
def S(name, **kw):
    return ParagraphStyle(name, parent=styles['Normal'], **kw)

st_title = S('t', fontName='Helvetica-Bold', fontSize=26, textColor=WHITE, leading=30)
st_sub   = S('s', fontName='Helvetica', fontSize=12, textColor=colors.HexColor('#cbd5e1'), leading=16)
st_h1     = S('h1', fontName='Helvetica-Bold', fontSize=15, textColor=WHITE, leading=18)
st_h2     = S('h2', fontName='Helvetica-Bold', fontSize=12.5, textColor=EMER_D, leading=16, spaceBefore=10, spaceAfter=3)
st_body   = S('b', fontName='Helvetica', fontSize=9.7, textColor=SLATE, leading=14)
st_step   = S('st', fontName='Helvetica', fontSize=9.7, textColor=SLATE, leading=14, leftIndent=4)
st_tip    = S('tip', fontName='Helvetica', fontSize=9.2, textColor=colors.HexColor('#92400e'), leading=13)
st_note   = S('note', fontName='Helvetica', fontSize=9.2, textColor=colors.HexColor('#1e3a8a'), leading=13)
st_small  = S('sm', fontName='Helvetica', fontSize=8, textColor=GREY, leading=11)
st_path   = S('p', fontName='Helvetica-Bold', fontSize=9.7, textColor=EMER_D, leading=14)

story = []

def section_header(num, title, subtitle=""):
    cell = []
    cell.append(Paragraph(f"{num} &nbsp; {title}", st_h1))
    if subtitle:
        cell.append(Paragraph(subtitle, S('hsub', fontName='Helvetica', fontSize=9, textColor=colors.HexColor('#a7f3d0'), leading=12)))
    t = Table([[cell]], colWidths=[170*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), EMER),
        ('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),
        ('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),
        ('ROUNDEDCORNERS',[6,6,6,6]),
    ]))
    return t

def h2(txt):
    story.append(Paragraph(txt, st_h2))

def para(txt):
    story.append(Paragraph(txt, st_body))

def steps(items):
    flow = []
    for it in items:
        flow.append(ListItem(Paragraph(it, st_step), leftIndent=14, value=None))
    story.append(ListFlowable(flow, bulletType='1', bulletFontName='Helvetica-Bold',
                              bulletColor=EMER_D, leftIndent=16, bulletFormat='%s.'))

def bullets(items):
    flow = [ListItem(Paragraph(it, st_step), leftIndent=12) for it in items]
    story.append(ListFlowable(flow, bulletType='bullet', bulletColor=EMER, leftIndent=14, start='•'))

def callout(txt, kind='tip'):
    if kind == 'tip':
        bg, bd, stl, label = AMBER_BG, AMBER_BD, st_tip, "TIPS"
    else:
        bg, bd, stl, label = BLUE_BG, BLUE_BD, st_note, "CATATAN"
    inner = [Paragraph(f"<b>{label}.</b> {txt}", stl)]
    t = Table([[inner]], colWidths=[170*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), bg),
        ('LINEBEFORE',(0,0),(0,-1), 3, bd),
        ('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),
        ('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),
    ]))
    story.append(Spacer(1,3)); story.append(t); story.append(Spacer(1,4))

def path(txt):
    story.append(Paragraph(f"Lokasi menu: {txt}", st_path))
    story.append(Spacer(1,2))

def gap(h=6): story.append(Spacer(1,h))

# ============ COVER ============
cover = Table([[ [
    Spacer(1,40*mm),
    Paragraph("PANDUAN KERJA", st_title),
    Paragraph("Penggunaan Sistem Web TEONE", st_title),
    Spacer(1,6),
    Paragraph("Traveling Eropa &amp; Khasanah Travel — Sistem Operasi Internal", st_sub),
    Spacer(1,10),
    Paragraph("Panduan langkah demi langkah untuk tiap divisi: CS, Operasional, Visa, "
              "Finance, Accounting &amp; HR, dan Digital Marketing.", st_sub),
    Spacer(1,90*mm),
    Paragraph(f"Versi {datetime.date.today().strftime('%d %B %Y')} · Dokumen internal", st_sub),
] ]], colWidths=[180*mm], rowHeights=[247*mm])
cover.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,-1), NAVY),
    ('LEFTPADDING',(0,0),(-1,-1),22),('RIGHTPADDING',(0,0),(-1,-1),22),
    ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
]))
story.append(cover)
story.append(PageBreak())

# ============ 0. MULAI ============
story.append(section_header("0", "Mulai: Masuk &amp; Navigasi"))
gap(8)
h2("Cara Masuk (Login)")
steps([
    "Buka <b>teone.dev</b> (atau khasanahtravel.app) → halaman login internal.",
    "Masuk pakai <b>email kantor</b> + password yang diberikan Owner. Tour Leader bisa login via Google.",
    "Setelah masuk, menu di sisi kiri otomatis menyesuaikan <b>role/peran</b> kamu — hanya menu yang jadi tugasmu yang tampil.",
])
callout("Jangan pernah membagikan password ke siapa pun. Kalau lupa password, hubungi Owner/Admin untuk reset. Selalu logout di komputer bersama.", 'tip')
h2("Navigasi")
bullets([
    "Menu dikelompokkan: <b>Utama</b> (Dashboard, Master Trip, CS Daily, Visa), <b>Keuangan</b> (Finance, Operasional, Invoices, Accounting, Refunds), <b>Marketing &amp; Sales</b> (CRM, Penawaran AI, Private Trip Req, Ads, Konten, Etalase), <b>Tim &amp; Tour Leader</b>, serta <b>Data &amp; HR</b>.",
    "Di HP, ketuk ikon menu (garis tiga) di kiri atas untuk membuka daftar menu.",
    "<b>Dashboard</b> adalah ringkasan harian — buka ini tiap pagi untuk lihat posisi terkini.",
])
story.append(PageBreak())

# ============ 1. CS ============
story.append(section_header("1", "CS — Customer Service (CS Daily)",
                            "Closing harian, leads, dan rekap penjualan"))
gap(8)
path("Menu <b>CS Daily</b> (grup Utama)")
h2("Tugas Harian CS")
steps([
    "Buka <b>CS Daily</b> setiap hari kerja.",
    "Catat <b>leads/prospek</b> baru yang masuk (dari WA, IG, web): klik tambah lead → isi nama, no HP, sumber, minat trip.",
    "Saat ada peserta closing (jadi booking): catat di <b>closing harian</b> — pilih trip, nama peserta, nominal DP/pelunasan, dan metode bayar.",
    "Booking dari <b>website</b> otomatis masuk (ditandai badge 'Web') — CS tidak perlu input ulang, cukup verifikasi.",
    "Akhir hari: buka panel <b>Generate &amp; Kirim Rekap</b> → sistem menyusun ringkasan closing hari ini → klik <b>Kirim ke Grup WA</b>.",
])
callout("Pastikan tiap closing dicatat di hari yang benar agar rekap harian &amp; angka penjualan akurat. Nominal yang dicatat adalah harga paket (pokok), bukan termasuk biaya admin.", 'tip')
callout("Rekap WA terkirim ke grup lewat Fonnte. Kalau gagal terkirim, cek nomor/ID grup di pengaturan rekap, lalu coba kirim ulang.", 'note')
story.append(PageBreak())

# ============ 2. OPS ============
story.append(section_header("2", "OPS — Operasional",
                            "PNR, HPP, Request Private Trip, dan Tour Leader"))
gap(8)
h2("A. Input PNR (Inventory Tiket)")
path("Menu <b>Operasional</b> → kartu <b>PNR Inventory</b>")
steps([
    "Klik <b>Operasional</b> → <b>PNR Inventory</b> → tombol <b>Tambah PNR</b>.",
    "Isi: maskapai, kode PNR, jumlah seat, harga tiket, vendor, <b>deposit</b> yang sudah dibayar, dan <b>deadline pelunasan</b>.",
    "Simpan. PNR akan <b>auto-sync ke HPP</b> trip terkait sebagai biaya tiket.",
    "Pantau deadline pelunasan tiket agar tidak terlambat (hangus).",
])
gap(2)
h2("B. Input HPP (Biaya Pokok per Trip)")
path("Menu <b>Operasional</b> → kartu <b>Proyeksi Income per Group</b>")
steps([
    "Pilih trip → masuk ke rincian Proyeksi Income/HPP.",
    "Tambah item HPP per kategori: tiket, hotel, land tour (LA), transport, visa, dll. Isi <b>Total</b>, <b>DP</b>, dan <b>tanggal bayar</b>.",
    "Tiap item menampilkan DP / Total / Sisa, dan tombol <b>Request Payment</b> untuk minta pembayaran ke bagian keuangan/accounting.",
    "Income otomatis dihitung dari jumlah peserta × breakdown harga; margin (laba) muncul otomatis.",
])
callout("Selalu isi HPP selengkap mungkin — kalau biaya tidak tercatat, laba (dan pajak) jadi salah hitung.", 'tip')
gap(2)
h2("C. Tangani Request Private Trip")
path("Menu <b>Private Trip Req</b> (grup Marketing &amp; Sales)")
steps([
    "Permintaan custom trip dari website otomatis masuk ke <b>Private Trip Req</b>.",
    "Buka detail request → cek destinasi, tanggal, jumlah pax, budget, ide itinerary.",
    "Klik <b>Buat Penawaran</b> → isi estimasi biaya per komponen → sistem hitung profit otomatis.",
    "Kirim penawaran ke calon peserta lewat tombol <b>Kirim WA</b>.",
])
gap(2)
h2("D. Set Tour Leader (TL) &amp; Roomlist")
path("Menu <b>Master Trip</b> → pilih trip; Master TL untuk data TL")
steps([
    "Buka <b>Master Trip</b> → pilih trip → assign <b>Tour Leader</b> dari daftar.",
    "TL yang ditugaskan bisa lihat manifest, roomlist, dan checklist lewat <b>Portal TL</b>.",
    "Roomlist tersusun otomatis dari data peserta (child no-bed &amp; infant menempel ke kamar keluarga, tidak menambah kamar).",
])
story.append(PageBreak())

# ============ 3. VISA ============
story.append(section_header("3", "Visa (Tab Visa)",
                            "Dokumen, biometrik, dan hasil visa — per keluarga"))
gap(8)
path("Menu <b>Visa</b> (grup Utama)")
h2("Alur Kerja Visa per Trip")
steps([
    "Buka <b>Visa</b> → pilih trip yang sedang proses visa.",
    "Lengkapi <b>Config Visa</b> trip: negara tujuan, perlu biometrik atau tidak, daftar dokumen yang diminta, lokasi &amp; tanggal biometrik, nominal biaya visa/biometrik, PDF syarat.",
    "<b>Kirim link pengumpulan dokumen</b> ke peserta via WA. Untuk keluarga, satu link mencakup <b>semua anggota</b> — tiap anggota upload dokumen masing-masing (3 orang = 3× per dokumen).",
    "Isi <b>jadwal biometrik</b> (tanggal + jam) tiap peserta di samping kolom jam. Lalu kirim WA biometrik — pesan memuat jadwal <b>seluruh anggota keluarga</b>.",
    "Setelah selesai, <b>upload hasil visa</b> (foto/scan) per peserta, centang approved/rejected, lalu kirim WA hasil — foto visa terkirim untuk <b>tiap anggota</b>.",
])
callout("Saat kirim untuk keluarga, gunakan mode <b>family-aware/bulk</b> agar dokumen, jadwal, dan hasil mencakup semua anggota — bukan hanya kepala keluarga.", 'tip')
callout("Biaya visa &amp; biometrik bisa di-request ke Accounting sebagai HPP lewat tombol Request di detail peserta.", 'note')
story.append(PageBreak())

# ============ 4. FINANCE ============
story.append(section_header("4", "Finance",
                            "Invoice peserta &amp; Payment Checklist"))
gap(8)
h2("A. Invoices Peserta")
path("Menu <b>Invoices</b> (grup Keuangan)")
steps([
    "Buka <b>Invoices</b> → pilih peserta/keluarga → <b>Generate Invoice</b> per termin (DP, P1..P7, Pelunasan).",
    "Untuk keluarga, bisa isi <b>nominal custom</b> per anggota — invoice &amp; link bayar mengikuti nominal custom, bukan template.",
    "Kirim invoice via <b>WhatsApp</b>. Peserta bisa <b>bayar online (Midtrans)</b> atau transfer manual + upload bukti.",
    "Saat bukti masuk, <b>verifikasi</b> → kuitansi otomatis terbit &amp; sisa pembayaran ter-update.",
])
callout("Pembayaran online lewat link otomatis tercatat ke pembayaran peserta &amp; kas — tidak perlu input manual lagi.", 'note')
gap(2)
h2("B. Payment Checklist Peserta")
path("Menu <b>Finance</b> → kartu <b>Payment Checklist Peserta</b>")
steps([
    "Buka <b>Finance</b> → <b>Payment Checklist Peserta</b> → pilih trip.",
    "Lihat status tiap peserta: DP, Payment 1/2/3, Pelunasan, Visa, Asuransi.",
    "Tandai/lengkapi pembayaran yang masuk; sisa tagihan terlihat per peserta.",
    "Gunakan ini untuk menagih peserta yang menunggak sebelum keberangkatan.",
])
story.append(PageBreak())

# ============ 5. ACCOUNTING & HR ============
story.append(section_header("5", "Accounting &amp; HR",
                            "Pembukuan, pajak tahunan, dan kepegawaian"))
gap(8)
h2("A. Tab Accounting")
path("Menu <b>Accounting</b> (grup Keuangan)")
bullets([
    "<b>Entry Manual</b>: catat kas masuk/keluar manual (mis. biaya operasional, pendapatan lain).",
    "<b>Laporan Bulanan</b>: cash in/out &amp; net cashflow per bulan.",
    "<b>Posisi Kas</b>: pisahkan uang peserta (titipan) vs uang perusahaan.",
    "<b>Bank &amp; Cash</b>: kelola akun kas/bank. <b>Bank Reconciliation</b>: cocokkan mutasi bank.",
    "<b>Balance Sheet</b>: posisi neraca sederhana.",
    "<b>Pajak Tahunan</b>: hitung otomatis PPN 1,2% &amp; PPh per tahun dari omzet/laba riil (lihat tips).",
])
callout("Tab <b>Pajak Tahunan</b> menghitung PPN (1,2% × omzet) dan PPh otomatis tiap tahun. Bila omzet &gt; Rp4,8 M muncul peringatan WAJIB PKP &amp; pakai PPh Badan 22% (dengan fasilitas Pasal 31E). Angka ini estimasi — pelaporan resmi tetap lewat Coretax &amp; sebaiknya didampingi konsultan pajak.", 'tip')
gap(2)
h2("B. HR (Kepegawaian)")
path("Menu <b>HR</b> (grup Data &amp; HR)")
steps([
    "<b>Data Karyawan</b>: kelola daftar karyawan &amp; jabatan.",
    "<b>Absensi</b>: karyawan check-in/out sendiri; admin lihat rekap kehadiran.",
    "<b>Payroll</b>: kelola periode &amp; komponen gaji.",
    "<b>KPI</b>: definisikan metrik &amp; isi realisasi bulanan (otomatis + manual).",
])
story.append(PageBreak())

# ============ 6. DIGITAL MARKETING ============
story.append(section_header("6", "Digital Marketing",
                            "Ads, Konten, dan CRM"))
gap(8)
h2("A. Ads Manager")
path("Menu <b>Ads Manager</b> (grup Marketing &amp; Sales)")
steps([
    "Buka <b>Ads Manager</b> → lihat performa iklan (data tersinkron otomatis dari Meta/Windsor per brand).",
    "Pantau metrik kampanye (spend, hasil) dan kaitkan ke trip yang diiklankan.",
    "Tambahkan/input data iklan manual bila perlu untuk melengkapi.",
])
gap(2)
h2("B. Konten (Sosial Media)")
path("Menu <b>Konten</b> (grup Marketing &amp; Sales)")
steps([
    "Buka <b>Konten</b> → <b>kalender</b> rencana posting.",
    "Lihat <b>performa Instagram</b> (tersambung Meta) atau input performa manual.",
    "Gunakan <b>AI Caption</b> untuk bantu menulis caption postingan.",
])
gap(2)
h2("C. CRM Customer")
path("Menu <b>CRM Customer</b> (grup Marketing &amp; Sales)")
steps([
    "Buka <b>CRM Customer</b> → database calon/eks peserta.",
    "Gunakan untuk follow-up, tawarkan trip baru, dan jaga hubungan (repeat order).",
])
callout("Etalase Web (foto header, region, foto private trip) diatur di menu <b>Etalase Web</b> — upload foto landscape kualitas tinggi agar tampilan website menarik.", 'note')

gap(10)
# Penutup
t = Table([[ [
    Paragraph("Catatan Penutup", S('pc', fontName='Helvetica-Bold', fontSize=12, textColor=NAVY)),
    Spacer(1,4),
    Paragraph("• Selalu input data di hari yang sama agar laporan akurat. "
              "• Jaga kerahasiaan password &amp; data peserta. "
              "• Jika menemukan error/bug, catat langkahnya dan laporkan ke Admin. "
              "• Panduan ini dapat diperbarui seiring penambahan fitur.", st_body),
] ]], colWidths=[170*mm])
t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1), LIGHT),
    ('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),
    ('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
story.append(t)

# ===== doc with footer =====
def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(GREY)
    if doc.page > 1:
        canvas.drawString(20*mm, 12*mm, "Panduan Kerja Sistem TEONE — Dokumen Internal")
        canvas.drawRightString(190*mm, 12*mm, f"Hal. {doc.page}")
    canvas.restoreState()

doc = BaseDocTemplate(OUT, pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm, topMargin=16*mm, bottomMargin=18*mm,
    title="Panduan Kerja Sistem TEONE", author="Traveling Eropa")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='n')
doc.addPageTemplates([PageTemplate(id='main', frames=[frame], onPage=footer)])
doc.build(story)
print("PDF built:", OUT)
