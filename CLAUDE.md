# CLAUDE.md — Panduan Proyek Absensi Silat Putra Setia Rawa Bebek

Baca file ini setiap kali memulai sesi baru. Ikuti semua aturan di bawah.

---

## Ringkasan Proyek

Web app mobile-first untuk absensi latihan silat. Pelatih scan QR kartu siswa via kamera HP, absensi tercatat di Google Sheets. Orang tua bisa cek absensi dan status bayar anak tanpa melihat data keuangan.

**PRD lengkap:** `PRD.md` di root repo (baca PRD.md untuk detail lengkap).

---

## Arsitektur

```
Frontend statis (GitHub Pages)
  ↕ HTTPS POST (Content-Type: text/plain, tanpa preflight CORS)
Google Apps Script Web App
  ↕
Google Sheets (ID: 1aLPEHwNJGRKLZpnupKEgxm-3inlTfTqjP58BYHYtCLc)
```

- Backend: **Google Apps Script** (JavaScript), deploy via `clasp`
- Frontend: **HTML + CSS + JS murni** (tanpa framework, tanpa build step)
- Library CDN dengan versi dipin: `html5-qrcode`, `Chart.js`
- Tool cetak kartu: **Node.js** (`tools/cetak-kartu/`)

---

## Struktur Repo

```
silat-absensi/
  PRD.md
  CLAUDE.md                ← file ini
  .gitignore
  backend/
    appsscript.json        ← timezone Asia/Jakarta, execute as Me
    Code.gs                ← doPost/doGet, routing utama
    auth.gs                ← coachLogin, verifyToken, parentAuth
    sheets.gs              ← helper baca/tulis Sheets
    scan.gs                ← logika scan QR
    revenue.gs             ← perhitungan pendapatan
    parent.gs              ← parentView (tanpa field uang)
    util.gs                ← helper: formatDate, escapeFormula, dll
  frontend/
    index.html             ← halaman pelatih
    ortu.html              ← halaman orang tua
    css/
      style.css
    js/
      app.js               ← logika pelatih
      ortu.js              ← logika orang tua
  tools/
    cetak-kartu/
      generate.js          ← script Node.js cetak PDF kartu QR
      package.json
  docs/
    DEPLOY.md
    TEST.md
```

---

## Aturan Wajib (JANGAN DILANGGAR)

### Keamanan
1. **JANGAN PERNAH** menulis passcode, token, PIN, atau kredensial ke dalam kode atau repo.
2. Passcode pelatih disimpan di **Script Properties** dengan key `COACH_PASSCODE` (diset manual oleh pemilik).
3. Token sesi disimpan di **Script Properties/CacheService** (bukan di kode).
4. `.clasp.json` wajib ada di `.gitignore`.
5. ID Spreadsheet (`1aLPEHwNJGRKLZpnupKEgxm-3inlTfTqjP58BYHYtCLc`) boleh di kode (bukan kunci akses).

### Data & Sheet
6. **JANGAN ubah nama sheet** tanpa memberitahu pemilik (Basyair).
7. **JANGAN ubah urutan kolom** sheet tanpa memberitahu pemilik.
8. Sheet yang boleh ditulis script: `Absensi`, `Sesi`, `Siswa` (kolom input saja).
9. Sheet yang **TIDAK BOLEH** ditulis script: `Rekap_Pendapatan`, `Ringkasan`, `Rekap_Siswa`.
10. Cari baris kosong dengan menghitung kolom A (bukan `getLastRow()` mentah).
11. Baca data per blok (`getValues` satu kali, bukan sel per sel).
12. Semua penulisan ke sheet pakai `LockService`.
13. Hindari formula injection: awali string yang diawali `=`, `+`, `-`, `@` dengan tanda kutip tunggal.

### API
14. Format request: `POST`, body JSON, `Content-Type: text/plain;charset=utf-8`.
15. Format response selalu: `{ "ok": true|false, "code": "...", "message": "...", "data": {...} }`.
16. Semua aksi pelatih butuh `token`. Semua aksi orang tua butuh `idSiswa` + `pin`.
17. **JANGAN** kembalikan stack trace atau isi sheet mentah ke klien.
18. Response `parentView` **dilarang** memuat field uang (tarif, jumlah_dibayar, pendapatan).

### Frontend
19. Mobile-first, lebar minimum 360px, tombol minimal 48px, kontras tinggi.
20. Scan kamera: kamera belakang, terus-menerus, jeda 2 detik antar scan ID yang sama.
21. ID QR format: `^S\d{3,}$` (contoh: `S001`). Format lain diabaikan.
22. Semua validasi juga ada di server (frontend tidak dipercaya).

### Zona Waktu
23. Semua timestamp menggunakan **WIB (Asia/Jakarta)**.
24. Diatur di `appsscript.json`: `"timeZone": "Asia/Jakarta"`.

---

## Sheet & Kolom (Referensi Cepat)

| Sheet | Kolom A | Kolom B | Kolom C | Kolom D | ... |
|---|---|---|---|---|---|
| `Siswa` | ID_Siswa | Nama | Panggilan | Tingkatan | E:No_HP_Wali, F:PIN_Ortu, G:Tgl_Gabung, H:Status |
| `Sesi` | ID_Sesi | Tgl_Rencana | Tgl_Aktual | Tgl_Efektif | E:Jenis, F:Status_Sesi, G:Tarif, H:Keterangan |
| `Absensi` | Timestamp | ID_Sesi | ID_Siswa | Nama | E:Jenis, F:Status_Hadir, G:Tarif, H:Status_Bayar, I:Jumlah_Dibayar, J:Metode, K:Tgl_Bayar, L:Dicatat_Oleh |
| `Pengaturan` | (label) | Nilai | — | — | B2:Tarif Umum(15000), B3:Tarif Khusus(5000) |
| `Peserta_Khusus` | ID_Siswa | Nama(rumus) | — | — | — |

**Kunci unik `Absensi`:** pasangan (`ID_Sesi`, `ID_Siswa`).
**Format ID_Sesi:** `U-YYYY-MM-DD` (Umum) atau `K-YYYY-MM-DD` (Khusus).
**PIN siswa (`Siswa.F`):** baca sebagai **string** (bukan angka).

---

## Perintah Berguna

```bash
# Install clasp (sekali saja)
npm install -g @google/clasp

# Login ke Google
clasp login

# Di folder backend/ — link ke project Apps Script yang sudah ada
clasp clone <SCRIPT_ID>
# atau buat baru:
clasp create --title "Absensi Silat Putra Setia" --type standalone

# Push kode ke Apps Script
cd backend && clasp push

# Lihat log eksekusi
clasp logs

# Buka di browser
clasp open
```

---

## Milestone

| Milestone | Fokus | Kriteria Selesai |
|---|---|---|
| **M0** | Persiapan, struktur repo, clasp, uji baca sheet | `clasp push` berhasil; fungsi uji baca 36 baris `Siswa` |
| **M1** | Backend inti: `coachLogin`, `bootstrap`, `scan` | Semua kode respons lolos; scan ganda tidak bikin baris ganda |
| **M2** | Frontend scan: login, sesi aktif, kamera, feedback | Scan nyata dari Android & iPhone tercatat di sheet |
| **M3** | Hadir & pembayaran: Lunas, Izin/Sakit, hapus, tutup sesi | Angka cocok dengan `Rekap_Pendapatan` sheet |
| **M4** | Pendapatan & kelola sesi | `revenueMonth` sama persis dengan `Ringkasan` sheet |
| **M5** | Halaman orang tua: `parentView`, PIN rate-limit | Tanpa field uang; kunci PIN bekerja |
| **M6** | Kartu QR: PDF 36 kartu | Tiap kartu bisa discan dashboard |
| **M7** | Uji lapangan, `DEPLOY.md`, P1 fitur | Satu sesi nyata tercatat sempurna |

---

## Kontak Pemilik

**Basyair** — tanyakan kalau ada hal yang ambigu sebelum menebak.

