/**
 * revenue.gs — Logika pembayaran dan pendapatan
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 */

/**
 * Aksi: markPaid
 * Params: { idSesi, idSiswa, jumlah?, metode? }
 *
 * Mengisi kolom Status_Bayar, Jumlah_Dibayar, Metode, Tgl_Bayar pada sheet Absensi.
 * Aturan PRD 6.4:
 * - Status jadi Lunas otomatis kalau Jumlah_Dibayar >= Tarif.
 * - Kalau kurang, tetap Belum dan jumlahnya tersimpan.
 * - Default metode: Tunai. Default jumlah: Tarif sesi.
 */
function markPaid(body, namaPelatih) {
  var idSesi  = body.idSesi;
  var idSiswa = body.idSiswa;

  if (!idSesi || !idSiswa) {
    return jsonResponse(false, 'invalid_input', 'ID Sesi dan ID Siswa wajib diisi.', null);
  }

  var lock = LockService.getScriptLock();
  var hasLock = false;

  try {
    hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return jsonResponse(false, 'server_busy', 'Server sibuk, coba beberapa saat lagi.', null);
    }

    var rowInfo = findAbsensiRow(idSesi, idSiswa);
    if (!rowInfo.found) {
      return jsonResponse(false, 'not_found', 'Data kehadiran siswa belum tercatat di sesi ini.', null);
    }

    var sheet = getSpreadsheet().getSheetByName(SHEET_ABSENSI);
    var rowIndex = rowInfo.rowIndex;
    
    // Baca data baris saat ini (kolom G=Tarif, H=Status_Bayar, I=Jumlah_Dibayar)
    var currentData = sheet.getRange(rowIndex, 7, 1, 4).getValues()[0];
    var tarifSesi = Number(currentData[0]) || 0;
    
    var metode = body.metode || 'Tunai';
    var jumlah = (body.jumlah !== undefined && body.jumlah !== null && body.jumlah !== '') 
      ? Number(body.jumlah) 
      : tarifSesi;
      
    var statusBayar = (jumlah >= tarifSesi && tarifSesi > 0) ? 'Lunas' : 'Belum';
    var tglBayar = todayWIB();

    // Update baris di sheet Absensi
    updateAbsensiRow(rowIndex, {
      statusBayar:   statusBayar,
      jumlahDibayar: jumlah,
      metode:        metode,
      tglBayar:      tglBayar
    });

    logInfo('markPaid sukses: ' + idSiswa + ' di sesi ' + idSesi + ' -> ' + statusBayar + ' Rp' + jumlah);

    return jsonResponse(true, 'ok', 'Status bayar berhasil diubah menjadi ' + statusBayar + '.', {
      idSesi:        idSesi,
      idSiswa:       idSiswa,
      statusBayar:   statusBayar,
      jumlahDibayar: jumlah,
      metode:        metode,
      tglBayar:      tglBayar
    });

  } catch (err) {
    logError('markPaid error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal memperbarui status bayar: ' + err.message, null);
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

// ─────────────────────────────────────────────
// Stubs untuk M4 (akan diimplementasikan di M4)
// ─────────────────────────────────────────────

function getRevenueMonth(body) {
  return jsonResponse(false, 'not_implemented', 'revenueMonth akan tersedia di M4.', null);
}

function getDebtors(body) {
  return jsonResponse(false, 'not_implemented', 'debtors akan tersedia di M4.', null);
}
