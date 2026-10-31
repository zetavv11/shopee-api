# Changelog

## 1.1.0
- Nominal diterima Rp1 – Rp10.000.000 (`MIN_AMOUNT` bawaan 1). Kode unik tidak dipakai untuk nominal < Rp1.000 dan tidak pernah melewati batas maksimum.
- Dashboard pribadi `/dashboard` dengan login: ringkasan, grafik arus dana harian, jam ramai, sebaran nominal, daftar transaksi + pencarian + ekspor CSV, batalkan invoice, Uji QRIS, status sistem, pembaruan sesi ShopeePay.
- Dokumentasi API publik `/docs` (cURL, Node.js, PHP, Python, verifikasi callback, kode error).
- Halaman bayar publik `/pay/:invoice_id` (struk, hitung mundur, stempel LUNAS otomatis); respons `/create-qris` kini memuat `pay_url`.
- Penyimpanan tahan lama opsional lewat Upstash Redis / Vercel KV dengan compare-and-set.
- CSP: skrip hanya dari origin sendiri; font dari Google Fonts.
- Refactor: logika penerbitan QRIS dan pengecekan pembayaran dipindah ke service bersama (`qrisIssuer`, `paymentCheck`); perilaku API lama tidak berubah.
