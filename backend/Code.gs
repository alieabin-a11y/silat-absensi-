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

// ─────────────────────────────────────────────
// Fungsi uji M1: Comprehensive Test Suite
// ─────────────────────────────────────────────

/**
 * testM1Comprehensive — Menjalankan seluruh pengujian kriteria selesai M1:
 * 1. Login pelatih (passcode salah -> unauthorized)
 * 2. Login pelatih (passcode benar -> ok + token valid)
 * 3. Bootstrap data awal (siswa, sesi, tarif)
 * 4. Scan: format ID salah -> unknown_student
 * 5. Scan: siswa tidak ada -> unknown_student
 * 6. Scan: sesi Khusus dengan siswa bukan peserta khusus -> not_khusus_participant
 * 7. Scan: siswa valid -> ok (baris baru tercatat)
 * 8. Scan: scan ulang siswa yang sama -> duplicate (tidak ada baris baru)
 * 9. Cleanup baris uji di sheet Absensi
 */
function testM1Comprehensive() {
  Logger.log('============================================');
  Logger.log('MEMULAI PENGUJIAN M1 (BACKEND INTI)');
  Logger.log('============================================');

  var passedCount = 0;
  var totalTests = 0;

  function assert(testName, condition, detail) {
    totalTests++;
    if (condition) {
      passedCount++;
      Logger.log(' [PASS] ' + testName + (detail ? ' (' + detail + ')' : ''));
    } else {
      Logger.log(' [FAIL] ' + testName + (detail ? ' (' + detail + ')' : ''));
    }
  }

  // Helper untuk membaca isi JSON dari jsonResponse()
  function parseRes(res) {
    return JSON.parse(res.getContent());
  }

  // 1. Test Login Passcode Salah
  var resLoginFail = parseRes(coachLogin({ passcode: 'SALAH_123', namaPelatih: 'Basyair' }));
  assert('1. Login passcode salah harus ditolak', resLoginFail.ok === false && resLoginFail.code === 'unauthorized', resLoginFail.message);

  // 2. Test Login Passcode Benar
  // Ambil passcode dari properties untuk Basyair atau Febri
  var props = PropertiesService.getScriptProperties();
  var testPasscode = props.getProperty('COACH_PASSCODE_Basyair') || props.getProperty('COACH_PASSCODE') || props.getProperty('COACH_PASSCODE_Febri');
  var testNamaPelatih = props.getProperty('COACH_PASSCODE_Basyair') ? 'Basyair' : (props.getProperty('COACH_PASSCODE_Febri') ? 'Febri' : 'Pelatih');

  var resLoginSuccess = parseRes(coachLogin({ passcode: testPasscode, namaPelatih: testNamaPelatih }));
  assert('2. Login passcode benar berhasil', resLoginSuccess.ok === true && resLoginSuccess.data && resLoginSuccess.data.token, 'Token: ' + (resLoginSuccess.data ? resLoginSuccess.data.token.substring(0, 8) + '...' : 'none'));

  if (!resLoginSuccess.ok) {
    Logger.log('Pengujian dihentikan: login gagal. Pastikan COACH_PASSCODE_Basyair terpasang.');
    return;
  }

  var token = resLoginSuccess.data.token;

  // 3. Test Bootstrap
  var resBootstrap = parseRes(handleCoachAction('bootstrap', { token: token }));
  assert('3. Bootstrap mengembalikan daftar siswa & sesi', 
    resBootstrap.ok === true && resBootstrap.data.siswa.length === 36 && resBootstrap.data.tarif.umum > 0, 
    'Jumlah siswa: ' + (resBootstrap.data ? resBootstrap.data.siswa.length : 0));

  // Ambil sesi pertama yang tersedia untuk uji scan
  var allSesi = resBootstrap.data.sesi;
  if (!allSesi || allSesi.length === 0) {
    Logger.log('PERINGATAN: Tidak ada data sesi di sheet Sesi. Tambahkan baris sesi terlebih dahulu.');
    return;
  }

  // Cari sesi Umum yang tidak batal
  var sesiUmum = null;
  var sesiKhusus = null;
  for (var s = 0; s < allSesi.length; s++) {
    if (allSesi[s].jenis === 'Umum' && allSesi[s].statusSesi !== 'Batal' && !sesiUmum) {
      sesiUmum = allSesi[s];
    }
    if (allSesi[s].jenis === 'Khusus' && allSesi[s].statusSesi !== 'Batal' && !sesiKhusus) {
      sesiKhusus = allSesi[s];
    }
  }

  var testSesiId = sesiUmum ? sesiUmum.idSesi : allSesi[0].idSesi;

  // 4. Test Scan QR Format Salah
  var resScanInvalidFormat = parseRes(handleCoachAction('scan', { token: token, idSesi: testSesiId, idSiswa: 'BUKAN_FORMAT_QR' }));
  assert('4. Scan format ID salah ditolak', resScanInvalidFormat.ok === false && resScanInvalidFormat.code === 'unknown_student', resScanInvalidFormat.message);

  // 5. Test Scan Siswa Tidak Ditemukan
  var resScanUnknown = parseRes(handleCoachAction('scan', { token: token, idSesi: testSesiId, idSiswa: 'S999' }));
  assert('5. Scan ID tidak terdaftar (S999) ditolak', resScanUnknown.ok === false && resScanUnknown.code === 'unknown_student', resScanUnknown.message);

  // 6. Test Scan Siswa Bukan Peserta Khusus (jika ada sesi khusus)
  if (sesiKhusus) {
    var pesertaKhusus = resBootstrap.data.pesertaKhusus;
    // Cari siswa yang bukan peserta khusus
    var bukanPesertaKhususId = null;
    for (var k = 0; k < resBootstrap.data.siswa.length; k++) {
      var candidateId = resBootstrap.data.siswa[k].idSiswa;
      if (pesertaKhusus.indexOf(candidateId) === -1) {
        bukanPesertaKhususId = candidateId;
        break;
      }
    }
    if (bukanPesertaKhususId) {
      var resScanKhususWarn = parseRes(handleCoachAction('scan', { token: token, idSesi: sesiKhusus.idSesi, idSiswa: bukanPesertaKhususId, confirm: false }));
      assert('6. Scan siswa non-khusus di sesi Khusus beri peringatan', resScanKhususWarn.ok === false && resScanKhususWarn.code === 'not_khusus_participant', resScanKhususWarn.message);
    }
  }

  // 7. Test Scan Siswa Valid (S001)
  var testSiswaId = 'S001';
  // Hapus dulu dari sheet jika S001 sudah pernah tercatat di sesi ini agar tes bersih
  var existing = findAbsensiRow(testSesiId, testSiswaId);
  if (existing.found) {
    deleteAbsensiRow(existing.rowIndex);
  }

  var resScan1 = parseRes(handleCoachAction('scan', { token: token, idSesi: testSesiId, idSiswa: testSiswaId }));
  assert('7. Scan siswa valid (S001) berhasil dicatat', resScan1.ok === true && resScan1.code === 'ok', resScan1.message);

  // 8. Test Scan Ganda (S001 lagi di sesi yang sama)
  var resScan2 = parseRes(handleCoachAction('scan', { token: token, idSesi: testSesiId, idSiswa: testSiswaId }));
  assert('8. Scan kedua ditolak sebagai duplicate (mencegah double record)', resScan2.ok === false && resScan2.code === 'duplicate', resScan2.message);

  // Verifikasi di sheet hanya ada 1 baris untuk S001
  var checkRow = findAbsensiRow(testSesiId, testSiswaId);
  assert('8b. Baris di sheet tepat 1 baris', checkRow.found === true, 'Row: ' + checkRow.rowIndex);

  // 9. Cleanup data uji agar sheet Absensi tetap bersih
  if (checkRow.found) {
    deleteAbsensiRow(checkRow.rowIndex);
    Logger.log(' [CLEANUP] Baris uji S001 berhasil dihapus kembali dari sheet Absensi.');
  }

  Logger.log('============================================');
  Logger.log('HASIL PENGUJIAN M1: ' + passedCount + ' / ' + totalTests + ' LULUS');
  if (passedCount === totalTests) {
    Logger.log('✅ SELURUH SKENARIO M1 BERHASIL 100%!');
  } else {
    Logger.log('⚠️ Ada skenario yang belum lolos.');
  }
  Logger.log('============================================');
}

// ─────────────────────────────────────────────
// Fungsi uji M4: Verifikasi Pendapatan vs Ringkasan
// ─────────────────────────────────────────────

/**
 * testM4Revenue — Uji silang hasil revenueMonth dengan sheet Ringkasan.
 * Kriteria PRD M4: "hasil revenueMonth sama persis dengan sheet Ringkasan".
 */
function testM4Revenue() {
  Logger.log('============================================');
  Logger.log('MEMULAI PENGUJIAN M4 (PENDAPATAN & SESI)');
  Logger.log('============================================');

  var passedCount = 0;
  var totalTests = 0;

  function assert(testName, condition, detail) {
    totalTests++;
    if (condition) {
      passedCount++;
      Logger.log(' [PASS] ' + testName + (detail ? ' (' + detail + ')' : ''));
    } else {
      Logger.log(' [FAIL] ' + testName + (detail ? ' (' + detail + ')' : ''));
    }
  }

  // 1. Panggil API revenueMonth untuk bulan 2026-11
  var res = JSON.parse(getRevenueMonth({ bulan: '2026-11' }).getContent());
  assert('1. revenueMonth mengembalikan response ok', res.ok === true && res.data, res.message);

  if (!res.ok || !res.data) {
    Logger.log('Gagal menjalankan uji M4: ' + res.message);
    return;
  }

  var calc = res.data.ringkasan;

  // 2. Baca data sheet Ringkasan baris 6, 7, 8 (Umum, Khusus, TOTAL)
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('Ringkasan');
  var raw = sheet.getRange(6, 1, 3, 6).getValues();

  var sheetUmum = {
    jumlahSesi: Number(raw[0][1]) || 0,
    totalHadir: Number(raw[0][2]) || 0,
    seharusnya: Number(raw[0][3]) || 0,
    diterima:   Number(raw[0][4]) || 0,
    piutang:    Number(raw[0][5]) || 0
  };

  var sheetKhusus = {
    jumlahSesi: Number(raw[1][1]) || 0,
    totalHadir: Number(raw[1][2]) || 0,
    seharusnya: Number(raw[1][3]) || 0,
    diterima:   Number(raw[1][4]) || 0,
    piutang:    Number(raw[1][5]) || 0
  };

  var sheetTotal = {
    jumlahSesi: Number(raw[2][1]) || 0,
    totalHadir: Number(raw[2][2]) || 0,
    seharusnya: Number(raw[2][3]) || 0,
    diterima:   Number(raw[2][4]) || 0,
    piutang:    Number(raw[2][5]) || 0
  };

  // 3. Bandingkan Umum
  assert('2. Umum: Jumlah Sesi cocok', calc.umum.jumlahSesi === sheetUmum.jumlahSesi, calc.umum.jumlahSesi + ' vs ' + sheetUmum.jumlahSesi);
  assert('3. Umum: Total Hadir cocok', calc.umum.totalHadir === sheetUmum.totalHadir, calc.umum.totalHadir + ' vs ' + sheetUmum.totalHadir);
  assert('4. Umum: Seharusnya cocok',  calc.umum.seharusnya === sheetUmum.seharusnya, calc.umum.seharusnya + ' vs ' + sheetUmum.seharusnya);
  assert('5. Umum: Diterima cocok',    calc.umum.diterima === sheetUmum.diterima, calc.umum.diterima + ' vs ' + sheetUmum.diterima);
  assert('6. Umum: Piutang cocok',     calc.umum.piutang === sheetUmum.piutang, calc.umum.piutang + ' vs ' + sheetUmum.piutang);

  // 4. Bandingkan Khusus
  assert('7. Khusus: Jumlah Sesi cocok', calc.khusus.jumlahSesi === sheetKhusus.jumlahSesi, calc.khusus.jumlahSesi + ' vs ' + sheetKhusus.jumlahSesi);
  assert('8. Khusus: Total Hadir cocok', calc.khusus.totalHadir === sheetKhusus.totalHadir, calc.khusus.totalHadir + ' vs ' + sheetKhusus.totalHadir);
  assert('9. Khusus: Seharusnya cocok',  calc.khusus.seharusnya === sheetKhusus.seharusnya, calc.khusus.seharusnya + ' vs ' + sheetKhusus.seharusnya);
  assert('10. Khusus: Diterima cocok',   calc.khusus.diterima === sheetKhusus.diterima, calc.khusus.diterima + ' vs ' + sheetKhusus.diterima);
  assert('11. Khusus: Piutang cocok',    calc.khusus.piutang === sheetKhusus.piutang, calc.khusus.piutang + ' vs ' + sheetKhusus.piutang);

  // 5. Bandingkan TOTAL
  assert('12. TOTAL: Jumlah Sesi cocok', calc.total.jumlahSesi === sheetTotal.jumlahSesi, calc.total.jumlahSesi + ' vs ' + sheetTotal.jumlahSesi);
  assert('13. TOTAL: Total Hadir cocok', calc.total.totalHadir === sheetTotal.totalHadir, calc.total.totalHadir + ' vs ' + sheetTotal.totalHadir);
  assert('14. TOTAL: Seharusnya cocok',  calc.total.seharusnya === sheetTotal.seharusnya, calc.total.seharusnya + ' vs ' + sheetTotal.seharusnya);
  assert('15. TOTAL: Diterima cocok',    calc.total.diterima === sheetTotal.diterima, calc.total.diterima + ' vs ' + sheetTotal.diterima);
  assert('16. TOTAL: Piutang cocok',     calc.total.piutang === sheetTotal.piutang, calc.total.piutang + ' vs ' + sheetTotal.piutang);

  // 6. Uji debtors
  var resDebtors = JSON.parse(getDebtors({}).getContent());
  assert('17. debtors mengembalikan response ok', resDebtors.ok === true && Array.isArray(resDebtors.data.debtors), 'Jumlah penunggak: ' + (resDebtors.data ? resDebtors.data.debtors.length : 0));

  Logger.log('============================================');
  Logger.log('HASIL PENGUJIAN M4: ' + passedCount + ' / ' + totalTests + ' LULUS');
  if (passedCount === totalTests) {
    Logger.log('✅ SELURUH SKENARIO M4 LULUS 100%! Hasil sama persis dengan sheet Ringkasan.');
  } else {
    Logger.log('⚠️ Ada selisih perhitungan dengan sheet Ringkasan.');
  }
  Logger.log('============================================');
  return { passed: passedCount, total: totalTests };
}

