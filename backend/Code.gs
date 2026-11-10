/**
 * Code.gs — Entry point utama: routing doPost/doGet
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 *
 * ATURAN:
 * - Jangan taruh passcode, token, atau PIN di sini.
 * - Semua validasi dan auth ada di server (file auth.gs).
 * - Response selalu: { ok, code, message, data }
 */

// ID Spreadsheet — boleh hardcode (bukan kunci akses)
var SPREADSHEET_ID = '1aLPEHwNJGRKLZpnupKEgxm-3inlTfTqjP58BYHYtCLc';

// ─────────────────────────────────────────────
// HTTP Entry Points
// ─────────────────────────────────────────────

/**
 * Menangani semua POST request dari frontend.
 * Body: JSON { action, token?, ...params }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (!action) {
      return jsonResponse(false, 'invalid_input', 'Parameter "action" wajib ada.', null);
    }

    // Routing aksi
    switch (action) {
      // ── Aksi publik (tanpa token) ──
      case 'coachLogin':
        return handleCoachLogin(body);

      // ── Aksi orang tua ──
      case 'parentView':
        return handleParentView(body);

      // ── Aksi pelatih (butuh token) ──
      case 'bootstrap':
      case 'scan':
      case 'setAttendance':
      case 'deleteAttendance':
      case 'markPaid':
      case 'sessionAttendance':
      case 'updateSession':
      case 'createSessions':
      case 'revenueMonth':
      case 'debtors':
        return handleCoachAction(action, body);

      default:
        return jsonResponse(false, 'invalid_input', 'Action tidak dikenal: ' + action, null);
    }
  } catch (err) {
    // Jangan kembalikan stack trace ke klien
    Logger.log('doPost error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Terjadi kesalahan di server.', null);
  }
}

/**
 * Menangani GET request (health check saja; data lewat POST).
 */
function doGet(e) {
  return jsonResponse(true, 'ok', 'Absensi Silat API aktif.', {
    app: 'Absensi Putra Setia Rawa Bebek',
    version: '1.0.0'
  });
}

// ─────────────────────────────────────────────
// Router internal (stub — implementasi di file masing-masing)
// ─────────────────────────────────────────────

function handleCoachLogin(body) {
  // Implementasi di auth.gs
  return coachLogin(body);
}

function handleParentView(body) {
  // Implementasi di parent.gs
  return parentView(body);
}

function handleCoachAction(action, body) {
  // Verifikasi token dulu
  var tokenCheck = verifyToken(body.token);
  if (!tokenCheck.ok) {
    return jsonResponse(false, 'unauthorized', 'Token tidak valid atau sudah kedaluwarsa.', null);
  }

  switch (action) {
    case 'bootstrap':       return getBootstrap(body, tokenCheck.namaPelatih);
    case 'scan':            return handleScan(body, tokenCheck.namaPelatih);
    case 'setAttendance':   return setAttendance(body, tokenCheck.namaPelatih);
    case 'deleteAttendance':return deleteAttendance(body, tokenCheck.namaPelatih);
    case 'markPaid':        return markPaid(body, tokenCheck.namaPelatih);
    case 'sessionAttendance': return getSessionAttendance(body);
    case 'updateSession':   return updateSession(body, tokenCheck.namaPelatih);
    case 'createSessions':  return createSessions(body, tokenCheck.namaPelatih);
    case 'revenueMonth':    return getRevenueMonth(body);
    case 'debtors':         return getDebtors(body);
    default:
      return jsonResponse(false, 'invalid_input', 'Action tidak dikenal.', null);
  }
}

// ─────────────────────────────────────────────
// Helper response
// ─────────────────────────────────────────────

/**
 * Membuat ContentService output JSON.
 * Gunakan di SEMUA return doPost/doGet.
 */
function jsonResponse(ok, code, message, data) {
  var payload = JSON.stringify({
    ok: ok,
    code: code,
    message: message,
    data: data || null
  });
  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────
// Fungsi uji M0 — hapus setelah M0 selesai diverifikasi
// ─────────────────────────────────────────────

/**
 * testReadSiswa — Jalankan manual dari Apps Script Editor untuk verifikasi M0.
 * Kriteria selesai M0: fungsi ini berhasil membaca 36 baris Siswa dan log hasilnya.
 */
function testReadSiswa() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('Siswa');

    if (!sheet) {
      Logger.log('ERROR: Sheet "Siswa" tidak ditemukan!');
      return;
    }

    // Baca satu blok (efisien, bukan sel per sel)
    var lastRow = getLastDataRow(sheet, 'A');
    Logger.log('Jumlah baris data di sheet Siswa: ' + lastRow);

    if (lastRow === 0) {
      Logger.log('PERINGATAN: Sheet Siswa kosong (tidak ada data di kolom A mulai baris 2).');
      return;
    }

    // Baca semua data sekaligus (kolom A sampai H, dari baris 2)
    var data = sheet.getRange(2, 1, lastRow, 8).getValues();

    var aktif = 0;
    var nonaktif = 0;
    data.forEach(function(row, i) {
      var idSiswa  = row[0]; // A
      var nama     = row[1]; // B
      var status   = row[7]; // H
      Logger.log((i + 1) + '. ' + idSiswa + ' - ' + nama + ' [' + status + ']');
      if (status === 'Aktif')    aktif++;
      if (status === 'Nonaktif') nonaktif++;
    });

    Logger.log('─────────────────────');
    Logger.log('Total baris: ' + lastRow);
    Logger.log('Aktif: ' + aktif + ' | Nonaktif: ' + nonaktif);
    Logger.log('✅ M0 LULUS: Sheet Siswa berhasil dibaca.');
  } catch (err) {
    Logger.log('ERROR di testReadSiswa: ' + err.message);
  }
}

/**
 * testReadAllSheets — Verifikasi semua sheet wajib ada.
 * Jalankan manual dari Apps Script Editor.
 */
function testReadAllSheets() {
  var required = ['Siswa', 'Sesi', 'Absensi', 'Pengaturan', 'Peserta_Khusus',
                  'Rekap_Pendapatan', 'Ringkasan', 'Rekap_Siswa'];
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var missing = [];

  required.forEach(function(name) {
    var s = ss.getSheetByName(name);
    if (s) {
      Logger.log('✅ ' + name);
    } else {
      Logger.log('❌ ' + name + ' — TIDAK DITEMUKAN');
      missing.push(name);
    }
  });

  if (missing.length === 0) {
    Logger.log('Semua sheet wajib ada. ✅');
  } else {
    Logger.log('Sheet yang hilang: ' + missing.join(', '));
  }
}

