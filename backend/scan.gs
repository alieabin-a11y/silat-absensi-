/**
 * scan.gs — Logika scan QR dan Bootstrap untuk pelatih
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 *
 * M1: Bootstrap dan Scan lengkap dengan seluruh aturan 6.3 dan LockService.
 */

// ─────────────────────────────────────────────
// Bootstrap Pelatih
// ─────────────────────────────────────────────

/**
 * Aksi: bootstrap
 * Mengambil data awal untuk dashboard pelatih:
 * - Daftar siswa (tanpa PIN untuk privasi)
 * - Daftar semua sesi
 * - Sesi aktif hari ini (jika ada)
 * - Daftar ID siswa peserta khusus
 * - Tarif dari Pengaturan
 */
function getBootstrap(body, namaPelatih) {
  try {
    var allSiswa = getAllSiswa();
    // JANGAN kirim PIN ke frontend (privasi)
    var siswaList = allSiswa.map(function(s) {
      return {
        idSiswa:   s.idSiswa,
        nama:      s.nama,
        panggilan: s.panggilan,
        tingkatan: s.tingkatan,
        status:    s.status
      };
    });

    var allSesi = getAllSesi();
    var sesiAktif = getSesiAktifHariIni();
    var pesertaKhusus = getPesertaKhusus();
    var tarif = getTarif();

    return jsonResponse(true, 'ok', 'Bootstrap berhasil.', {
      namaPelatih:   namaPelatih,
      siswa:         siswaList,
      sesi:          allSesi,
      sesiAktif:     sesiAktif,
      pesertaKhusus: pesertaKhusus,
      tarif:         tarif,
      today:         todayWIB()
    });
  } catch (err) {
    logError('getBootstrap error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal memuat data awal.', null);
  }
}

// ─────────────────────────────────────────────
// Scan QR Absensi (Sesuai Aturan PRD 6.3)
// ─────────────────────────────────────────────

/**
 * Aksi: scan
 * Params: { idSesi, idSiswa, confirm? }
 *
 * Aturan Alur 6.3:
 * 1. Format ID_Siswa harus valid (^S\d{3,}$, contoh S001). Format lain -> unknown_student.
 * 2. Sesi ada dan statusnya bukan Batal. Jika Batal -> session_cancelled.
 * 3. Siswa ada di sheet Siswa. Jika tidak -> unknown_student.
 * 4. Status siswa Aktif. Jika Nonaktif && !confirm -> inactive.
 * 5. Jika sesi Khusus dan siswa bukan di Peserta_Khusus && !confirm -> not_khusus_participant.
 * 6. LockService: cek duplikat pasangan (idSesi, idSiswa). Jika sudah ada -> duplicate (tampilkan jam pertama).
 * 7. Tulis 1 baris ke Absensi: Hadir, Tarif sesi, Belum, Jumlah_Dibayar = 0.
 */
function handleScan(body, namaPelatih) {
  var idSesi  = body.idSesi;
  var idSiswa = body.idSiswa;
  var confirm = body.confirm === true;

  // 1. Validasi format ID Siswa
  if (!idSiswa || typeof idSiswa !== 'string' || !isValidStudentId(idSiswa.trim())) {
    return jsonResponse(false, 'unknown_student', 'QR tidak dikenali (format ID salah).', null);
  }
  idSiswa = idSiswa.trim();

  // Validasi ID Sesi
  if (!idSesi || typeof idSesi !== 'string') {
    return jsonResponse(false, 'invalid_input', 'ID Sesi wajib diisi.', null);
  }
  idSesi = idSesi.trim();

  // 2. Cek Sesi
  var sesi = getSesiById(idSesi);
  if (!sesi) {
    return jsonResponse(false, 'not_found', 'Sesi tidak ditemukan.', null);
  }
  if (sesi.statusSesi === 'Batal') {
    return jsonResponse(false, 'session_cancelled', 'Sesi ini telah dibatalkan.', {
      idSesi: idSesi,
      statusSesi: sesi.statusSesi
    });
  }

  // 3. Cek Siswa di sheet Siswa
  var siswa = getSiswaById(idSiswa);
  if (!siswa) {
    return jsonResponse(false, 'unknown_student', 'Siswa dengan ID ' + idSiswa + ' tidak ditemukan.', {
      idSiswa: idSiswa
    });
  }

  // 4. Cek Status Siswa Aktif vs Nonaktif
  if (siswa.status === 'Nonaktif' && !confirm) {
    return jsonResponse(false, 'inactive', 'Siswa berstatus Nonaktif. Tetap lanjutkan absensi?', {
      idSiswa:   siswa.idSiswa,
      nama:      siswa.nama,
      panggilan: siswa.panggilan,
      status:    siswa.status
    });
  }

  // 5. Cek Peserta Khusus jika sesi berjenis Khusus
  if (sesi.jenis === 'Khusus') {
    var pesertaKhusus = getPesertaKhusus();
    var isKhusus = pesertaKhusus.indexOf(idSiswa) !== -1;
    if (!isKhusus && !confirm) {
      return jsonResponse(false, 'not_khusus_participant', 'Bukan peserta turnamen khusus. Tetap catat kehadiran?', {
        idSiswa:   siswa.idSiswa,
        nama:      siswa.nama,
        panggilan: siswa.panggilan,
        jenisSesi: sesi.jenis
      });
    }
  }

  // 6 & 7. Penulisan ke sheet dengan LockService (mencegah double record saat scan bersamaan)
  var lock = LockService.getScriptLock();
  var hasLock = false;

  try {
    hasLock = lock.tryLock(20000); // Tunggu sampai 20 detik jika sedang ada penulisan lain
    if (!hasLock) {
      return jsonResponse(false, 'server_busy', 'Server sedang sibuk, silakan coba scan lagi.', null);
    }

    // Cek duplikasi pasangan (idSesi, idSiswa) di sheet Absensi
    var dup = findAbsensiRow(idSesi, idSiswa);
    if (dup.found) {
      return jsonResponse(false, 'duplicate', 'Siswa sudah tercatat hadir' + (dup.timestamp ? ' pada ' + dup.timestamp : '') + '.', {
        idSesi:    idSesi,
        idSiswa:   idSiswa,
        nama:      siswa.nama,
        panggilan: siswa.panggilan,
        timestamp: dup.timestamp
      });
    }

    // Buat baris baru
    var nowTimestamp = formatTimestampWIB(new Date());
    var tarifSesi = Number(sesi.tarif) || 0;

    var newRecord = {
      timestamp:     nowTimestamp,
      idSesi:        idSesi,
      idSiswa:       idSiswa,
      nama:          siswa.nama,
      jenis:         sesi.jenis,
      statusHadir:   'Hadir',
      tarif:         tarifSesi,
      statusBayar:   'Belum',
      jumlahDibayar: 0,
      metode:        '',
      tglBayar:      '',
      dicatatOleh:   namaPelatih
    };

    var newRow = appendAbsensi(newRecord);

    logInfo('Scan berhasil: ' + idSiswa + ' (' + siswa.nama + ') di sesi ' + idSesi + ' baris ' + newRow);

    return jsonResponse(true, 'ok', (siswa.panggilan || siswa.nama) + ', hadir.', {
      record: newRecord,
      siswa: {
        idSiswa:   siswa.idSiswa,
        nama:      siswa.nama,
        panggilan: siswa.panggilan
      }
    });

  } catch (err) {
    logError('handleScan error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Terjadi kesalahan saat mencatat absensi: ' + err.message, null);
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

// ─────────────────────────────────────────────
// M3: setAttendance — Catat Izin / Sakit manual
// ─────────────────────────────────────────────

/**
 * Aksi: setAttendance
 * Params: { idSesi, idSiswa, statusHadir }
 * statusHadir: 'Izin' | 'Sakit'
 *
 * - Jika baris belum ada: buat baris baru (Tarif=0, Status_Bayar='Belum').
 * - Jika baris sudah ada: update statusHadir, set tarif=0.
 */
function setAttendance(body, namaPelatih) {
  var idSesi      = body.idSesi;
  var idSiswa     = body.idSiswa;
  var statusHadir = body.statusHadir;

  // Validasi input
  if (!idSesi || !idSiswa) {
    return jsonResponse(false, 'invalid_input', 'ID Sesi dan ID Siswa wajib diisi.', null);
  }
  if (statusHadir !== 'Izin' && statusHadir !== 'Sakit') {
    return jsonResponse(false, 'invalid_input', 'statusHadir harus "Izin" atau "Sakit".', null);
  }
  idSesi  = idSesi.trim();
  idSiswa = idSiswa.trim();

  // Validasi format ID Siswa
  if (!isValidStudentId(idSiswa)) {
    return jsonResponse(false, 'unknown_student', 'Format ID Siswa tidak valid.', null);
  }

  // Cek sesi ada
  var sesi = getSesiById(idSesi);
  if (!sesi) {
    return jsonResponse(false, 'not_found', 'Sesi tidak ditemukan.', null);
  }

  // Cek siswa ada
  var siswa = getSiswaById(idSiswa);
  if (!siswa) {
    return jsonResponse(false, 'unknown_student', 'Siswa tidak ditemukan.', null);
  }

  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(20000);
    if (!hasLock) {
      return jsonResponse(false, 'server_busy', 'Server sibuk, coba lagi.', null);
    }

    var existing = findAbsensiRow(idSesi, idSiswa);
    var nowTimestamp = formatTimestampWIB(new Date());

    if (existing.found) {
      // Update baris yang sudah ada
      updateAbsensiRow(existing.rowIndex, {
        statusHadir: statusHadir,
        tarif: 0,
        dicatatOleh: namaPelatih
      });
      logInfo('setAttendance update: ' + idSiswa + ' -> ' + statusHadir + ' di sesi ' + idSesi);
    } else {
      // Buat baris baru
      var newRecord = {
        timestamp:     nowTimestamp,
        idSesi:        idSesi,
        idSiswa:       idSiswa,
        nama:          siswa.nama,
        jenis:         sesi.jenis,
        statusHadir:   statusHadir,
        tarif:         0,
        statusBayar:   'Belum',
        jumlahDibayar: 0,
        metode:        '',
        tglBayar:      '',
        dicatatOleh:   namaPelatih
      };
      appendAbsensi(newRecord);
      logInfo('setAttendance baru: ' + idSiswa + ' -> ' + statusHadir + ' di sesi ' + idSesi);
    }

    return jsonResponse(true, 'ok', siswa.nama + ' dicatat ' + statusHadir + '.', {
      idSesi:      idSesi,
      idSiswa:     idSiswa,
      nama:        siswa.nama,
      statusHadir: statusHadir
    });

  } catch (err) {
    logError('setAttendance error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal menyimpan: ' + err.message, null);
  } finally {
    if (hasLock) lock.releaseLock();
  }
}

// ─────────────────────────────────────────────
// M3: deleteAttendance — Hapus kehadiran siswa
// ─────────────────────────────────────────────

/**
 * Aksi: deleteAttendance
 * Params: { idSesi, idSiswa }
 *
 * Cari baris via findAbsensiRow(), hapus dengan deleteAbsensiRow().
 * Jika tidak ditemukan, return not_found.
 */
function deleteAttendance(body, namaPelatih) {
  var idSesi  = body.idSesi;
  var idSiswa = body.idSiswa;

  if (!idSesi || !idSiswa) {
    return jsonResponse(false, 'invalid_input', 'ID Sesi dan ID Siswa wajib diisi.', null);
  }
  idSesi  = idSesi.trim();
  idSiswa = idSiswa.trim();

  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(20000);
    if (!hasLock) {
      return jsonResponse(false, 'server_busy', 'Server sibuk, coba lagi.', null);
    }

    var existing = findAbsensiRow(idSesi, idSiswa);
    if (!existing.found) {
      return jsonResponse(false, 'not_found', 'Data absensi tidak ditemukan untuk siswa ini di sesi ini.', null);
    }

    deleteAbsensiRow(existing.rowIndex);
    logInfo('deleteAttendance: ' + idSiswa + ' dihapus dari sesi ' + idSesi + ' oleh ' + namaPelatih);

    return jsonResponse(true, 'ok', 'Kehadiran berhasil dihapus.', {
      idSesi:  idSesi,
      idSiswa: idSiswa
    });

  } catch (err) {
    logError('deleteAttendance error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal menghapus: ' + err.message, null);
  } finally {
    if (hasLock) lock.releaseLock();
  }
}

function getSessionAttendance(body) {
  var idSesi = body.idSesi;
  if (!idSesi) {
    return jsonResponse(false, 'invalid_input', 'ID Sesi wajib diisi.', null);
  }
  try {
    var list = getAbsensiSesi(idSesi);
    return jsonResponse(true, 'ok', 'Berhasil memuat absensi sesi.', {
      idSesi: idSesi,
      attendance: list
    });
  } catch (err) {
    logError('getSessionAttendance error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal memuat absensi sesi: ' + err.message, null);
  }
}
