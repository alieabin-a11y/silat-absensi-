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
// M4: revenueMonth — Ringkasan bulanan & per sesi
// ─────────────────────────────────────────────

/**
 * Aksi: revenueMonth
 * Params: { bulan? }  // format YYYY-MM, contoh: "2026-11". Default bulan ini.
 *
 * Menghitung pendapatan bulanan (Umum, Khusus, Total) dan tabel per sesi.
 * Aturan PRD 6.5 & Uji Silang Ringkasan:
 * - Jumlah_Sesi HANYA menghitung sesi yang berstatus 'Terlaksana'.
 * - Bulan mengikuti Tanggal_Efektif (Tanggal_Aktual jika digeser).
 * - Total_Hadir: jumlah Hadir di sesi bulan tersebut.
 * - Seharusnya: total tarif siswa Hadir.
 * - Diterima: total uang yang sudah dibayar.
 * - Piutang: Seharusnya - Diterima.
 */
function getRevenueMonth(body) {
  var bulan = body.bulan;
  if (!bulan || typeof bulan !== 'string') {
    bulan = todayWIB().substring(0, 7);
  }
  bulan = bulan.trim();

  // Validasi format YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(bulan)) {
    return jsonResponse(false, 'invalid_input', 'Format bulan harus YYYY-MM (contoh: 2026-11).', null);
  }

  try {
    var allSesi = getAllSesi();
    var allAbsensi = getAllAbsensi();

    // Saring sesi yang tanggal efektifnya jatuh pada bulan ini
    var sesiBulanIni = allSesi.filter(function(s) {
      var tgl = s.tglEfektif || s.tglRencana;
      return tgl && tgl.substring(0, 7) === bulan;
    });

    // Urutkan sesi berdasarkan tanggal efektif
    sesiBulanIni.sort(function(a, b) {
      var tglA = a.tglEfektif || a.tglRencana;
      var tglB = b.tglEfektif || b.tglRencana;
      return tglA.localeCompare(tglB);
    });

    // Hitung per sesi
    var perSesi = [];
    var summary = {
      umum:   { jumlahSesi: 0, totalHadir: 0, seharusnya: 0, diterima: 0, piutang: 0 },
      khusus: { jumlahSesi: 0, totalHadir: 0, seharusnya: 0, diterima: 0, piutang: 0 },
      total:  { jumlahSesi: 0, totalHadir: 0, seharusnya: 0, diterima: 0, piutang: 0 }
    };

    sesiBulanIni.forEach(function(s) {
      var absensiSesi = allAbsensi.filter(function(a) {
        return a.idSesi === s.idSesi;
      });

      var hadirCount = 0;
      var seharusnya = 0;
      var diterima = 0;

      absensiSesi.forEach(function(a) {
        if (a.statusHadir === 'Hadir') {
          hadirCount++;
          seharusnya += Number(a.tarif) || 0;
        }
        diterima += Number(a.jumlahDibayar) || 0;
      });

      var piutang = Math.max(0, seharusnya - diterima);
      var isTerlaksana = s.statusSesi === 'Terlaksana';

      var sesiItem = {
        idSesi:       s.idSesi,
        tanggal:      s.tglEfektif || s.tglRencana,
        jenis:        s.jenis,
        statusSesi:   s.statusSesi,
        jumlahHadir:  hadirCount,
        seharusnya:   seharusnya,
        diterima:     diterima,
        piutang:      piutang
      };
      perSesi.push(sesiItem);

      // Akumulasi ke summary sesuai Jenis
      var target = (s.jenis === 'Khusus') ? summary.khusus : summary.umum;
      if (isTerlaksana) {
        target.jumlahSesi += 1;
        summary.total.jumlahSesi += 1;
      }
      target.totalHadir += hadirCount;
      target.seharusnya += seharusnya;
      target.diterima   += diterima;
      target.piutang    += piutang;

      summary.total.totalHadir += hadirCount;
      summary.total.seharusnya += seharusnya;
      summary.total.diterima   += diterima;
      summary.total.piutang    += piutang;
    });

    return jsonResponse(true, 'ok', 'Ringkasan pendapatan berhasil dimuat.', {
      bulan:     bulan,
      ringkasan: summary,
      perSesi:   perSesi
    });

  } catch (err) {
    logError('getRevenueMonth error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal memuat pendapatan: ' + err.message, null);
  }
}

// ─────────────────────────────────────────────
// M4: debtors — Daftar tunggakan siswa
// ─────────────────────────────────────────────

/**
 * Aksi: debtors
 * Mengembalikan daftar siswa yang memiliki tunggakan (hadir tapi belum lunas).
 * Bisa diurutkan di frontend, dan dapat ditandai lunas per sesi.
 */
function getDebtors(body) {
  try {
    var allAbsensi = getAllAbsensi();
    var allSiswa = getAllSiswa();
    var allSesi = getAllSesi();

    var siswaMap = {};
    allSiswa.forEach(function(s) {
      siswaMap[s.idSiswa] = s;
    });

    var sesiMap = {};
    allSesi.forEach(function(sesi) {
      sesiMap[sesi.idSesi] = sesi;
    });

    // Kumpulkan tunggakan per siswa
    var debtorsMap = {};

    allAbsensi.forEach(function(a) {
      // Tunggakan: hadir, tarif > 0, dan jumlah dibayar < tarif
      var tarif = Number(a.tarif) || 0;
      var dibayar = Number(a.jumlahDibayar) || 0;
      var sisa = tarif - dibayar;

      if (a.statusHadir === 'Hadir' && a.statusBayar !== 'Lunas' && sisa > 0) {
        var id = a.idSiswa;
        if (!debtorsMap[id]) {
          var sInfo = siswaMap[id] || {};
          debtorsMap[id] = {
            idSiswa:        id,
            nama:           sInfo.nama || a.nama,
            panggilan:      sInfo.panggilan || '',
            tingkatan:      sInfo.tingkatan || '',
            noHpWali:       sInfo.noHpWali || '',
            jumlahSesi:     0,
            totalTunggakan: 0,
            sesiList:       []
          };
        }

        var sesiInfo = sesiMap[a.idSesi] || {};
        debtorsMap[id].jumlahSesi += 1;
        debtorsMap[id].totalTunggakan += sisa;
        debtorsMap[id].sesiList.push({
          idSesi:        a.idSesi,
          tanggal:       sesiInfo.tglEfektif || sesiInfo.tglRencana || a.timestamp,
          jenis:         a.jenis,
          tarif:         tarif,
          jumlahDibayar: dibayar,
          sisa:          sisa
        });
      }
    });

    var debtorsList = Object.keys(debtorsMap).map(function(k) {
      return debtorsMap[k];
    });

    // Default urutkan dari tunggakan terbesar
    debtorsList.sort(function(a, b) {
      return b.totalTunggakan - a.totalTunggakan;
    });

    var totalSemuaTunggakan = debtorsList.reduce(function(acc, d) {
      return acc + d.totalTunggakan;
    }, 0);

    return jsonResponse(true, 'ok', 'Daftar tunggakan berhasil dimuat.', {
      totalSiswa:     debtorsList.length,
      totalTunggakan: totalSemuaTunggakan,
      debtors:        debtorsList
    });

  } catch (err) {
    logError('getDebtors error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal memuat daftar tunggakan: ' + err.message, null);
  }
}
