/**
 * util.gs — Helper functions yang dipakai oleh semua modul
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 */

// ─────────────────────────────────────────────
// Spreadsheet helpers
// ─────────────────────────────────────────────

/**
 * Buka spreadsheet utama (cached per execution).
 */
var _ss = null;
function getSpreadsheet() {
  if (!_ss) {
    _ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return _ss;
}

/**
 * Hitung baris data terakhir berdasarkan kolom yang terisi.
 * Lebih aman dari getLastRow() karena tidak terhitung baris kosong di tengah.
 * @param {Sheet} sheet
 * @param {string} col  Huruf kolom, contoh 'A'
 * @returns {number} Jumlah baris data (mulai baris 2); 0 jika kosong.
 */
function getLastDataRow(sheet, col) {
  var colIndex = col.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
  var allValues = sheet.getRange(2, colIndex, sheet.getMaxRows() - 1, 1).getValues();
  var last = 0;
  for (var i = allValues.length - 1; i >= 0; i--) {
    if (allValues[i][0] !== '' && allValues[i][0] !== null) {
      last = i + 1; // +1 karena index dari 0, dan baris data mulai di baris 2
      break;
    }
  }
  return last;
}

/**
 * Escape formula injection.
 * String yang diawali =, +, -, @ diberi awalan tanda kutip tunggal.
 */
function escapeFormula(value) {
  if (typeof value === 'string') {
    if (['+', '-', '=', '@'].indexOf(value.charAt(0)) !== -1) {
      return "'" + value;
    }
  }
  return value;
}

// ─────────────────────────────────────────────
// Date & Time helpers (zona waktu: Asia/Jakarta / WIB)
// ─────────────────────────────────────────────

/**
 * Dapatkan tanggal hari ini dalam format YYYY-MM-DD (WIB).
 */
function todayWIB() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
}

/**
 * Format Date object ke string YYYY-MM-DD (WIB).
 */
function formatDateWIB(date) {
  if (!date || !(date instanceof Date)) return '';
  return Utilities.formatDate(date, 'Asia/Jakarta', 'yyyy-MM-dd');
}

/**
 * Format Date object ke timestamp lengkap (WIB).
 * Contoh: "2026-11-10 14:30:00"
 */
function formatTimestampWIB(date) {
  if (!date || !(date instanceof Date)) return '';
  return Utilities.formatDate(date, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
}

/**
 * Parse string tanggal (dari sheet) ke Date object.
 * Menangani Date object langsung maupun string YYYY-MM-DD.
 */
function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Coba parse string
  var d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// ─────────────────────────────────────────────
// Validasi input
// ─────────────────────────────────────────────

/**
 * Validasi format ID_Siswa: harus S diikuti minimal 3 digit angka.
 * Contoh valid: S001, S036, S100
 */
function isValidStudentId(id) {
  return typeof id === 'string' && /^S\d{3,}$/.test(id);
}

/**
 * Validasi format ID_Sesi: U-YYYY-MM-DD atau K-YYYY-MM-DD
 */
function isValidSessionId(id) {
  return typeof id === 'string' && /^[UK]-\d{4}-\d{2}-\d{2}$/.test(id);
}

/**
 * Validasi format tanggal: YYYY-MM-DD
 */
function isValidDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

/**
 * Validasi PIN: string 4 digit angka
 */
function isValidPin(pin) {
  return typeof pin === 'string' && /^\d{4}$/.test(pin);
}

// ─────────────────────────────────────────────
// Token generator
// ─────────────────────────────────────────────

/**
 * Generate token acak (hex 32 karakter).
 */
function generateToken() {
  var chars = '0123456789abcdef';
  var token = '';
  for (var i = 0; i < 32; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

// ─────────────────────────────────────────────
// Logging helper (tidak log data sensitif)
// ─────────────────────────────────────────────

/**
 * Log info (tidak menyertakan PIN, passcode, atau token penuh).
 */
function logInfo(msg) {
  Logger.log('[INFO] ' + msg);
}

function logError(msg) {
  Logger.log('[ERROR] ' + msg);
}

