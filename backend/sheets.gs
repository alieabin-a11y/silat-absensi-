/**
 * sheets.gs — Helper baca/tulis Google Sheets
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 *
 * ATURAN:
 * - Baca data per blok (getValues satu kali), bukan sel per sel.
 * - Semua penulisan pakai LockService di modul masing-masing.
 * - Sheet rumus (Rekap_Pendapatan, Ringkasan, Rekap_Siswa) TIDAK BOLEH ditulis.
 * - Escape formula injection sebelum menulis string ke sheet.
 * - Cache siswa & sesi di CacheService (5 menit), hapus saat ada perubahan.
 */

// Nama sheet (konstan — jangan ubah tanpa memberitahu pemilik)
var SHEET_SISWA            = 'Siswa';
var SHEET_SESI             = 'Sesi';
var SHEET_ABSENSI          = 'Absensi';
var SHEET_PENGATURAN       = 'Pengaturan';
var SHEET_PESERTA_KHUSUS   = 'Peserta_Khusus';
// Sheet di bawah READ-ONLY bagi script:
var SHEET_REKAP_PENDAPATAN = 'Rekap_Pendapatan';
var SHEET_RINGKASAN        = 'Ringkasan';
var SHEET_REKAP_SISWA      = 'Rekap_Siswa';

// Cache key
var CACHE_KEY_SISWA = 'DATA_SISWA';
var CACHE_KEY_SESI  = 'DATA_SESI';
var CACHE_TTL       = 300; // 5 menit

// ─────────────────────────────────────────────
// Baca Siswa
// ─────────────────────────────────────────────

/**
 * Baca semua data siswa dari sheet.
 * Kolom: A=ID_Siswa, B=Nama, C=Panggilan, D=Tingkatan, E=No_HP_Wali,
 *        F=PIN_Ortu, G=Tgl_Gabung, H=Status
 * Mengembalikan array objek siswa.
 * PIN Ortu (kolom F) diinclude untuk kebutuhan auth — JANGAN dikirim ke klien.
 * Dicache 5 menit.
 */
function getAllSiswa() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY_SISWA);
  if (cached) {
    return JSON.parse(cached);
  }

  var sheet = getSpreadsheet().getSheetByName(SHEET_SISWA);
  var lastRow = getLastDataRow(sheet, 'A');
  if (lastRow === 0) return [];

  var data = sheet.getRange(2, 1, lastRow, 8).getValues();
  var result = data
    .filter(function(row) { return row[0] !== ''; })
    .map(function(row) {
      return {
        idSiswa:   String(row[0]).trim(),
        nama:      String(row[1]).trim(),
        panggilan: String(row[2]).trim(),
        tingkatan: String(row[3]).trim(),
        noHpWali:  String(row[4]).trim(),
        pin:       String(row[5]).trim(), // Baca sebagai string
        tglGabung: row[6] ? formatDateWIB(row[6]) : '',
        status:    String(row[7]).trim()  // Aktif / Nonaktif
      };
    });

  // Simpan ke cache (5 menit)
  try {
    cache.put(CACHE_KEY_SISWA, JSON.stringify(result), CACHE_TTL);
  } catch (e) {
    logInfo('Cache siswa terlalu besar, skip cache: ' + e.message);
  }

  return result;
}

/**
 * Cari siswa berdasarkan ID.
 * Mengembalikan objek siswa atau null.
 */
function getSiswaById(idSiswa) {
  var all = getAllSiswa();
  for (var i = 0; i < all.length; i++) {
    if (all[i].idSiswa === idSiswa) return all[i];
  }
  return null;
}

/**
 * Invalidasi cache siswa (panggil setelah ada perubahan data siswa).
 */
function invalidateCacheSiswa() {
  CacheService.getScriptCache().remove(CACHE_KEY_SISWA);
}

// ─────────────────────────────────────────────
// Baca Sesi
// ─────────────────────────────────────────────

/**
 * Baca semua data sesi dari sheet.
 * Kolom: A=ID_Sesi, B=Tgl_Rencana, C=Tgl_Aktual, D=Tgl_Efektif,
 *        E=Jenis, F=Status_Sesi, G=Tarif, H=Keterangan
 * Dicache 5 menit.
 */
function getAllSesi() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY_SESI);
  if (cached) {
    return JSON.parse(cached);
  }

  var sheet = getSpreadsheet().getSheetByName(SHEET_SESI);
  var lastRow = getLastDataRow(sheet, 'A');
  if (lastRow === 0) return [];

  var data = sheet.getRange(2, 1, lastRow, 8).getValues();
  var result = data
    .filter(function(row) { return row[0] !== ''; })
    .map(function(row) {
      return {
        idSesi:       String(row[0]).trim(),
        tglRencana:   row[1] ? formatDateWIB(row[1]) : '',
        tglAktual:    row[2] ? formatDateWIB(row[2]) : '',
        tglEfektif:   row[3] ? formatDateWIB(row[3]) : '',
        jenis:        String(row[4]).trim(),   // Umum / Khusus
        statusSesi:   String(row[5]).trim(),   // Terjadwal / Terlaksana / Batal
        tarif:        Number(row[6]) || 0,
        keterangan:   String(row[7]).trim()
      };
    });

  try {
    cache.put(CACHE_KEY_SESI, JSON.stringify(result), CACHE_TTL);
  } catch (e) {
    logInfo('Cache sesi terlalu besar, skip cache: ' + e.message);
  }

  return result;
}

/**
 * Cari sesi berdasarkan ID.
 */
function getSesiById(idSesi) {
  var all = getAllSesi();
  for (var i = 0; i < all.length; i++) {
    if (all[i].idSesi === idSesi) return all[i];
  }
  return null;
}

/**
 * Cari sesi aktif hari ini (Tgl_Efektif = hari ini, status bukan Batal).
 * Mengembalikan objek sesi atau null.
 */
function getSesiAktifHariIni() {
  var today = todayWIB();
  var all = getAllSesi();
  for (var i = 0; i < all.length; i++) {
    var s = all[i];
    if (s.tglEfektif === today && s.statusSesi !== 'Batal') {
      return s;
    }
  }
  return null;
}

/**
 * Invalidasi cache sesi.
 */
function invalidateCacheSesi() {
  CacheService.getScriptCache().remove(CACHE_KEY_SESI);
}

// ─────────────────────────────────────────────
// Baca Peserta Khusus
// ─────────────────────────────────────────────

/**
 * Baca daftar ID siswa peserta khusus.
 * Kolom A = ID_Siswa.
 */
function getPesertaKhusus() {
  var sheet = getSpreadsheet().getSheetByName(SHEET_PESERTA_KHUSUS);
  var lastRow = getLastDataRow(sheet, 'A');
  if (lastRow === 0) return [];

  var data = sheet.getRange(2, 1, lastRow, 1).getValues();
  return data
    .filter(function(row) { return row[0] !== ''; })
    .map(function(row) { return String(row[0]).trim(); });
}

// ─────────────────────────────────────────────
// Baca Tarif dari Pengaturan
// ─────────────────────────────────────────────

/**
 * Baca tarif dari sheet Pengaturan.
 * B2 = Tarif Umum, B3 = Tarif Khusus.
 */
function getTarif() {
  var sheet = getSpreadsheet().getSheetByName(SHEET_PENGATURAN);
  return {
    umum:   Number(sheet.getRange('B2').getValue()) || 15000,
    khusus: Number(sheet.getRange('B3').getValue()) || 5000
  };
}

// ─────────────────────────────────────────────
// Baca & Tulis Absensi
// ─────────────────────────────────────────────

/**
 * Baca semua absensi untuk satu sesi.
 * Kolom: A=Timestamp, B=ID_Sesi, C=ID_Siswa, D=Nama, E=Jenis,
 *        F=Status_Hadir, G=Tarif, H=Status_Bayar, I=Jumlah_Dibayar,
 *        J=Metode, K=Tgl_Bayar, L=Dicatat_Oleh
 */
function getAbsensiSesi(idSesi) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ABSENSI);
  var lastRow = getLastDataRow(sheet, 'A');
  if (lastRow === 0) return [];

  var data = sheet.getRange(2, 1, lastRow, 12).getValues();
  return data
    .filter(function(row) { return String(row[1]).trim() === idSesi; })
    .map(function(row) {
      return {
        timestamp:    row[0] ? formatTimestampWIB(row[0]) : '',
        idSesi:       String(row[1]).trim(),
        idSiswa:      String(row[2]).trim(),
        nama:         String(row[3]).trim(),
        jenis:        String(row[4]).trim(),
        statusHadir:  String(row[5]).trim(),
        tarif:        Number(row[6]) || 0,
        statusBayar:  String(row[7]).trim(),
        jumlahDibayar:Number(row[8]) || 0,
        metode:       String(row[9]).trim(),
        tglBayar:     row[10] ? formatDateWIB(row[10]) : '',
        dicatatOleh:  String(row[11]).trim()
      };
    });
}

/**
 * Cari baris absensi (idSesi, idSiswa) — mengembalikan { found, rowIndex, data }
 * rowIndex adalah nomor baris di sheet (1-based, mulai 2 untuk data).
 */
function findAbsensiRow(idSesi, idSiswa) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ABSENSI);
  var lastRow = getLastDataRow(sheet, 'A');
  if (lastRow === 0) return { found: false };

  var data = sheet.getRange(2, 1, lastRow, 3).getValues(); // A, B, C saja
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][1]).trim() === idSesi && String(data[i][2]).trim() === idSiswa) {
      return {
        found: true,
        rowIndex: i + 2, // +2: baris data mulai di baris 2 sheet
        sheetRow: i + 2
      };
    }
  }
  return { found: false };
}

/**
 * Tulis baris absensi baru ke sheet.
 * Harus dipanggil di dalam LockService di modul pemanggil.
 * @returns {number} Nomor baris yang baru ditulis.
 */
function appendAbsensi(row) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ABSENSI);
  var lastDataRow = getLastDataRow(sheet, 'A');
  var newRow = lastDataRow + 2; // +2: skip header (baris 1), lalu 1 baris setelah data terakhir

  sheet.getRange(newRow, 1, 1, 12).setValues([[
    escapeFormula(row.timestamp),
    escapeFormula(row.idSesi),
    escapeFormula(row.idSiswa),
    escapeFormula(row.nama),
    escapeFormula(row.jenis),
    escapeFormula(row.statusHadir),
    row.tarif,
    escapeFormula(row.statusBayar),
    row.jumlahDibayar,
    escapeFormula(row.metode),
    escapeFormula(row.tglBayar),
    escapeFormula(row.dicatatOleh)
  ]]);

  return newRow;
}

/**
 * Update kolom tertentu di baris absensi yang sudah ada.
 * @param {number} rowIndex Nomor baris di sheet (1-based)
 * @param {Object} updates  Objek dengan key nama kolom dan value baru
 */
function updateAbsensiRow(rowIndex, updates) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ABSENSI);

  // Map nama kolom ke nomor kolom (1-based)
  var colMap = {
    timestamp:     1,
    idSesi:        2,
    idSiswa:       3,
    nama:          4,
    jenis:         5,
    statusHadir:   6,
    tarif:         7,
    statusBayar:   8,
    jumlahDibayar: 9,
    metode:        10,
    tglBayar:      11,
    dicatatOleh:   12
  };

  Object.keys(updates).forEach(function(key) {
    var col = colMap[key];
    if (col) {
      var val = (typeof updates[key] === 'string')
        ? escapeFormula(updates[key])
        : updates[key];
      sheet.getRange(rowIndex, col).setValue(val);
    }
  });
}

/**
 * Hapus baris absensi (konfirmasi dua langkah dilakukan di frontend & scan.gs).
 */
function deleteAbsensiRow(rowIndex) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_ABSENSI);
  sheet.deleteRow(rowIndex);
}

// ─────────────────────────────────────────────
// Tulis Sesi
// ─────────────────────────────────────────────

/**
 * Update kolom tertentu di baris sesi.
 * Cari baris berdasarkan ID_Sesi.
 */
function updateSesiRow(idSesi, updates) {
  var sheet = getSpreadsheet().getSheetByName(SHEET_SESI);
  var lastRow = getLastDataRow(sheet, 'A');
  if (lastRow === 0) return false;

  var data = sheet.getRange(2, 1, lastRow, 1).getValues();
  var rowIndex = -1;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === idSesi) {
      rowIndex = i + 2; // sheet row (1-based)
      break;
    }
  }
  if (rowIndex === -1) return false;

  var colMap = {
    idSesi:      1,
    tglRencana:  2,
    tglAktual:   3,
    tglEfektif:  4,
    jenis:       5,
    statusSesi:  6,
    tarif:       7,
    keterangan:  8
  };

  Object.keys(updates).forEach(function(key) {
    var col = colMap[key];
    if (col) {
      var val = (typeof updates[key] === 'string')
        ? escapeFormula(updates[key])
        : updates[key];
      sheet.getRange(rowIndex, col).setValue(val);
    }
  });

  invalidateCacheSesi();
  return true;
}

