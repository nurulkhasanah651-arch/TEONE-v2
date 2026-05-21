============================================================
PATCH SMALL ke components/trips/TripForm.jsx
============================================================
Tambah 2 input baru di section "Tanggal":
- Tanggal Publish (publish_date)
- Tanggal Closed Selling (closed_at) — kalau sudah closed

Cari section ini di TripForm.jsx (sekitar line 49-61):

    {/* Dates */}
    <Section title="Tanggal">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Keberangkatan">
          <input type="date" name="departure" defaultValue={initial.departure || ''} className={inputCls} />
        </Field>
        <Field label="Kepulangan">
          <input type="date" name="arrival" defaultValue={initial.arrival || ''} className={inputCls} />
        </Field>
        <Field label="Deadline Tutup Booking">
          <input type="date" name="deadline_close" defaultValue={initial.deadline_close || ''} className={inputCls} />
        </Field>
      </div>
    </Section>

GANTI grid-cols-3 jadi grid-cols-2 lg:grid-cols-3, tambah 2 field baru.
Hasilnya:

    {/* Dates */}
    <Section title="Tanggal">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Tanggal Publish" hint="Kapan trip diiklankan / launched">
          <input type="date" name="publish_date" defaultValue={initial.publish_date || ''} className={inputCls} />
        </Field>
        <Field label="Keberangkatan">
          <input type="date" name="departure" defaultValue={initial.departure || ''} className={inputCls} />
        </Field>
        <Field label="Kepulangan">
          <input type="date" name="arrival" defaultValue={initial.arrival || ''} className={inputCls} />
        </Field>
        <Field label="Deadline Tutup Booking">
          <input type="date" name="deadline_close" defaultValue={initial.deadline_close || ''} className={inputCls} />
        </Field>
        <Field label="Tgl Closed Selling" hint="Kapan group ini close (untuk hitung durasi sales)">
          <input type="date" name="closed_at" defaultValue={initial.closed_at || ''} className={inputCls} />
        </Field>
      </div>
    </Section>
