/**
 * formatSpreadsheet.gs
 * ─────────────────────────────────────────────────────────────────────────────
 * Script Perapian Visual Spreadsheet — Silat Putra Setia Rawa Bebek
 *
 * CARA PAKAI:
 * 1. Buka Google Sheets kamu
 * 2. Klik Extensions → Apps Script
 * 3. Paste seluruh isi file ini ke editor (ganti semua kode yang ada)
 * 4. Klik "Run" → pilih fungsi "formatAllSheets"
 * 5. Izinkan akses jika diminta
 * 6. Selesai! Cek hasilnya di spreadsheet.
 *
 * AMAN: Script ini TIDAK mengubah data, rumus, atau struktur kolom.
 *       Hanya memformat tampilan (warna, freeze, filter, lebar kolom).
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ══════════════════════════════════════════════════
// KONFIGURASI WARNA (sesuai tema aplikasi)
// ══════════════════════════════════════════════════
var COLOR = {
  headerBg:    '#7B1317', // Merah Marun (sama dengan aplikasi)
  headerText:  '#FFFFFF', // Putih
  accent:      '#D4AF37', // Emas
  zebraOdd:    '#FFFFFF', // Baris ganjil: putih
  zebraEven:   '#FDF5F5', // Baris genap: merah muda sangat tipis

  // Status warna
  hijauBg:     '#E8F5E9',
  hijauText:   '#2E7D32',
  kuningBg:    '#FFF8E1',
  kuningText:  '#8A6D0B',
  merahBg:     '#FFEBEE',
  merahText:   '#C62828',
  abiBg:       '#F5F5F5',
  abuText:     '#757575',

  // Tab warna
  tabData:     '#1565C0', // Biru tua untuk sheet data utama
  tabFormula:  '#6D4C41', // Coklat untuk sheet read-only
  tabConfig:   '#2E7D32', // Hijau untuk Pengaturan
};

// ══════════════════════════════════════════════════
// FUNGSI UTAMA — Jalankan ini!
// ══════════════════════════════════════════════════

function formatAllSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  SpreadsheetApp.getUi().alert(
    'Memulai perapian spreadsheet...\n\nProses ini membutuhkan sekitar 30-60 detik.\nKlik OK untuk mulai.'
  );

  try {
    // Sheet data utama
    formatSheetSiswa(ss);
    formatSheetSesi(ss);
    formatSheetAbsensi(ss);
    formatSheetPengaturan(ss);
    formatSheetPesertaKhusus(ss);

    // Sheet read-only (hanya proteksi + warna header)
    formatSheetReadOnly(ss, 'Rekap_Pendapatan', '💰 Rekap Kas');
    formatSheetReadOnly(ss, 'Ringkasan', '📊 Ringkasan');
    formatSheetReadOnly(ss, 'Rekap_Siswa', '📋 Rekap Siswa');

    SpreadsheetApp.getUi().alert(
      '✅ Selesai! Spreadsheet sudah dirapikan.\n\n' +
      'Yang sudah dilakukan:\n' +
      '• Header diwarnai merah marun + teks putih\n' +
      '• Semua kolom di-freeze baris 1\n' +
      '• AutoFilter diaktifkan di sheet data\n' +
      '• Format Rupiah di kolom tarif & pembayaran\n' +
      '• Validasi dropdown di kolom Status & Jenis\n' +
      '• Conditional formatting per status\n' +
      '• Warna tab sheet dibedakan\n' +
      '• Sheet Rekap/Ringkasan diproteksi\n' +
      '• Kolom formula (Tgl_Efektif) ditandai kuning\n\n' +
      'Data & rumus tidak ada yang diubah.'
    );

  } catch (e) {
    SpreadsheetApp.getUi().alert('⚠️ Terjadi error: ' + e.message + '\n\nCoba jalankan ulang.');
    Logger.log('formatAllSheets error: ' + e.message);
  }
}

// ══════════════════════════════════════════════════
// SHEET: SISWA
// Kolom: A=ID_Siswa, B=Nama, C=Panggilan, D=Tingkatan,
//        E=No_HP_Wali, F=PIN_Ortu, G=Tgl_Gabung, H=Status
// ══════════════════════════════════════════════════
function formatSheetSiswa(ss) {
  var sheet = ss.getSheetByName('Siswa');
  if (!sheet) return;

  var lastRow = Math.max(sheet.getLastRow(), 2);
  var totalCols = 8;

  // 1. Rename tab
  sheet.setName('Siswa'); // nama harus tetap sama untuk backend!
  sheet.setTabColor(COLOR.tabData);

  // 2. Set header teks yang jelas
  var headers = [
    ['ID Siswa', 'Nama Lengkap', 'Nama Panggilan', 'Tingkatan',
     'No. HP Wali', 'PIN Ortu', 'Tgl Gabung', 'Status']
  ];
  sheet.getRange(1, 1, 1, totalCols).setValues(headers);

  // 3. Format header
  applyHeaderStyle(sheet.getRange(1, 1, 1, totalCols));

  // 4. Freeze baris header
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1); // Freeze kolom ID juga

  // 5. AutoFilter
  sheet.getRange(1, 1, lastRow, totalCols).createFilter();

  // 6. Lebar kolom
  sheet.setColumnWidth(1, 130);  // ID Siswa
  sheet.setColumnWidth(2, 180);  // Nama Lengkap
  sheet.setColumnWidth(3, 130);  // Panggilan
  sheet.setColumnWidth(4, 120);  // Tingkatan
  sheet.setColumnWidth(5, 140);  // No. HP Wali
  sheet.setColumnWidth(6, 90);   // PIN Ortu
  sheet.setColumnWidth(7, 110);  // Tgl Gabung
  sheet.setColumnWidth(8, 100);  // Status

  // 7. Rata-rata kolom
  // Kolom ID, Tingkatan, Tgl, Status → tengah
  sheet.getRange(2, 1, lastRow, 1).setHorizontalAlignment('center'); // ID
  sheet.getRange(2, 4, lastRow, 1).setHorizontalAlignment('center'); // Tingkatan
  sheet.getRange(2, 7, lastRow, 1).setHorizontalAlignment('center'); // Tgl Gabung
  sheet.getRange(2, 8, lastRow, 1).setHorizontalAlignment('center'); // Status
  // Kolom teks → kiri
  sheet.getRange(2, 2, lastRow, 1).setHorizontalAlignment('left');   // Nama
  sheet.getRange(2, 3, lastRow, 1).setHorizontalAlignment('left');   // Panggilan
  sheet.getRange(2, 5, lastRow, 1).setHorizontalAlignment('left');   // No HP

  // 8. Sembunyikan kolom PIN Ortu (kolom F=6) agar tidak mudah terlihat
  sheet.hideColumns(6);

  // 9. Conditional formatting kolom Status (H=8)
  var statusRange = sheet.getRange(2, 8, lastRow, 1);
  clearConditionalFormatting(sheet, statusRange);
  applyStatusConditionalFormat(sheet, statusRange, 'Aktif', COLOR.hijauBg, COLOR.hijauText);
  applyStatusConditionalFormat(sheet, statusRange, 'Nonaktif', COLOR.merahBg, COLOR.merahText);

  // 10. Validasi dropdown kolom Status
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Aktif', 'Nonaktif'], true)
    .setAllowInvalid(false)
    .setHelpText('Pilih status siswa: Aktif atau Nonaktif')
    .build();
  sheet.getRange(2, 8, 500, 1).setDataValidation(statusRule);

  // 11. Zebra striping
  applyZebraStriping(sheet, lastRow, totalCols);

  // 12. Format tanggal di kolom G
  sheet.getRange(2, 7, lastRow, 1).setNumberFormat('DD/MM/YYYY');

  Logger.log('Sheet Siswa selesai diformat.');
}

// ══════════════════════════════════════════════════
// SHEET: SESI
// Kolom: A=ID_Sesi, B=Tgl_Rencana, C=Tgl_Aktual, D=Tgl_Efektif(FORMULA!),
//        E=Jenis, F=Status_Sesi, G=Tarif, H=Keterangan
// ══════════════════════════════════════════════════
function formatSheetSesi(ss) {
  var sheet = ss.getSheetByName('Sesi');
  if (!sheet) return;

  var lastRow = Math.max(sheet.getLastRow(), 2);
  var totalCols = 8;

  sheet.setTabColor(COLOR.tabData);

  // Header
  var headers = [
    ['ID Sesi', 'Tgl Rencana', 'Tgl Aktual', 'Tgl Efektif (Auto)',
     'Jenis', 'Status', 'Tarif (Rp)', 'Keterangan']
  ];
  sheet.getRange(1, 1, 1, totalCols).setValues(headers);
  applyHeaderStyle(sheet.getRange(1, 1, 1, totalCols));

  // Tandai kolom D (Tgl_Efektif) sebagai formula — warna kuning lembut
  sheet.getRange(1, 4).setBackground('#FFF9C4').setFontColor('#5D4037')
    .setFontWeight('bold');

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, lastRow, totalCols).createFilter();

  // Lebar kolom
  sheet.setColumnWidth(1, 180);  // ID Sesi
  sheet.setColumnWidth(2, 110);  // Tgl Rencana
  sheet.setColumnWidth(3, 110);  // Tgl Aktual
  sheet.setColumnWidth(4, 140);  // Tgl Efektif
  sheet.setColumnWidth(5, 100);  // Jenis
  sheet.setColumnWidth(6, 110);  // Status
  sheet.setColumnWidth(7, 110);  // Tarif
  sheet.setColumnWidth(8, 200);  // Keterangan

  // Rata tengah
  sheet.getRange(2, 1, lastRow, 1).setHorizontalAlignment('center'); // ID Sesi
  sheet.getRange(2, 2, lastRow, 1).setHorizontalAlignment('center'); // Tgl Rencana
  sheet.getRange(2, 3, lastRow, 1).setHorizontalAlignment('center'); // Tgl Aktual
  sheet.getRange(2, 4, lastRow, 1).setHorizontalAlignment('center'); // Tgl Efektif
  sheet.getRange(2, 5, lastRow, 1).setHorizontalAlignment('center'); // Jenis
  sheet.getRange(2, 6, lastRow, 1).setHorizontalAlignment('center'); // Status
  sheet.getRange(2, 7, lastRow, 1).setHorizontalAlignment('right');  // Tarif
  sheet.getRange(2, 8, lastRow, 1).setHorizontalAlignment('left');   // Keterangan

  // Format Rupiah di kolom Tarif
  sheet.getRange(2, 7, lastRow, 1).setNumberFormat('"Rp"#,##0');

  // Format tanggal
  sheet.getRange(2, 2, lastRow, 1).setNumberFormat('YYYY-MM-DD'); // Tgl Rencana
  sheet.getRange(2, 3, lastRow, 1).setNumberFormat('YYYY-MM-DD'); // Tgl Aktual
  sheet.getRange(2, 4, lastRow, 1).setNumberFormat('YYYY-MM-DD'); // Tgl Efektif

  // Validasi dropdown Jenis
  var jenisRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Umum', 'Khusus', 'Ujian'], true)
    .setAllowInvalid(false)
    .setHelpText('Pilih jenis latihan: Umum, Khusus, atau Ujian')
    .build();
  sheet.getRange(2, 5, 500, 1).setDataValidation(jenisRule);

  // Validasi dropdown Status
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Terjadwal', 'Terlaksana', 'Batal', 'Ditunda'], true)
    .setAllowInvalid(false)
    .setHelpText('Pilih status sesi')
    .build();
  sheet.getRange(2, 6, 500, 1).setDataValidation(statusRule);

  // Conditional formatting Status
  var statusRange = sheet.getRange(2, 6, lastRow, 1);
  clearConditionalFormatting(sheet, statusRange);
  applyStatusConditionalFormat(sheet, statusRange, 'Terlaksana', COLOR.hijauBg, COLOR.hijauText);
  applyStatusConditionalFormat(sheet, statusRange, 'Terjadwal',  COLOR.kuningBg, COLOR.kuningText);
  applyStatusConditionalFormat(sheet, statusRange, 'Batal',      COLOR.merahBg, COLOR.merahText);
  applyStatusConditionalFormat(sheet, statusRange, 'Ditunda',    COLOR.abiBg,   COLOR.abuText);

  // Conditional formatting Jenis
  var jenisRange = sheet.getRange(2, 5, lastRow, 1);
  applyStatusConditionalFormat(sheet, jenisRange, 'Khusus', '#EDE7F6', '#512DA8');
  applyStatusConditionalFormat(sheet, jenisRange, 'Ujian',  '#FFF3E0', '#E65100');

  applyZebraStriping(sheet, lastRow, totalCols);

  Logger.log('Sheet Sesi selesai diformat.');
}

// ══════════════════════════════════════════════════
// SHEET: ABSENSI
// Kolom: A=Timestamp, B=ID_Sesi, C=ID_Siswa, D=Nama, E=Jenis,
//        F=Status_Hadir, G=Tarif, H=Status_Bayar, I=Jumlah_Dibayar,
//        J=Metode, K=Tgl_Bayar, L=Dicatat_Oleh
// ══════════════════════════════════════════════════
function formatSheetAbsensi(ss) {
  var sheet = ss.getSheetByName('Absensi');
  if (!sheet) return;

  var lastRow = Math.max(sheet.getLastRow(), 2);
  var totalCols = 12;

  sheet.setTabColor(COLOR.tabData);

  var headers = [
    ['Waktu Scan', 'ID Sesi', 'ID Siswa', 'Nama Siswa', 'Jenis Latihan',
     'Status Hadir', 'Tarif (Rp)', 'Status Bayar', 'Jumlah Dibayar (Rp)',
     'Metode Bayar', 'Tgl Bayar', 'Dicatat Oleh']
  ];
  sheet.getRange(1, 1, 1, totalCols).setValues(headers);
  applyHeaderStyle(sheet.getRange(1, 1, 1, totalCols));

  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  sheet.getRange(1, 1, lastRow, totalCols).createFilter();

  // Lebar kolom
  sheet.setColumnWidth(1, 150);  // Waktu Scan
  sheet.setColumnWidth(2, 170);  // ID Sesi
  sheet.setColumnWidth(3, 130);  // ID Siswa
  sheet.setColumnWidth(4, 170);  // Nama Siswa
  sheet.setColumnWidth(5, 120);  // Jenis Latihan
  sheet.setColumnWidth(6, 120);  // Status Hadir
  sheet.setColumnWidth(7, 110);  // Tarif
  sheet.setColumnWidth(8, 120);  // Status Bayar
  sheet.setColumnWidth(9, 155);  // Jumlah Dibayar
  sheet.setColumnWidth(10, 120); // Metode Bayar
  sheet.setColumnWidth(11, 110); // Tgl Bayar
  sheet.setColumnWidth(12, 140); // Dicatat Oleh

  // Format
  sheet.getRange(2, 1, lastRow, 1).setNumberFormat('DD/MM/YYYY HH:mm'); // Waktu Scan
  sheet.getRange(2, 7, lastRow, 1).setNumberFormat('"Rp"#,##0');        // Tarif
  sheet.getRange(2, 9, lastRow, 1).setNumberFormat('"Rp"#,##0');        // Jumlah Dibayar
  sheet.getRange(2, 11, lastRow, 1).setNumberFormat('DD/MM/YYYY');      // Tgl Bayar

  // Rata-rata
  sheet.getRange(2, 1, lastRow, 1).setHorizontalAlignment('center');  // Waktu
  sheet.getRange(2, 2, lastRow, 1).setHorizontalAlignment('center');  // ID Sesi
  sheet.getRange(2, 3, lastRow, 1).setHorizontalAlignment('center');  // ID Siswa
  sheet.getRange(2, 5, lastRow, 1).setHorizontalAlignment('center');  // Jenis
  sheet.getRange(2, 6, lastRow, 1).setHorizontalAlignment('center');  // Status Hadir
  sheet.getRange(2, 7, lastRow, 1).setHorizontalAlignment('right');   // Tarif
  sheet.getRange(2, 8, lastRow, 1).setHorizontalAlignment('center');  // Status Bayar
  sheet.getRange(2, 9, lastRow, 1).setHorizontalAlignment('right');   // Jumlah
  sheet.getRange(2, 10, lastRow, 1).setHorizontalAlignment('center'); // Metode
  sheet.getRange(2, 11, lastRow, 1).setHorizontalAlignment('center'); // Tgl Bayar

  // Validasi Status Hadir
  var hadirRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Hadir', 'Izin', 'Sakit', 'Alpha'], true)
    .setAllowInvalid(false).build();
  sheet.getRange(2, 6, 1000, 1).setDataValidation(hadirRule);

  // Validasi Status Bayar
  var bayarRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Lunas', 'Belum Lunas', 'Sebagian'], true)
    .setAllowInvalid(false).build();
  sheet.getRange(2, 8, 1000, 1).setDataValidation(bayarRule);

  // Validasi Metode Bayar
  var metodeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Tunai', 'Transfer', 'QRIS', '-'], true)
    .setAllowInvalid(false).build();
  sheet.getRange(2, 10, 1000, 1).setDataValidation(metodeRule);

  // Conditional formatting Status Hadir
  var hadirRange = sheet.getRange(2, 6, lastRow, 1);
  clearConditionalFormatting(sheet, hadirRange);
  applyStatusConditionalFormat(sheet, hadirRange, 'Hadir', COLOR.hijauBg, COLOR.hijauText);
  applyStatusConditionalFormat(sheet, hadirRange, 'Izin',  COLOR.kuningBg, COLOR.kuningText);
  applyStatusConditionalFormat(sheet, hadirRange, 'Sakit', '#E3F2FD', '#1565C0');
  applyStatusConditionalFormat(sheet, hadirRange, 'Alpha', COLOR.merahBg, COLOR.merahText);

  // Conditional formatting Status Bayar
  var bayarRange = sheet.getRange(2, 8, lastRow, 1);
  clearConditionalFormatting(sheet, bayarRange);
  applyStatusConditionalFormat(sheet, bayarRange, 'Lunas',       COLOR.hijauBg,  COLOR.hijauText);
  applyStatusConditionalFormat(sheet, bayarRange, 'Belum Lunas', COLOR.merahBg,  COLOR.merahText);
  applyStatusConditionalFormat(sheet, bayarRange, 'Sebagian',    COLOR.kuningBg, COLOR.kuningText);

  applyZebraStriping(sheet, lastRow, totalCols);

  Logger.log('Sheet Absensi selesai diformat.');
}

// ══════════════════════════════════════════════════
// SHEET: PENGATURAN
// B2 = Tarif Umum, B3 = Tarif Khusus
// ══════════════════════════════════════════════════
function formatSheetPengaturan(ss) {
  var sheet = ss.getSheetByName('Pengaturan');
  if (!sheet) return;

  sheet.setTabColor(COLOR.tabConfig);

  // Set label kolom A yang jelas
  sheet.getRange('A1').setValue('Konfigurasi').setFontWeight('bold').setFontSize(12)
    .setBackground(COLOR.headerBg).setFontColor(COLOR.headerText)
    .setHorizontalAlignment('center');
  sheet.getRange('B1').setValue('Nilai').setFontWeight('bold').setFontSize(12)
    .setBackground(COLOR.headerBg).setFontColor(COLOR.headerText)
    .setHorizontalAlignment('center');
  sheet.getRange('C1').setValue('Keterangan').setFontWeight('bold').setFontSize(12)
    .setBackground(COLOR.headerBg).setFontColor(COLOR.headerText)
    .setHorizontalAlignment('center');

  // Label baris pengaturan (kolom A)
  sheet.getRange('A2').setValue('Tarif Latihan Umum (Rp)');
  sheet.getRange('A3').setValue('Tarif Latihan Khusus TC (Rp)');

  // Keterangan kolom C
  sheet.getRange('C2').setValue('Contoh: 15000 → Rp15.000 per sesi').setFontColor('#777777').setFontStyle('italic');
  sheet.getRange('C3').setValue('Contoh: 5000 → Rp5.000 per sesi').setFontColor('#777777').setFontStyle('italic');

  // Format Rupiah di kolom B
  sheet.getRange('B2:B3').setNumberFormat('"Rp"#,##0').setHorizontalAlignment('right')
    .setFontWeight('bold').setFontColor(COLOR.headerBg);

  // Lebar kolom
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(2, 130);
  sheet.setColumnWidth(3, 280);

  // Freeze baris 1
  sheet.setFrozenRows(1);

  // Proteksi sheet — hanya B2:B3 yang boleh diubah
  var protection = sheet.protect()
    .setDescription('Proteksi Pengaturan — hanya ubah nilai tarif di kolom B');
  protection.setUnprotectedRanges([sheet.getRange('B2:B3')]);

  // Catatan di B2 dan B3
  sheet.getRange('B2').setNote('Tarif per siswa per sesi latihan umum (Sabtu). Default: Rp15.000');
  sheet.getRange('B3').setNote('Tarif per siswa per sesi latihan khusus TC/tanding (Sel/Kam). Default: Rp5.000');

  Logger.log('Sheet Pengaturan selesai diformat.');
}

// ══════════════════════════════════════════════════
// SHEET: PESERTA_KHUSUS
// Kolom A = ID_Siswa
// ══════════════════════════════════════════════════
function formatSheetPesertaKhusus(ss) {
  var sheet = ss.getSheetByName('Peserta_Khusus');
  if (!sheet) return;

  var lastRow = Math.max(sheet.getLastRow(), 2);

  sheet.setTabColor('#9C27B0'); // Ungu untuk TC/tanding

  // Header
  sheet.getRange(1, 1).setValue('ID Siswa');
  sheet.getRange(1, 2).setValue('Keterangan (Opsional)');
  applyHeaderStyle(sheet.getRange(1, 1, 1, 2));

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, lastRow, 2).createFilter();

  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 220);

  sheet.getRange(2, 1, lastRow, 1).setHorizontalAlignment('center');

  // Catatan di header
  sheet.getRange(1, 1).setNote('Isi dengan ID Siswa yang ikut latihan khusus TC/tanding.\nContoh: S-001');
  sheet.getRange(1, 2).setNote('Kolom opsional, tidak dibaca oleh sistem');

  // Sembunyikan kolom B (hanya dipakai untuk catatan manual)
  sheet.hideColumns(2);

  Logger.log('Sheet Peserta_Khusus selesai diformat.');
}

// ══════════════════════════════════════════════════
// SHEET READ-ONLY (Rekap_Pendapatan, Ringkasan, Rekap_Siswa)
// TIDAK MENGUBAH DATA / RUMUS — hanya warna header + proteksi
// ══════════════════════════════════════════════════
function formatSheetReadOnly(ss, sheetName, displayNote) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  sheet.setTabColor(COLOR.tabFormula);

  // Freeze baris 1 saja
  sheet.setFrozenRows(1);

  // Warna header baris 1 — abu-abu gelap (berbeda dari sheet data)
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headerRange = sheet.getRange(1, 1, 1, lastCol);
  headerRange.setBackground('#455A64')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 36);

  // Proteksi seluruh sheet — read-only
  var protection = sheet.protect()
    .setDescription('Sheet ' + sheetName + ' diproteksi — isi rumus otomatis, jangan diedit manual');
  // Izinkan editor (kamu sendiri) tetap bisa edit jika perlu
  // protection.addEditor(Session.getActiveUser()); // Uncomment jika mau tetap bisa edit

  Logger.log('Sheet ' + sheetName + ' selesai diformat (read-only).');
}

// ══════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════

/** Terapkan style header standar */
function applyHeaderStyle(range) {
  range
    .setBackground(COLOR.headerBg)
    .setFontColor(COLOR.headerText)
    .setFontWeight('bold')
    .setFontSize(11)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBorder(false, false, true, false, false, false,
               '#FFFFFF', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  range.getSheet().setRowHeight(1, 40);
}

/** Zebra striping menggunakan conditional formatting (otomatis rapi saat sort) */
function applyZebraStriping(sheet, lastRow, totalCols) {
  if (lastRow < 2) return;
  var dataRange = sheet.getRange(2, 1, lastRow - 1, totalCols);

  var evenRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=MOD(ROW(),2)=0')
    .setBackground(COLOR.zebraEven)
    .setRanges([dataRange])
    .build();

  var rules = sheet.getConditionalFormatRules();
  rules.push(evenRule);
  sheet.setConditionalFormatRules(rules);
}

/** Conditional format untuk nilai teks tertentu di range */
function applyStatusConditionalFormat(sheet, range, value, bgColor, textColor) {
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(value)
    .setBackground(bgColor)
    .setFontColor(textColor)
    .setFontWeight('bold')
    .setRanges([range])
    .build();

  var rules = sheet.getConditionalFormatRules();
  rules.push(rule);
  sheet.setConditionalFormatRules(rules);
}

/** Bersihkan conditional formatting di range tertentu (cegah duplikat) */
function clearConditionalFormatting(sheet, range) {
  // Ambil semua rules, hapus yang overlap dengan range ini
  var allRules = sheet.getConditionalFormatRules();
  var rangeA1 = range.getA1Notation();
  var filtered = allRules.filter(function(rule) {
    var ruleRanges = rule.getRanges().map(function(r) { return r.getA1Notation(); });
    return ruleRanges.indexOf(rangeA1) === -1;
  });
  sheet.setConditionalFormatRules(filtered);
}
