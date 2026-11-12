/**
 * session.gs - Manajemen sesi latihan
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 */

// ─────────────────────────────────────────────
// M3: updateSession - Update status/data sesi
// ─────────────────────────────────────────────

/**
 * Aksi: updateSession
 * Params: { idSesi, statusSesi?, tanggalAktual?, keterangan? }
 *
 * Update kolom yang dikirim saja (surgical). Invalidasi cache setelah update.
 * Return data sesi terbaru.
 */
function updateSession(body, namaPelatih) {
  var idSesi = body.idSesi;
  if (!idSesi || typeof idSesi !== 'string') {
    return jsonResponse(false, 'invalid_input', 'ID Sesi wajib diisi.', null);
  }
  idSesi = idSesi.trim();

  // Cek sesi ada
  var sesi = getSesiById(idSesi);
  if (!sesi) {
    return jsonResponse(false, 'not_found', 'Sesi ' + idSesi + ' tidak ditemukan.', null);
  }

  // Bangun objek update hanya dari field yang dikirim
  var updates = {};
  if (body.statusSesi !== undefined) {
    var validStatus = ['Terjadwal', 'Terlaksana', 'Batal', 'Ditunda'];
    if (validStatus.indexOf(body.statusSesi) === -1) {
      return jsonResponse(false, 'invalid_input', 'statusSesi tidak valid. Pilih: ' + validStatus.join(', '), null);
    }
    updates.statusSesi = body.statusSesi;
  }
  if (body.tanggalAktual !== undefined) {
    updates.tglAktual = body.tanggalAktual;
  }
  if (body.keterangan !== undefined) {
    updates.keterangan = body.keterangan;
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse(false, 'invalid_input', 'Tidak ada field yang diubah.', null);
  }

  try {
    var updated = updateSesiRow(idSesi, updates);
    if (!updated) {
      return jsonResponse(false, 'not_found', 'Sesi tidak ditemukan di sheet.', null);
    }

    logInfo('updateSession: ' + idSesi + ' -> ' + JSON.stringify(updates) + ' oleh ' + namaPelatih);

    // Ambil data sesi terbaru setelah cache di-invalidate oleh updateSesiRow
    var sesiTerbaru = getSesiById(idSesi);

    return jsonResponse(true, 'ok', 'Sesi ' + idSesi + ' berhasil diperbarui.', {
      sesi: sesiTerbaru
    });

  } catch (err) {
    logError('updateSession error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal update sesi: ' + err.message, null);
  }
}

/**
 * Aksi: createSessions / createSession
 * Params: { tanggal, jenis, tarif?, keterangan? }
 *
 * Buat sesi baru langsung dari dashboard pelatih tanpa buka Google Sheets.
 * Return data sesi baru yang baru dibuat.
 */
function createSessions(body, namaPelatih) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return jsonResponse(false, 'server_busy', 'Sistem sedang sibuk, coba beberapa saat lagi.', null);
  }

  try {
    var tanggal = body.tanggal || body.tglRencana;
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(String(tanggal).trim())) {
      return jsonResponse(false, 'invalid_input', 'Format tanggal wajib YYYY-MM-DD.', null);
    }
    tanggal = String(tanggal).trim();

    var jenis = body.jenis ? String(body.jenis).trim() : 'Umum';
    var validJenis = ['Umum', 'Khusus', 'Ujian'];
    if (validJenis.indexOf(jenis) === -1) {
      return jsonResponse(false, 'invalid_input', 'Jenis sesi harus: ' + validJenis.join(', '), null);
    }

    var tarif = 5000;
    if (body.tarif !== undefined && body.tarif !== null && String(body.tarif).trim() !== '') {
      tarif = Number(body.tarif);
      if (isNaN(tarif) || tarif < 0) {
        return jsonResponse(false, 'invalid_input', 'Tarif harus berupa angka positif.', null);
      }
    } else {
      if (jenis === 'Khusus') tarif = 10000;
      else if (jenis === 'Ujian') tarif = 15000;
      else tarif = 5000;
    }

    var keterangan = body.keterangan ? String(body.keterangan).trim() : ('Latihan ' + jenis);

    // Generate ID Sesi unik: SESI-YYYY-MM-DD-U / SESI-YYYY-MM-DD-K / SESI-YYYY-MM-DD-UJ
    var suffix = 'U';
    if (jenis === 'Khusus') suffix = 'K';
    else if (jenis === 'Ujian') suffix = 'UJ';

    var baseId = 'SESI-' + tanggal + '-' + suffix;
    var finalId = baseId;
    var counter = 1;

    // Pastikan ID unik
    while (getSesiById(finalId)) {
      counter++;
      finalId = baseId + counter;
    }

    var rowData = {
      idSesi: finalId,
      tglRencana: tanggal,
      tglAktual: '',
      jenis: jenis,
      statusSesi: 'Terjadwal',
      tarif: tarif,
      keterangan: keterangan
    };

    appendSesi(rowData);
    logInfo('createSession: ' + finalId + ' (' + jenis + ', Rp ' + tarif + ') oleh ' + namaPelatih);

    var sesiBaru = getSesiById(finalId);
    return jsonResponse(true, 'ok', 'Sesi ' + finalId + ' berhasil dibuat.', {
      sesi: sesiBaru
    });

  } catch (err) {
    logError('createSession error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal membuat sesi: ' + err.message, null);
  } finally {
    lock.releaseLock();
  }
}

