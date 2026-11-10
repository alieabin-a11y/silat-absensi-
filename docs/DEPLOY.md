# DEPLOY.md — Panduan Deploy & Pemeliharaan

## Prasyarat

- Node.js (v18+) — untuk `clasp` dan tools cetak kartu
- Akun Google yang memiliki Spreadsheet

---

## Langkah 1: Install clasp (sekali saja)

```bash
npm install -g @google/clasp
clasp login
```

Setelah `clasp login`, browser akan terbuka, izinkan akses Google.

---

## Langkah 2: Buat proyek Apps Script baru

1. Buka [script.google.com](https://script.google.com)
2. Klik **New project**
3. Ubah nama proyek menjadi **"Absensi Silat Putra Setia"**
4. Salin **Script ID** dari URL: `https://script.google.com/d/<SCRIPT_ID>/edit`

---

## Langkah 3: Link clasp ke proyek

Di folder `backend/`, buat file `.clasp.json` (tidak dicommit ke GitHub):

```json
{
  "scriptId": "<SCRIPT_ID_DARI_LANGKAH_2>",
  "rootDir": "."
}
```

> ⚠️ File `.clasp.json` sudah ada di `.gitignore` — jangan commit ke repo.

---

## Langkah 4: Push kode ke Apps Script

```bash
cd backend
clasp push
```

Jawab `y` jika diminta konfirmasi overwrite.

---

## Langkah 5: Set Script Properties (WAJIB sebelum deploy)

Di Apps Script Editor:

1. Klik **Project Settings** (ikon gear ⚙️)
2. Gulir ke bagian **Script Properties**
3. Klik **Add script property** dan tambahkan:

| Property | Value |
|---|---|
| `COACH_PASSCODE` | *(passcode pilihan kamu — jangan tulis di sini)* |
| `SPREADSHEET_ID` | `1aLPEHwNJGRKLZpnupKEgxm-3inlTfTqjP58BYHYtCLc` |

> ⚠️ Jangan pernah tulis COACH_PASSCODE di kode, repo, atau dokumen apa pun.

---

## Langkah 6: Uji fungsi testReadSiswa (Kriteria M0)

1. Di Apps Script Editor, buka `Code.gs`
2. Pilih fungsi `testReadSiswa` dari dropdown
3. Klik **Run**
4. Buka **Execution log** — pastikan muncul 36 baris siswa dan ✅ M0 LULUS

---

## Langkah 7: Deploy sebagai Web App

1. Klik **Deploy** → **New deployment**
2. Pilih type: **Web app**
3. Atur:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Klik **Deploy**, salin URL Web App

---

## Langkah 8: Setup GitHub Pages (frontend)

1. Buka repo GitHub kamu
2. Masuk ke **Settings** → **Pages**
3. Source: **Deploy from a branch**
4. Branch: `main`, folder: `/frontend`
5. Salin URL GitHub Pages yang dihasilkan

---

## Langkah 9: Konfigurasi URL API di frontend

Di `frontend/js/app.js`, ubah konstanta:

```javascript
const API_URL = 'https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec';
```

---

## Mengganti Passcode

1. Di Apps Script Editor, ubah nilai `COACH_PASSCODE` di Script Properties
2. Jalankan fungsi `invalidateAllTokens()` dari editor untuk hapus semua token lama
3. Semua pelatih harus login ulang

---

## Troubleshooting

| Masalah | Solusi |
|---|---|
| `clasp push` error "not logged in" | Jalankan `clasp login` lagi |
| Fungsi uji error "tidak bisa buka spreadsheet" | Pastikan akun Google yang login clasp sama dengan pemilik spreadsheet |
| Sheet tidak ditemukan | Cek nama sheet persis sama (case-sensitive) |
| `COACH_PASSCODE belum diset` | Tambahkan di Script Properties (Langkah 5) |

