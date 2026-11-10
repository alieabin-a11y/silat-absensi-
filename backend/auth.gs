/**
 * auth.gs — Autentikasi pelatih dan orang tua
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 *
 * ATURAN KEAMANAN:
 * - Passcode pelatih HANYA ada di Script Properties (key: COACH_PASSCODE).
 * - Token disimpan di Script Properties (key: TOKEN_<token>).
 * - PIN orang tua HANYA dibaca dari sheet Siswa.F — tidak pernah di-log.
 * - Jangan pernah log passcode, PIN, atau token penuh.
 */

// Durasi token pelatih: 30 hari (dalam milidetik)
var TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

// Rate limit orang tua: 5 percobaan dalam 15 menit
var PARENT_MAX_ATTEMPTS = 5;
var PARENT_LOCKOUT_SECONDS = 15 * 60; // 900 detik

// ─────────────────────────────────────────────
// Login pelatih
// ─────────────────────────────────────────────

/**
 * Aksi: coachLogin
 * Params: { passcode, namaPelatih }
 * Passcode dicek terhadap Script Properties COACH_PASSCODE.
 * Kalau cocok, kembalikan token baru.
 */
function coachLogin(body) {
  var passcode     = body.passcode;
  var namaPelatih  = body.namaPelatih;

  // Validasi input
  if (!passcode || typeof passcode !== 'string' || passcode.length === 0) {
    return jsonResponse(false, 'invalid_input', 'Passcode wajib diisi.', null);
  }
  if (!namaPelatih || typeof namaPelatih !== 'string' || namaPelatih.trim().length === 0) {
    return jsonResponse(false, 'invalid_input', 'Nama pelatih wajib diisi.', null);
  }
  if (namaPelatih.length > 100) {
    return jsonResponse(false, 'invalid_input', 'Nama pelatih terlalu panjang.', null);
  }

  // Ambil passcode dari Script Properties (bukan dari kode)
  var props = PropertiesService.getScriptProperties();
  var storedPasscode = props.getProperty('COACH_PASSCODE');

  if (!storedPasscode) {
    logError('COACH_PASSCODE belum diset di Script Properties.');
    return jsonResponse(false, 'server_error', 'Konfigurasi server belum lengkap. Hubungi administrator.', null);
  }

  // Bandingkan passcode (constant-time tidak tersedia di GAS, tapi input sudah dibatasi)
  if (passcode !== storedPasscode) {
    logInfo('coachLogin gagal: passcode salah untuk nama=' + namaPelatih.substring(0, 20));
    // Pesan seragam (jangan beri tahu apakah passcode atau nama yang salah)
    return jsonResponse(false, 'unauthorized', 'Passcode salah. Coba lagi.', null);
  }

  // Buat token baru
  var token = generateToken();
  var expiry = Date.now() + TOKEN_EXPIRY_MS;

  // Simpan token di Script Properties: key = "TOKEN_<token>", value = JSON
  var tokenData = JSON.stringify({
    namaPelatih: namaPelatih.trim(),
    expiry: expiry
  });
  props.setProperty('TOKEN_' + token, tokenData);

  logInfo('coachLogin berhasil: ' + namaPelatih.substring(0, 20));

  return jsonResponse(true, 'ok', 'Login berhasil.', {
    token: token,
    namaPelatih: namaPelatih.trim(),
    expiryMs: expiry
  });
}

// ─────────────────────────────────────────────
// Verifikasi token pelatih
// ─────────────────────────────────────────────

/**
 * Verifikasi token pelatih.
 * Mengembalikan { ok: true, namaPelatih } atau { ok: false }.
 * Dipanggil di Code.gs sebelum setiap aksi pelatih.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length !== 32) {
    return { ok: false };
  }

  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('TOKEN_' + token);

  if (!raw) {
    return { ok: false };
  }

  try {
    var data = JSON.parse(raw);
    if (Date.now() > data.expiry) {
      // Token kedaluwarsa — hapus
      props.deleteProperty('TOKEN_' + token);
      return { ok: false };
    }
    return { ok: true, namaPelatih: data.namaPelatih };
  } catch (e) {
    return { ok: false };
  }
}

/**
 * Invalidasi semua token pelatih (dipanggil saat passcode diganti).
 * Hapus semua property yang diawali "TOKEN_".
 */
function invalidateAllTokens() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var count = 0;
  Object.keys(all).forEach(function(key) {
    if (key.indexOf('TOKEN_') === 0) {
      props.deleteProperty(key);
      count++;
    }
  });
  logInfo('invalidateAllTokens: ' + count + ' token dihapus.');
  return count;
}

// ─────────────────────────────────────────────
// Auth orang tua (rate limiting pakai CacheService)
// ─────────────────────────────────────────────

/**
 * Verifikasi login orang tua.
 * Params: { idSiswa, pin }
 * Rate limit: 5 percobaan salah per ID dalam 15 menit.
 * Pesan error seragam (jangan beda antara ID salah dan PIN salah).
 * PIN dibaca sebagai string dari kolom F sheet Siswa.
 * Mengembalikan { ok: true, siswa: {...} } atau { ok: false, code, message }
 */
function verifyParent(idSiswa, pin) {
  // Validasi format dasar
  if (!isValidStudentId(idSiswa)) {
    return { ok: false, code: 'unauthorized', message: 'ID atau PIN salah.' };
  }
  if (!isValidPin(pin)) {
    return { ok: false, code: 'unauthorized', message: 'ID atau PIN salah.' };
  }

  // Cek rate limit — kunci per ID
  var cacheKey = 'PARENT_ATTEMPTS_' + idSiswa;
  var cache = CacheService.getScriptCache();
  var attemptsRaw = cache.get(cacheKey);
  var attempts = attemptsRaw ? parseInt(attemptsRaw, 10) : 0;

  if (attempts >= PARENT_MAX_ATTEMPTS) {
    logInfo('parentView rate-limited: ' + idSiswa);
    return {
      ok: false,
      code: 'rate_limited',
      message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.'
    };
  }

  // Cari siswa di sheet
  var siswa = getSiswaById(idSiswa);
  if (!siswa) {
    // Tambah hitungan percobaan (pakai ID yang sama supaya tidak bisa probe)
    cache.put(cacheKey, String(attempts + 1), PARENT_LOCKOUT_SECONDS);
    return { ok: false, code: 'unauthorized', message: 'ID atau PIN salah.' };
  }

  // Bandingkan PIN sebagai string (kolom F sudah diformat sebagai teks di sheet)
  // JANGAN log PIN
  if (String(siswa.pin) !== String(pin)) {
    cache.put(cacheKey, String(attempts + 1), PARENT_LOCKOUT_SECONDS);
    return { ok: false, code: 'unauthorized', message: 'ID atau PIN salah.' };
  }

  // Login berhasil — reset counter
  cache.remove(cacheKey);
  return { ok: true, siswa: siswa };
}

