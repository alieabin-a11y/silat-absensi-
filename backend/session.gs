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

function createSessions(body, namaPelatih) {
  return jsonResponse(false, 'not_implemented', 'createSessions akan tersedia di M4 (P1).', null);
}
