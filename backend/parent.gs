/**
 * parent.gs — Portal Orang Tua
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 *
 * ATURAN KEAMANAN & PRIVASI PRD 6.6:
 * - Login pakai ID_Siswa + PIN 4 digit (diverifikasi lewat verifyParent di auth.gs).
 * - Rate limit: 5 percobaan salah per ID dalam 15 menit -> terkunci sementara.
 * - Respons API TIDAK BOLEH memuat nominal uang sama sekali (tarif, jumlahDibayar, pendapatan, dll).
 * - Tidak boleh memuat data siswa lain atau PIN.
 * - Siswa Nonaktif: tampilkan pesan netral, tanpa riwayat baru.
 */

/**
 * Aksi: parentView
 * Params: { idSiswa, pin }
 */
function parentView(body) {
  var idSiswa = body.idSiswa;
  var pin     = body.pin;

  if (!idSiswa || !pin) {
    return jsonResponse(false, 'invalid_input', 'ID Siswa dan PIN wajib diisi.', null);
  }
  idSiswa = String(idSiswa).trim();
  pin     = String(pin).trim();

  // 1. Verifikasi ID dan PIN melalui verifyParent (termasuk rate limiting)
  var authResult = verifyParent(idSiswa, pin);
  if (!authResult.ok) {
    return jsonResponse(false, authResult.code, authResult.message, null);
  }

  var siswa = authResult.siswa;

  try {
    // Profil siswa publik orang tua (JANGAN kirim PIN atau No HP orang lain)
    var profilSiswa = {
      idSiswa:   siswa.idSiswa,
      nama:      siswa.nama,
      panggilan: siswa.panggilan,
      tingkatan: siswa.tingkatan,
      status:    siswa.status
    };

    // 2. Jika siswa berstatus Nonaktif, tampilkan pesan netral tanpa riwayat
    if (siswa.status === 'Nonaktif') {
      return jsonResponse(true, 'ok', 'Status siswa nonaktif.', {
        siswa: profilSiswa,
        isNonaktif: true,
        pesan: 'Siswa saat ini berstatus Nonaktif. Silakan hubungi pelatih untuk informasi lebih lanjut.',
        statistik: {
          kehadiranUmumPersen: 0,
          hadirUmum: 0,
          totalSesiUmum: 0,
          hadirKhusus: 0,
          totalSesiKhusus: 0
        },
        riwayat: []
      });
    }

    // 3. Siswa Aktif: Ambil data sesi & absensi
    var allSesi = getAllSesi();
    var allAbsensi = getAllAbsensi();
    var pesertaKhusus = getPesertaKhusus();
    var isPesertaKhusus = pesertaKhusus.indexOf(idSiswa) !== -1;
    var today = todayWIB();

    // Saring absensi khusus siswa ini saja
    var absensiMap = {};
    allAbsensi.forEach(function(a) {
      if (a.idSiswa === idSiswa) {
        absensiMap[a.idSesi] = a;
      }
    });

    var totalSesiUmum = 0;
    var hadirUmum = 0;
    var totalSesiKhusus = 0;
    var hadirKhusus = 0;

    var riwayat = [];

    // Filter sesi yang relevan (bukan Batal, dan tanggal efektif sudah lewat atau hari ini atau ada catatan hadir)
    allSesi.forEach(function(s) {
      if (s.statusSesi === 'Batal') return;

      var tgl = s.tglEfektif || s.tglRencana;
      var hasAttendance = !!absensiMap[s.idSesi];
      var isPastOrToday = tgl && tgl <= today;

      // Lewati sesi khusus jika siswa bukan peserta khusus dan tidak pernah hadir di sesi tsb
      if (s.jenis === 'Khusus' && !isPesertaKhusus && !hasAttendance) {
        return;
      }

      // Hitung statistik sesi yang sudah terlaksana atau hari ini
      if (isPastOrToday || s.statusSesi === 'Terlaksana') {
        if (s.jenis === 'Umum') {
          totalSesiUmum++;
          if (hasAttendance && absensiMap[s.idSesi].statusHadir === 'Hadir') {
            hadirUmum++;
          }
        } else if (s.jenis === 'Khusus' && isPesertaKhusus) {
          totalSesiKhusus++;
          if (hasAttendance && absensiMap[s.idSesi].statusHadir === 'Hadir') {
            hadirKhusus++;
          }
        }
      }

      // Masukkan ke riwayat jika sesi sudah berjalan atau sudah ada absensinya
      if (isPastOrToday || hasAttendance) {
        var rec = absensiMap[s.idSesi];
        var statusHadir = rec ? rec.statusHadir : 'Tidak tercatat';
        var statusBayar = rec ? rec.statusBayar : '-';

        // PRIVASI MUTLAK: Hanya status hadir dan status bayar (Lunas/Belum), tanpa rupiah!
        riwayat.push({
          idSesi:      s.idSesi,
          tanggal:     tgl,
          jenis:       s.jenis,
          statusHadir: statusHadir,
          statusBayar: statusBayar,
          timestamp:   rec ? rec.timestamp : ''
        });
      }
    });

    // Urutkan riwayat dari yang paling baru
    riwayat.sort(function(a, b) {
      return b.tanggal.localeCompare(a.tanggal);
    });

    var persenUmum = (totalSesiUmum > 0)
      ? Math.round((hadirUmum / totalSesiUmum) * 100)
      : 0;

    return jsonResponse(true, 'ok', 'Data kehadiran berhasil dimuat.', {
      siswa: profilSiswa,
      isNonaktif: false,
      pesan: '',
      statistik: {
        kehadiranUmumPersen: persenUmum,
        hadirUmum:           hadirUmum,
        totalSesiUmum:       totalSesiUmum,
        hadirKhusus:         hadirKhusus,
        totalSesiKhusus:     totalSesiKhusus
      },
      riwayat: riwayat
    });

  } catch (err) {
    logError('parentView error: ' + err.message);
    return jsonResponse(false, 'server_error', 'Gagal memuat riwayat kehadiran anak: ' + err.message, null);
  }
}

