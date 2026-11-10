# Absensi Silat — Putra Setia Rawa Bebek

Web app mobile-first untuk absensi latihan silat. Pelatih scan QR kartu siswa via kamera HP, absensi otomatis tercatat di Google Sheets.

## Struktur Proyek

```
silat-absensi/
  PRD.md              ← dokumen kebutuhan lengkap
  CLAUDE.md           ← panduan untuk AI assistant
  .gitignore
  backend/            ← Google Apps Script (clasp)
  frontend/           ← HTML/CSS/JS (di-host di GitHub Pages)
  tools/cetak-kartu/  ← generator PDF kartu QR (Node.js)
  docs/
    DEPLOY.md         ← panduan deploy lengkap
    TEST.md           ← skenario uji
```

## Quick Start

Lihat [docs/DEPLOY.md](docs/DEPLOY.md) untuk panduan lengkap.

## Teknologi

- **Backend**: Google Apps Script (JavaScript)
- **Frontend**: HTML + CSS + JS murni (GitHub Pages)
- **Database**: Google Sheets
- **QR Scan**: html5-qrcode (CDN)

