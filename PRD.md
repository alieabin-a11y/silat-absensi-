# PRD: Dashboard Absensi Silat (Putra Setia Rawa Bebek)

Dokumen ini dipakai sebagai acuan utama di Claude Code. Baca seluruhnya sebelum menulis kode. Kalau ada hal yang ambigu, tanyakan dulu ke pemilik proyek (Basyair), jangan menebak.

---

## 1. Ringkasan

Web app mobile-first untuk absensi latihan silat. Pelatih scan QR kartu siswa lewat kamera HP, dan absensi otomatis tercatat di Google Sheets. Pelatih juga bisa melihat pendapatan. Orang tua bisa melihat absensi dan status bayar anaknya (tanpa nominal uang).

**Konteks bisnis**

| Jenis | Jadwal | Tarif | Peserta |
|---|---|---|---|
| Umum | Setiap Sabtu | Rp15.000 per siswa per latihan | 36 siswa |
| Khusus | Selasa dan Kamis | Rp5.000 per siswa per hari latihan | 15 siswa (peserta Turnamen Putra Setia Championship 2026) |

- Jadwal kadang bergeser kalau ada kendala (tanggal aktual berbeda dari rencana).
- Siswa yang hadir tapi belum bayar tetap dicatat Hadir, status bayar Belum.
- Pendapatan Umum dan Khusus harus terpisah.

## 2. Tujuan dan Non-Tujuan

**Tujuan**
1. Absensi cepat: satu scan, satu baris tercatat, feedback jelas di layar.
2. Pelatih tahu pendapatan (Seharusnya vs Diterima) dan siapa yang menunggak.
3. Orang tua bisa cek absensi dan status bayar anak sendiri, tanpa melihat data siswa lain.
4. Data tetap di Google Sheets yang sudah ada (bisa dibuka dan diedit manual kapan saja).

**Non-tujuan (jangan dibuat)**
- Pembayaran online / payment gateway.
- Notifikasi WhatsApp otomatis.
- Aplikasi native (Android/iOS).
- Siswa scan sendiri (yang scan hanya pelatih).

## 3. Pengguna dan Hak Akses

| Peran | Login | Bisa lihat/lakukan |
|---|---|---|
| Pelatih | Passcode + nama pelatih | Scan, kelola kehadiran, tandai Lunas, lihat pendapatan, kelola sesi |
| Orang tua | ID_Siswa + PIN 4 digit | Hanya riwayat absensi dan status Lunas/Belum anaknya. Tidak ada nominal uang, tarif, atau data siswa lain |

## 4. Arsitektur

**Rekomendasi: frontend statis + backend Google Apps Script (sebagai API JSON)**

```
HP pelatih / HP orang tua
        |  HTTPS
Frontend statis (GitHub Pages / Netlify)   <- kamera QR bekerja andal di halaman HTTPS biasa
        |  fetch POST (JSON, Content-Type: text/plain agar tanpa preflight CORS)
Google Apps Script Web App (doPost / doGet)  <- semua logika, validasi, auth ada di sini
        |
Google Sheets (file master, privat milik pelatih)
```

Alasan: akses kamera (`getUserMedia`) di dalam iframe HTML Service Apps Script sering bermasalah (terutama Safari iOS). Dengan frontend terpisah, kamera berjalan di halaman top-level.

**Keputusan: pakai GitHub Pages (hosting terpisah).** Fallback di bawah hanya dipakai bila kamera gagal di HP pelatih.

**Fallback:** semua dilayani oleh Apps Script HTML Service. Uji kamera di HP pelatih di Milestone 2 sebelum lanjut. Kalau gagal, pindah ke arsitektur utama.

**Stack**
- Backend: Google Apps Script (JavaScript), deploy pakai `clasp`. Web App: Execute as "Me", Who has access "Anyone" (orang tua tanpa login Google). Karena endpoint publik, **auth wajib di server**.
- Frontend: HTML + CSS + JavaScript biasa (tanpa framework, tanpa build step). Library via CDN dengan versi dipin: `html5-qrcode` untuk scan, `Chart.js` untuk grafik (opsional).
- Script lokal (Node.js) untuk cetak kartu QR: `qrcode` + `pdfkit`.
- Bahasa UI: Bahasa Indonesia. Zona waktu: **Asia/Jakarta (WIB)**. Atur di `appsscript.json`.

**Struktur repo**
```
silat-absensi/
  PRD.md
  CLAUDE.md                # ringkasan aturan proyek (buat di M0)
  backend/                 # clasp project
    appsscript.json
    Code.gs                # doPost/doGet, routing
    auth.gs  sheets.gs  scan.gs  revenue.gs  parent.gs  util.gs
  frontend/
    index.html             # halaman pelatih (login, scan, hadir, pendapatan, sesi)
    ortu.html              # halaman orang tua
    css/  js/
  tools/
    cetak-kartu/           # generator PDF kartu QR
  docs/
    DEPLOY.md  TEST.md
```

## 5. Kontrak Data (Google Sheets)

Spreadsheet hasil import dari `Template_Absensi_Silat.xlsx`. **Jangan ubah nama sheet dan urutan kolom** tanpa memperbarui rumus. Baris 1 = header.

**`Pengaturan`**: `B2` = Tarif Umum (15000), `B3` = Tarif Khusus (5000). Daftar dropdown ada di kolom E-J.

**`Siswa`** (baris 2 sampai 101)
| Kol | Isi |
|---|---|
| A | ID_Siswa (S001-S036). Isi QR |
| B | Nama |
| C | Panggilan (boleh kosong) |
| D | Tingkatan/Sabuk (kosong dulu) |
| E | No_HP_Wali (kosong dulu) |
| F | PIN_Ortu (teks 4 digit, **baca sebagai string**, jangan jadi angka) |
| G | Tgl_Gabung (kosong dulu) |
| H | Status (Aktif / Nonaktif) |

**`Peserta_Khusus`**: A = ID_Siswa (15 peserta). B = Nama (rumus, jangan ditimpa).

**`Sesi`** (baris 2 sampai 101)
| Kol | Isi |
|---|---|
| A | ID_Sesi: `U-YYYY-MM-DD` (Umum) atau `K-YYYY-MM-DD` (Khusus), berdasarkan **Tanggal_Rencana** (tidak berubah walau digeser) |
| B | Tanggal_Rencana |
| C | Tanggal_Aktual (isi jika digeser) |
| D | Tanggal_Efektif (rumus: C kalau ada, kalau tidak B) |
| E | Jenis (Umum / Khusus) |
| F | Status_Sesi (Terjadwal / Terlaksana / Batal) |
| G | Tarif (rumus dari Pengaturan) |
| H | Keterangan |

**`Absensi`** (data mulai baris 2; 1 baris = 1 siswa di 1 sesi)
| Kol | Isi |
|---|---|
| A | Timestamp (WIB) |
| B | ID_Sesi |
| C | ID_Siswa |
| D | Nama (disalin saat scan) |
| E | Jenis (disalin dari Sesi) |
| F | Status_Hadir (Hadir / Izin / Sakit) |
| G | Tarif (snapshot saat scan; Izin/Sakit = 0) |
| H | Status_Bayar (Belum / Lunas) |
| I | Jumlah_Dibayar (angka, boleh sebagian) |
| J | Metode (Tunai / Transfer / kosong) |
| K | Tgl_Bayar |
| L | Dicatat_Oleh (nama pelatih dari login) |

**Sheet rumus (jangan ditulis oleh script):** `Rekap_Pendapatan`, `Ringkasan`, `Rekap_Siswa`.

**Aturan data**
- Kunci unik: pasangan (`ID_Sesi`, `ID_Siswa`). Tidak boleh ada dua baris yang sama.
- Cari baris terakhir dengan menghitung kolom A yang terisi, bukan `getLastRow()` mentah.
- Template saat ini punya batas: Sesi 100 baris, rumus rekap membaca Absensi sampai baris 2000. Dengan kira-kira 66 baris per minggu, ini habis sekitar 30 minggu. **M0 wajib memperluas rentang rumus ke 10.000 baris** (atau bagi file per semester). Lihat bagian Risiko.

## 6. Fitur

Prioritas: **P0** wajib (MVP), **P1** sebaiknya ada, **P2** nanti.

### 6.1 Login pelatih (P0)
- Input: passcode dan nama pelatih. Passcode dicek di server terhadap nilai di Script Properties (`COACH_PASSCODE`). Jangan simpan passcode di kode atau repo.
- Server mengembalikan token acak (disimpan di Script Properties/Cache, kedaluwarsa 30 hari). Semua aksi pelatih wajib menyertakan token.
- Nama pelatih disimpan di perangkat dan dipakai untuk kolom `Dicatat_Oleh`.
- Ganti passcode = semua token lama tidak berlaku.

### 6.2 Pemilihan sesi aktif (P0)
- Saat dibuka, sistem mencari sesi dengan `Tanggal_Efektif` = hari ini (WIB) dan status bukan Batal. Otomatis terpilih.
- Kalau tidak ada: pelatih memilih manual dari dropdown (sesi terdekat di atas). Beri peringatan jika sesi yang dipilih bukan hari ini.
- Latihan digeser: pelatih bisa mengisi `Tanggal_Aktual` langsung dari aplikasi (lihat 6.7), lalu sesi itu otomatis menjadi sesi aktif di hari barunya.
- Header selalu menampilkan: jenis sesi, tanggal, tarif.

### 6.3 Scan QR (P0)
- Kamera belakang, scan terus-menerus, jeda 2 detik antar scan yang sama.
- Isi QR = ID_Siswa murni (contoh `S001`). Validasi regex `^S\d{3,}$`. QR di luar format ini diabaikan dengan pesan "QR tidak dikenali".
- Alur server saat scan:
  1. Sesi ada dan statusnya bukan Batal. Kalau Batal, tolak.
  2. ID_Siswa ada di `Siswa`. Kalau tidak, `unknown_student`.
  3. Status siswa Aktif. Kalau Nonaktif, peringatan `inactive` (pelatih boleh lanjut dengan konfirmasi).
  4. Kalau sesi Khusus dan siswa tidak ada di `Peserta_Khusus`: `not_khusus_participant`. Tampilkan "Bukan peserta khusus" dan minta konfirmasi sebelum dicatat.
  5. Kalau pasangan (sesi, siswa) sudah ada: `duplicate`, tampilkan jam scan pertama. Tidak menulis baris baru.
  6. Lolos semua: tulis satu baris dengan `Status_Hadir = Hadir`, `Tarif` = tarif sesi, `Status_Bayar = Belum`, `Jumlah_Dibayar = 0`.
- Semua penulisan memakai `LockService` agar dua scan hampir bersamaan tidak menghasilkan baris ganda.
- Feedback: kartu besar hijau "Yasmin, hadir" (nama + panggilan), getar singkat, bunyi opsional. Duplikat = kuning, peringatan/konfirmasi = oranye, error = merah.
- Setelah scan sukses, ada tombol cepat **"Lunas (Tunai)"** di notifikasi, karena uang biasanya diterima di tempat.
- Fallback: kotak cari manual (ketik nama, panggilan, atau ID) kalau kartu rusak atau hilang.

### 6.4 Daftar hadir sesi (P0)
- Daftar siswa yang tercatat di sesi aktif: nama, jam, status hadir, status bayar.
- Tandai **Lunas** per baris: pilih metode (Tunai/Transfer) dan jumlah (default = tarif, boleh sebagian). Mengisi `Status_Bayar`, `Jumlah_Dibayar`, `Metode`, `Tgl_Bayar`.
- Status jadi Lunas otomatis kalau `Jumlah_Dibayar >= Tarif`. Kalau kurang, tetap Belum dan jumlahnya tersimpan.
- Catat **Izin / Sakit** manual untuk siswa yang tidak datang (Tarif 0, tidak masuk Seharusnya).
- Batalkan kehadiran (hapus baris) dengan konfirmasi dua langkah.
- Penghitung: Hadir X dari N (peserta sesi ini), Belum bayar Y.

### 6.5 Pendapatan, hanya pelatih (P0)
- Ringkasan bulanan, Umum dan Khusus **terpisah**, plus total: jumlah sesi, total hadir, Seharusnya, Diterima, Piutang.
- Pilih bulan (default bulan ini).
- Tabel per sesi (tanggal, jenis, hadir, Seharusnya, Diterima, Piutang).
- Daftar **Tunggakan** per siswa (nama, jumlah sesi belum lunas, total tunggakan), bisa diurutkan, dengan tombol "Tandai Lunas".
- (P1) Grafik batang pendapatan per bulan, Umum vs Khusus.
- Perhitungan dilakukan di server dari data Absensi (atau membaca sheet rumus). Hasil harus sama dengan sheet `Ringkasan`; itu jadi uji silang.

### 6.6 Halaman orang tua (P0)
- URL terpisah (`ortu.html`). Login: ID_Siswa + PIN 4 digit. Opsi "Ingat di perangkat ini".
- Menampilkan: nama anak, persentase kehadiran Umum, jumlah hadir Umum dan Khusus, riwayat per sesi (tanggal, jenis, Hadir/Izin/Sakit/**Tidak tercatat**, **Lunas/Belum**).
- **Tidak boleh** muncul: nominal tarif, jumlah dibayar, pendapatan, atau data siswa lain. Respons API orang tua tidak boleh memuat field uang sama sekali (bukan sekadar disembunyikan di UI).
- Siswa Nonaktif: tampilkan pesan netral, tanpa riwayat baru.
- Keamanan PIN: 5 percobaan salah per ID dalam 15 menit = kunci sementara (pakai `CacheService`). Pesan error sama untuk ID salah dan PIN salah.

### 6.7 Kelola sesi (P0 minimal, P1 lengkap)
- P0: ubah `Status_Sesi` (Terjadwal/Terlaksana/Batal), isi `Tanggal_Aktual` dan `Keterangan`.
- P1: tombol "Buat jadwal bulan depan" yang menambah baris Sesi otomatis (Sabtu = Umum, Selasa dan Kamis = Khusus) tanpa menimpa baris yang ada, memeriksa ID_Sesi unik dan batas baris.
- Sesi otomatis dianggap Terlaksana kalau ada kehadiran dan pelatih menekan "Tutup sesi" (tombol di halaman Hadir). Persentase kehadiran hanya menghitung sesi Terlaksana.

### 6.8 Kartu QR siswa (P0, tool terpisah)
- Script Node di `tools/cetak-kartu/`: membaca daftar siswa (dari CSV ekspor sheet `Siswa`) dan menghasilkan PDF A4 berisi kartu: QR (isi = ID_Siswa), nama lengkap, panggilan, ID, logo (opsional).
- Ukuran dan layout kartu: lihat daftar input di bagian 12.
- Terpisah dari dashboard supaya data siswa tidak perlu diakses lewat internet.

### 6.9 Mode offline ringan (P1)
- Kalau jaringan putus saat scan, simpan scan di antrean lokal (`localStorage`) dengan timestamp asli, tampilkan "menunggu sinkron", dan kirim ulang otomatis saat online. Server memeriksa duplikat sehingga kirim ulang aman.

### 6.10 Backup (P2)
- Trigger mingguan Apps Script: salin spreadsheet ke folder Drive "Backup Absensi" (simpan 8 salinan terakhir).

## 7. API (Apps Script `doPost`)

Request: `POST` body JSON `{ "action": "...", "token": "...", ...params }`, header `Content-Type: text/plain;charset=utf-8`. Response selalu `{ "ok": true|false, "code": "...", "message": "...", "data": {...} }`. Semua aksi pelatih memerlukan `token`; aksi orang tua memerlukan `idSiswa` dan `pin`.

| Action | Akses | Param | Hasil |
|---|---|---|---|
| `coachLogin` | publik | passcode, namaPelatih | token |
| `bootstrap` | pelatih | - | daftar siswa (id, nama, panggilan, status), daftar sesi, sesi aktif, daftar peserta khusus, tarif |
| `scan` | pelatih | idSesi, idSiswa, confirm? | code: `ok` / `duplicate` / `unknown_student` / `inactive` / `not_khusus_participant` / `session_cancelled`, data siswa |
| `setAttendance` | pelatih | idSesi, idSiswa, statusHadir | baris terbaru (Hadir/Izin/Sakit) |
| `deleteAttendance` | pelatih | idSesi, idSiswa | ok |
| `markPaid` | pelatih | idSesi, idSiswa, jumlah, metode | baris terbaru |
| `sessionAttendance` | pelatih | idSesi | daftar absensi sesi |
| `updateSession` | pelatih | idSesi, statusSesi?, tanggalAktual?, keterangan? | sesi terbaru |
| `createSessions` (P1) | pelatih | dari, sampai | jumlah baris dibuat |
| `revenueMonth` | pelatih | bulan (YYYY-MM) | ringkasan Umum/Khusus/Total + per sesi |
| `debtors` | pelatih | - | tunggakan per siswa |
| `parentView` | orang tua | idSiswa, pin | profil + riwayat + persentase (tanpa uang) |

Kode error: `unauthorized`, `rate_limited`, `invalid_input`, `not_found`, `server_error`. Jangan pernah mengembalikan stack trace atau isi sheet mentah ke klien.

## 8. Keamanan dan Privasi

- Data peserta mencakup anak-anak. Kumpulkan dan tampilkan seminimal mungkin.
- Spreadsheet **tidak** dibagikan ke siapa pun selain pelatih. Script berjalan atas nama pemilik, orang tua tidak pernah menyentuh spreadsheet.
- Semua validasi dan pembatasan data ada di server. Frontend tidak dipercaya.
- Passcode dan token hanya di Script Properties. Jangan taruh di repo, log, atau URL. Tambahkan `.clasp.json` dan file rahasia ke `.gitignore` bila perlu.
- PIN 4 digit lemah secara alami, jadi pembatasan percobaan (6.6) wajib. Jangan log PIN.
- Hanya angka `ID_Siswa` yang ada di QR. Tidak ada data pribadi di dalam QR.
- Semua input dari klien divalidasi (tipe, panjang, format ID/tanggal). Hindari formula injection: awali string yang diawali `=`, `+`, `-`, `@` dengan tanda kutip tunggal sebelum ditulis ke sheet.

## 9. Non-Fungsional

- Mobile-first, lebar 360 px ke atas, tombol besar (minimal 48 px), kontras tinggi (dipakai di aula).
- Scan sampai konfirmasi di layar idealnya di bawah 2 detik di jaringan normal. Cache `bootstrap` di klien; di server cache pembacaan `Siswa` dan `Sesi` (CacheService, 5 menit) dan hapus cache saat ada perubahan.
- Baca data per blok (`getValues` satu kali), jangan baca sel per sel.
- Kompatibel: Chrome Android (utama), Safari iOS (uji), Chrome desktop.
- Aksesibilitas dasar: teks jelas, tidak mengandalkan warna saja (tambah ikon/teks).

## 10. Milestone dan Kriteria Selesai

**M0. Persiapan**
- Repo, `clasp`, buat `CLAUDE.md` (ringkasan aturan, struktur, perintah).
- Perluas rentang rumus ke 10.000 baris di template dan uji ulang rekap.
- Selesai bila: `clasp push` berhasil dan fungsi uji bisa membaca sheet `Siswa` (36 baris).

**M1. Backend inti**
- `coachLogin`, `bootstrap`, `scan` lengkap dengan seluruh aturan 6.3 dan `LockService`.
- Selesai bila: tes manual semua kode respons lolos, dan scan ganda tidak membuat baris ganda.

**M2. Frontend scan**
- Halaman pelatih: login, sesi aktif, scan kamera, feedback, cari manual.
- Selesai bila: scan nyata dari HP Android dan iPhone tercatat di sheet.

**M3. Hadir dan pembayaran**
- Daftar hadir, tandai Lunas (sebagian/penuh), Izin/Sakit, hapus kehadiran, tutup sesi.
- Selesai bila: angka di `Rekap_Pendapatan` sheet cocok dengan yang dilakukan di aplikasi.

**M4. Pendapatan dan sesi**
- Ringkasan bulanan Umum/Khusus, tabel per sesi, tunggakan, kelola sesi (geser/batal).
- Selesai bila: hasil `revenueMonth` sama persis dengan sheet `Ringkasan`.

**M5. Halaman orang tua**
- `parentView`, pembatasan PIN, halaman `ortu.html`.
- Selesai bila: tidak ada field uang di respons, ID lain tidak bisa diakses, dan kunci sementara bekerja.

**M6. Kartu QR**
- Generator PDF 36 kartu. Selesai bila tiap kartu bisa discan oleh dashboard.

**M7. Uji akhir dan serah terima**
- Uji lapangan satu sesi nyata, `docs/DEPLOY.md` (cara deploy ulang dan ganti passcode), P1 (offline, buat jadwal) bila waktu cukup.

## 11. Skenario Uji Wajib

| # | Skenario | Hasil yang diharapkan |
|---|---|---|
| 1 | Scan S001 di sesi Umum hari ini | Baris baru: Hadir, Tarif 15000, Belum, 0 |
| 2 | Scan S001 lagi di sesi yang sama | `duplicate`, tidak ada baris baru |
| 3 | Dua HP scan siswa yang sama bersamaan | Hanya satu baris tercatat |
| 4 | Sesi Khusus, scan siswa bukan peserta | Peringatan + konfirmasi; tanpa konfirmasi tidak tercatat |
| 5 | Scan ID tidak ada (`S999`) / QR bukan format | Pesan error, tidak ada baris |
| 6 | Sesi berstatus Batal | Scan ditolak |
| 7 | Tandai Lunas Rp15.000 untuk tarif 15.000 | Status Lunas; Diterima naik 15.000 |
| 8 | Bayar sebagian Rp10.000 | Status tetap Belum; Piutang 5.000 |
| 9 | Latihan Selasa digeser ke Rabu | Tanggal_Aktual terisi; sesi aktif di hari Rabu; bulan rekap ikut tanggal aktual |
| 10 | Ubah tarif Umum di Pengaturan | Baris lama tetap tarif lama, baris baru tarif baru |
| 11 | Orang tua login benar | Hanya data anaknya, tanpa uang |
| 12 | Orang tua salah PIN 5 kali | Dikunci sementara; PIN benar pun ditolak sampai waktu habis |
| 13 | Token pelatih salah/tidak ada ke `revenueMonth` | `unauthorized` |
| 14 | Jaringan putus saat scan (P1) | Masuk antrean, tersinkron saat online tanpa duplikat |

## 12. Yang Harus Disiapkan Pemilik (Input)

**Wajib sebelum mulai (SUDAH TERPENUHI, dikonfirmasi pemilik)**
| # | Item | Nilai |
|---|---|---|
| 1 | Spreadsheet (Google Sheets, hasil import template) | ID: `1aLPEHwNJGRKLZpnupKEgxm-3inlTfTqjP58BYHYtCLc` |
| 2 | Akun Google pemilik spreadsheet | Ada. Akun yang sama dipakai sebagai pemilik proyek Apps Script |
| 3 | Passcode pelatih | Sudah dipilih pemilik. **Tidak ditulis di mana pun.** Dimasukkan sendiri oleh pemilik ke Script Properties dengan key `COACH_PASSCODE` (Claude Code cukup mengingatkan langkahnya di M1) |
| 4 | HP pelatih | **Android** (target uji utama: Chrome Android; Safari iOS tetap diuji untuk halaman orang tua) |
| 5 | Hosting frontend | **GitHub Pages** (arsitektur utama bagian 4, fallback HTML Service tidak dipakai kecuali kamera gagal) |

Catatan untuk Claude Code: Spreadsheet ID boleh dituliskan di konfigurasi backend (`Code.gs` atau Script Properties `SPREADSHEET_ID`), karena ID hanya alamat file dan bukan kunci akses. Jangan menaruh passcode, token, atau PIN siswa di repo.

**Keputusan (default sudah ditetapkan, ubah kalau tidak cocok)**
| Pertanyaan | Default |
|---|---|
| Pelatih lebih dari satu orang? | Satu passcode bersama; nama pelatih diisi saat login untuk `Dicatat_Oleh` |
| Izin/Sakit dikenai tarif? | Tidak (tarif 0, tidak masuk Seharusnya) |
| Bayar sebagian (cicil) diizinkan? | Ya |
| Scan siswa non-peserta di sesi Khusus | Peringatan + boleh lanjut dengan konfirmasi |
| Scan siswa Nonaktif | Peringatan + boleh lanjut dengan konfirmasi |
| Pendapatan masuk ke bulan mana jika digeser | Mengikuti tanggal aktual |
| Siswa baru di tengah bulan | Ditambah manual di sheet `Siswa` + cetak kartu baru |

**Untuk kartu QR dan tampilan (bisa menyusul)**
- Ukuran/layout kartu: ukuran kartu ID (85,6 x 54 mm) atau stiker/gantungan, dan berapa kartu per lembar A4.
- Logo Putra Setia Rawa Bebek (PNG, latar transparan lebih baik) dan warna utama (kalau mau diseragamkan).
- Nama yang tampil di header aplikasi (contoh: "Absensi Putra Setia Rawa Bebek").
- Teks sambutan/pengumuman untuk halaman orang tua (opsional).
- Data Tingkatan/Sabuk, No HP wali, Tgl Gabung (opsional, bisa kosong).

## 13. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Kamera tidak jalan di iframe Apps Script / Safari iOS | Arsitektur utama memakai frontend statis HTTPS; uji kamera di M2 |
| Batas baris rumus (Absensi 2000, Sesi 100) | Perluas ke 10.000 di M0; pertimbangkan satu file per semester |
| Kuota/kecepatan Apps Script | Cache `Siswa`/`Sesi`, baca per blok, satu pemanggilan per scan |
| PIN 4 digit mudah ditebak | Pembatasan percobaan + respons seragam + tidak ada nominal uang di sisi orang tua |
| Dua pelatih scan bersamaan | `LockService` + kunci unik (sesi, siswa) |
| Sheet rumus rusak karena tertimpa | Script hanya menulis ke `Absensi`, `Sesi`, `Siswa` (kolom input); tidak pernah ke sheet rumus |
| Data hilang | Backup mingguan (P2) + riwayat versi Google Sheets |
| QR rusak/kartu hilang | Pencarian manual; cetak ulang kartu dari generator |

## 14. Prompt Awal untuk Claude Code

Tempel ini saat sesi pertama di folder repo (setelah menaruh `PRD.md`):

> Baca `PRD.md` sampai selesai. Kita kerjakan bertahap sesuai milestone di bagian 10, mulai dari M0. Sebelum menulis kode, ringkas rencanamu untuk M0 dalam beberapa baris dan tanyakan hal yang masih ambigu. Jangan lanjut ke milestone berikutnya sebelum kriteria selesai milestone saat ini terpenuhi dan aku konfirmasi. Jangan pernah menulis passcode, token, atau PIN ke dalam kode atau repo. Jangan ubah nama sheet atau urutan kolom tanpa memberitahuku.
