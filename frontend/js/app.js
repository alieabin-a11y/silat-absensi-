/**
 * app.js — Logika Frontend Pelatih Absensi Silat Putra Setia Rawa Bebek
 * Milestone 2 & 3: Login Pelatih, Sesi Aktif, Scan Kamera QR, Feedback, Cari Manual, Pembayaran Lunas.
 */

// URL Backend Google Apps Script Web App
const API_URL = 'https://script.google.com/macros/s/AKfycbzEJ0Gg3sbDU4YRk-nqwWPDab5-IAVYp-QddwFpUPRt8fOpmdrYN--B0VouKemwnGGEJw/exec';

// State Aplikasi
let currentUser = {
  token: localStorage.getItem('coach_token') || null,
  nama: localStorage.getItem('coach_nama') || null
};

let appData = {
  siswa: [],
  sesi: [],
  sesiAktif: null,
  pesertaKhusus: [],
  tarif: { umum: 15000, khusus: 5000 },
  today: ''
};

let html5QrCode = null;
let isScannerRunning = false;
let isScannerPaused = false;
let isProcessingScan = false;
let lastScanned = { id: '', time: 0 };
let sessionAttendanceList = []; // Daftar yang sudah discan di sesi aktif

// ─────────────────────────────────────────────
// Audio & Vibration Feedback
// ─────────────────────────────────────────────

function playChime(type = 'success') {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'success') {
      // 2 nada ceria naik (E5 -> G5)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.2, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.15);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.setValueAtTime(783.99, now + 0.12);
      gain2.gain.setValueAtTime(0.2, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.35);
    } else if (type === 'duplicate') {
      // Nada datar peringatan
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      // Nada rendah error
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (e) {
    // Ignore audio error
  }
}

function vibrate(pattern = [150]) {
  if (navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}

// ─────────────────────────────────────────────
// API Call Helper
// ─────────────────────────────────────────────

async function apiRequest(action, params = {}) {
  const payload = {
    action: action,
    token: currentUser.token,
    ...params
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  return await response.json();
}

// ─────────────────────────────────────────────
// DOM Elements
// ─────────────────────────────────────────────

const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const loginForm = document.getElementById('loginForm');
const selectCoach = document.getElementById('selectCoach');
const inputPasscode = document.getElementById('inputPasscode');
const btnLogin = document.getElementById('btnLogin');
const loginAlert = document.getElementById('loginAlert');

const coachProfileHeader = document.getElementById('coachProfileHeader');
const coachDisplayName = document.getElementById('coachDisplayName');
const btnLogout = document.getElementById('btnLogout');

const sessionBadge = document.getElementById('sessionBadge');
const sessionTarif = document.getElementById('sessionTarif');
const sessionTitle = document.getElementById('sessionTitle');
const sessionMeta = document.getElementById('sessionMeta');
const btnToggleSessionSelect = document.getElementById('btnToggleSessionSelect');
const sessionSelectContainer = document.getElementById('sessionSelectContainer');
const selectSession = document.getElementById('selectSession');

const btnToggleCamera = document.getElementById('btnToggleCamera');
const feedbackCard = document.getElementById('feedbackCard');
const feedbackTitle = document.getElementById('feedbackTitle');
const feedbackDesc = document.getElementById('feedbackDesc');
const feedbackActions = document.getElementById('feedbackActions');

const inputManualSearch = document.getElementById('inputManualSearch');
const studentSearchResults = document.getElementById('studentSearchResults');

const attendanceCount = document.getElementById('attendanceCount');
const attendanceList = document.getElementById('attendanceList');

const scanModal = document.getElementById('scanModal');
const modalIcon = document.getElementById('modalIcon');
const modalTitle = document.getElementById('modalTitle');
const modalStudentName = document.getElementById('modalStudentName');
const modalStudentMeta = document.getElementById('modalStudentMeta');
const modalStatusBadge = document.getElementById('modalStatusBadge');
const modalActions = document.getElementById('modalActions');

// ─────────────────────────────────────────────
// Inisialisasi Aplikasi
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (currentUser.token && currentUser.nama) {
    initDashboard();
  } else {
    showLogin();
  }

  // Event Listeners
  loginForm.addEventListener('submit', handleLogin);
  btnLogout.addEventListener('click', handleLogout);
  btnToggleSessionSelect.addEventListener('click', toggleSessionDropdown);
  selectSession.addEventListener('change', handleSessionChange);
  btnToggleCamera.addEventListener('click', toggleCamera);
  inputManualSearch.addEventListener('input', handleManualSearch);
});

// ─────────────────────────────────────────────
// Auth / Login
// ─────────────────────────────────────────────

function showLogin() {
  loginSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  coachProfileHeader.classList.add('hidden');
  stopCamera();
}

async function handleLogin(e) {
  e.preventDefault();
  const namaPelatih = selectCoach.value;
  const passcode = inputPasscode.value.trim();

  loginAlert.style.display = 'none';
  btnLogin.disabled = true;
  btnLogin.innerHTML = '<span class="spinner"></span> Masuk...';

  try {
    const res = await apiRequest('coachLogin', { namaPelatih, passcode });

    if (res.ok && res.data && res.data.token) {
      currentUser.token = res.data.token;
      currentUser.nama = res.data.namaPelatih;
      localStorage.setItem('coach_token', currentUser.token);
      localStorage.setItem('coach_nama', currentUser.nama);

      initDashboard();
    } else {
      loginAlert.className = 'feedback-card feedback-danger';
      loginAlert.textContent = res.message || 'Passcode salah. Coba lagi.';
      loginAlert.style.display = 'block';
    }
  } catch (err) {
    loginAlert.className = 'feedback-card feedback-danger';
    loginAlert.textContent = 'Gagal menghubungi server. Periksa koneksi internet.';
    loginAlert.style.display = 'block';
  } finally {
    btnLogin.disabled = false;
    btnLogin.innerHTML = '<span>Masuk Dashboard</span>';
  }
}

function handleLogout() {
  if (confirm('Yakin ingin keluar?')) {
    localStorage.removeItem('coach_token');
    localStorage.removeItem('coach_nama');
    currentUser.token = null;
    currentUser.nama = null;
    showLogin();
  }
}

// ─────────────────────────────────────────────
// Dashboard & Bootstrap
// ─────────────────────────────────────────────

async function initDashboard() {
  loginSection.classList.add('hidden');
  dashboardSection.classList.remove('hidden');
  coachProfileHeader.classList.remove('hidden');
  coachDisplayName.textContent = currentUser.nama;

  sessionTitle.textContent = 'Memuat data sesi...';

  try {
    const res = await apiRequest('bootstrap');

    if (!res.ok) {
      if (res.code === 'unauthorized') {
        alert('Sesi login telah berakhir. Silakan login kembali.');
        handleLogout();
        return;
      }
      sessionTitle.textContent = 'Gagal memuat data: ' + res.message;
      return;
    }

    appData.siswa = res.data.siswa || [];
    appData.sesi = res.data.sesi || [];
    appData.pesertaKhusus = res.data.pesertaKhusus || [];
    appData.tarif = res.data.tarif || { umum: 15000, khusus: 5000 };
    appData.today = res.data.today || '';

    // Tentukan sesi aktif: default sesi hari ini, atau sesi terjadwal pertama
    appData.sesiAktif = res.data.sesiAktif || findDefaultSession();

    renderSessionInfo();
    populateSessionDropdown();
    startCamera();

  } catch (err) {
    sessionTitle.textContent = 'Koneksi gagal. Muat ulang halaman.';
  }
}

function findDefaultSession() {
  if (appData.sesi.length === 0) return null;
  // Cari sesi yang bukan batal
  const activeSesi = appData.sesi.find(s => s.statusSesi !== 'Batal');
  return activeSesi || appData.sesi[0];
}

function renderSessionInfo() {
  if (!appData.sesiAktif) {
    sessionTitle.textContent = 'Tidak ada sesi aktif';
    sessionMeta.textContent = 'Silakan pilih atau tambahkan sesi latihan.';
    return;
  }

  const s = appData.sesiAktif;
  const isKhusus = s.jenis === 'Khusus';
  const tarif = s.tarif || (isKhusus ? appData.tarif.khusus : appData.tarif.umum);

  sessionBadge.textContent = s.jenis;
  sessionBadge.className = 'session-badge ' + (isKhusus ? 'badge-khusus' : 'badge-umum');
  sessionTarif.textContent = 'Rp' + tarif.toLocaleString('id-ID');

  sessionTitle.textContent = `Latihan Silat ${s.jenis} (${s.idSesi})`;
  const tgl = s.tglEfektif || s.tglRencana || '-';
  const isToday = tgl === appData.today;
  sessionMeta.textContent = `Tanggal: ${tgl} ${isToday ? '• Hari ini (WIB)' : '• ⚠️ Bukan hari ini'}`;

  // Ambil data absensi nyata dari Google Sheets untuk sesi ini
  loadSessionAttendance(s.idSesi);
}

async function loadSessionAttendance(idSesi) {
  attendanceList.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 12px 0;">Memuat data kehadiran dari sheet...</p>';
  try {
    const res = await apiRequest('sessionAttendance', { idSesi: idSesi });
    if (res.ok && res.data && res.data.attendance) {
      // Hilangkan potensi duplikat ID di frontend
      const uniqueMap = new Map();
      res.data.attendance.forEach(item => {
        uniqueMap.set(item.idSiswa, item);
      });
      sessionAttendanceList = Array.from(uniqueMap.values());
      renderAttendanceList();
    } else {
      sessionAttendanceList = [];
      renderAttendanceList();
    }
  } catch (err) {
    console.error('Gagal mengambil kehadiran sesi:', err);
    renderAttendanceList();
  }
}

function populateSessionDropdown() {
  selectSession.innerHTML = '';
  appData.sesi.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.idSesi;
    const tgl = s.tglEfektif || s.tglRencana;
    opt.textContent = `[${s.jenis}] ${s.idSesi} (${tgl}) - ${s.statusSesi}`;
    if (appData.sesiAktif && appData.sesiAktif.idSesi === s.idSesi) {
      opt.selected = true;
    }
    selectSession.appendChild(opt);
  });
}

function toggleSessionDropdown() {
  sessionSelectContainer.classList.toggle('hidden');
  const isHidden = sessionSelectContainer.classList.contains('hidden');
  btnToggleSessionSelect.textContent = isHidden ? 'Pilih Sesi Lain ▼' : 'Tutup Pilihan ▲';
}

function handleSessionChange(e) {
  const selectedId = e.target.value;
  const found = appData.sesi.find(s => s.idSesi === selectedId);
  if (found) {
    appData.sesiAktif = found;
    renderSessionInfo();
    toggleSessionDropdown();
  }
}

// ─────────────────────────────────────────────
// Kamera & Scanner QR
// ─────────────────────────────────────────────

async function startCamera() {
  if (isScannerRunning) return;

  btnToggleCamera.textContent = 'Memulai Kamera...';

  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('reader');
    }

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    };

    // Deteksi kamera perangkat: pilih kamera belakang
    let cameraMode = { facingMode: 'environment' };
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        const backCam = devices.find(d => /back|rear|environment|belakang/i.test(d.label)) || devices[devices.length - 1];
        if (backCam && backCam.id) {
          cameraMode = backCam.id;
        }
      }
    } catch (e) {
      console.warn('Deteksi getCameras gagal, fallback ke facingMode:', e);
    }

    await html5QrCode.start(
      cameraMode,
      config,
      onScanSuccess,
      onScanFailure
    );

    isScannerRunning = true;
    btnToggleCamera.textContent = 'Jeda Kamera';

  } catch (err) {
    console.error('Kamera gagal dimulai:', err);
    isScannerRunning = false;
    btnToggleCamera.textContent = 'Nyalakan Kamera';

    // Coba fallback dengan generic constraint jika perangkat tertentu rewel
    try {
      await html5QrCode.start(
        { facingMode: 'user' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        onScanSuccess,
        onScanFailure
      );
      isScannerRunning = true;
      btnToggleCamera.textContent = 'Jeda Kamera';
    } catch (fallbackErr) {
      console.error('Fallback kamera juga gagal:', fallbackErr);
      showFeedback('warning', 'Kamera Tidak Menyala', 'Pastikan izin kamera sudah diizinkan di browser Chrome/Safari kamu, lalu klik tombol "Nyalakan Kamera" di atas.');
    }
  }
}

function stopCamera() {
  if (html5QrCode && isScannerRunning) {
    html5QrCode.stop().then(() => {
      isScannerRunning = false;
      btnToggleCamera.textContent = 'Nyalakan Kamera';
    }).catch(err => {
      console.error('Gagal stop kamera', err);
      isScannerRunning = false;
      btnToggleCamera.textContent = 'Nyalakan Kamera';
    });
  }
}

function toggleCamera() {
  if (isScannerRunning) {
    stopCamera();
  } else {
    startCamera();
  }
}

function onScanFailure(error) {
  // Abaikan kegagalan scan per-frame (normal saat QR belum terdeteksi)
}

function pauseScanner() {
  isScannerPaused = true;
  if (html5QrCode && isScannerRunning) {
    try {
      html5QrCode.pause(true);
    } catch (e) {
      console.warn('Gagal pause camera:', e);
    }
  }
}

function resumeScanner() {
  isScannerPaused = false;
  closeScanModal();
  if (html5QrCode && isScannerRunning) {
    try {
      html5QrCode.resume();
    } catch (e) {
      console.warn('Gagal resume camera:', e);
    }
  }
}

function openScanModal(icon, title, studentName, studentMeta, statusHtml, actions = []) {
  modalIcon.textContent = icon;
  modalTitle.textContent = title;
  modalStudentName.textContent = studentName;
  modalStudentMeta.textContent = studentMeta;
  modalStatusBadge.innerHTML = statusHtml;

  modalActions.innerHTML = '';
  actions.forEach(act => {
    const btn = document.createElement('button');
    btn.className = `btn ${act.class || 'btn-secondary'}`;
    btn.textContent = act.text;
    btn.onclick = act.onClick;
    modalActions.appendChild(btn);
  });

  scanModal.classList.remove('hidden');
}

function closeScanModal() {
  scanModal.classList.add('hidden');
}

function onScanSuccess(decodedText, decodedResult) {
  if (isScannerPaused || isProcessingScan) return; // Jeda kamera aktif, abaikan frame

  const scannedText = (decodedText || '').trim();

  // Cooldown scan 2 detik untuk ID yang sama persis
  const now = Date.now();
  if (lastScanned.id === scannedText && (now - lastScanned.time) < 2000) {
    return;
  }
  lastScanned = { id: scannedText, time: now };

  // Jeda kamera seketika agar tidak scan berulang kali!
  pauseScanner();

  processScan(scannedText);
}

// ─────────────────────────────────────────────
// Logika Pemrosesan Scan
// ─────────────────────────────────────────────

async function processScan(idSiswa, confirm = false) {
  if (isProcessingScan) return; // Cegah double submit dari frontend
  isProcessingScan = true;

  if (!appData.sesiAktif) {
    openScanModal('⚠️', 'Sesi Belum Dipilih', '-', 'Silakan pilih sesi aktif terlebih dahulu sebelum scan.', '<span class="badge-unpaid">Sesi Kosong</span>', [
      {
        text: 'Tutup & Lanjut',
        class: 'btn-secondary',
        onClick: () => resumeScanner()
      }
    ]);
    playChime('error');
    vibrate([200]);
    isProcessingScan = false;
    return;
  }

  // Validasi Regex ID Siswa
  const regex = /^S\d{3,}$/;
  if (!regex.test(idSiswa)) {
    openScanModal('❌', 'QR Tidak Dikenali', `Format ID: ${idSiswa}`, 'Format QR tidak sesuai (contoh: S001).', '<span class="badge-unpaid">Bukan Kartu Siswa</span>', [
      {
        text: 'Tutup & Lanjut Scan',
        class: 'btn-secondary',
        onClick: () => resumeScanner()
      }
    ]);
    playChime('error');
    vibrate([200]);
    isProcessingScan = false;
    return;
  }

  showFeedback('warning', 'Memproses...', `Memeriksa ID: ${idSiswa}...`);

  try {
    const res = await apiRequest('scan', {
      idSesi: appData.sesiAktif.idSesi,
      idSiswa: idSiswa,
      confirm: confirm
    });

    handleScanResult(res, idSiswa);

  } catch (err) {
    openScanModal('❌', 'Koneksi Error', `ID: ${idSiswa}`, 'Gagal menghubungi server. Periksa jaringan internet kamu.', '<span class="badge-unpaid">Koneksi Putus</span>', [
      {
        text: 'Tutup & Coba Lagi',
        class: 'btn-secondary',
        onClick: () => resumeScanner()
      }
    ]);
    playChime('error');
    vibrate([200]);
  } finally {
    isProcessingScan = false;
  }
}

function handleScanResult(res, idSiswa) {
  hideFeedback();

  // 1. Sukses Hadir
  if (res.ok && res.code === 'ok') {
    const record = res.data.record;
    const siswa = res.data.siswa;
    const displayName = siswa.panggilan ? `${siswa.nama} (${siswa.panggilan})` : siswa.nama;
    const tarifText = record.tarif ? `Rp${Number(record.tarif).toLocaleString('id-ID')}` : 'Rp15.000';

    playChime('success');
    vibrate([150]);

    // Tambahkan ke riwayat tampilan
    addAttendanceRecord(record);

    // Tampilkan Pop-up Pembayaran & Jeda Kamera
    openScanModal(
      '✅',
      'Kehadiran Tercatat!',
      displayName,
      `ID: ${record.idSiswa} • Jam: ${record.timestamp}`,
      `<span class="badge-unpaid">Status: Belum Lunas</span>`,
      [
        {
          text: `💰 Bayar Lunas (Tunai ${tarifText})`,
          class: 'btn-success',
          onClick: async () => {
            await markQuickPaid(record.idSesi, record.idSiswa);
            resumeScanner();
          }
        },
        {
          text: '📋 Belum Bayar (Lanjut Scan)',
          class: 'btn-secondary',
          onClick: () => {
            resumeScanner();
          }
        }
      ]
    );
    return;
  }

  // 2. Duplikat (Sudah pernah scan di sesi ini)
  if (res.code === 'duplicate') {
    playChime('duplicate');
    vibrate([100, 50, 100]);

    const existing = sessionAttendanceList.find(a => a.idSiswa === idSiswa);
    const isPaid = existing && existing.statusBayar === 'Lunas';
    const studentName = existing ? existing.nama : (res.data.nama || idSiswa);
    const jamHadir = res.data.timestamp || (existing ? existing.timestamp : '-');

    const actions = [];
    if (!isPaid) {
      actions.push({
        text: '💰 Tandai Lunas Sekarang',
        class: 'btn-success',
        onClick: async () => {
          await markQuickPaid(appData.sesiAktif.idSesi, idSiswa);
          resumeScanner();
        }
      });
    }
    actions.push({
      text: 'Tutup & Lanjut Scan',
      class: 'btn-secondary',
      onClick: () => {
        resumeScanner();
      }
    });

    openScanModal(
      '⚠️',
      'Sudah Hadir (Duplikat)',
      studentName,
      `Siswa sudah discan pada jam: ${jamHadir}`,
      isPaid ? `<span class="badge-paid">Status: Lunas ✓</span>` : `<span class="badge-unpaid">Status: Belum Lunas ✎</span>`,
      actions
    );
    return;
  }

  // 3. Siswa Nonaktif (Butuh Konfirmasi)
  if (res.code === 'inactive') {
    playChime('duplicate');
    vibrate([100, 50, 100]);

    openScanModal(
      '⚠️',
      'Siswa Nonaktif',
      `${res.data.nama || idSiswa}`,
      'Siswa ini berstatus Nonaktif di database.',
      `<span class="badge-unpaid">Perlu Konfirmasi</span>`,
      [
        {
          text: 'Tetap Hadirkan',
          class: 'btn-danger',
          onClick: () => {
            closeScanModal();
            processScan(idSiswa, true);
          }
        },
        {
          text: 'Batal (Lanjut Scan)',
          class: 'btn-secondary',
          onClick: () => resumeScanner()
        }
      ]
    );
    return;
  }

  // 4. Bukan Peserta Turnamen Khusus (Butuh Konfirmasi)
  if (res.code === 'not_khusus_participant') {
    playChime('duplicate');
    vibrate([100, 50, 100]);

    openScanModal(
      '⚠️',
      'Bukan Peserta Khusus',
      `${res.data.nama || idSiswa}`,
      'Siswa ini tidak terdaftar dalam daftar Turnamen Khusus.',
      `<span class="badge-unpaid">Perlu Konfirmasi</span>`,
      [
        {
          text: 'Tetap Catat Kehadiran',
          class: 'btn-primary',
          onClick: () => {
            closeScanModal();
            processScan(idSiswa, true);
          }
        },
        {
          text: 'Batal (Lanjut Scan)',
          class: 'btn-secondary',
          onClick: () => resumeScanner()
        }
      ]
    );
    return;
  }

  // 5. Error Lainnya (Siswa Tidak Ada, Sesi Batal, dsb)
  playChime('error');
  vibrate([250]);

  openScanModal(
    '❌',
    'Scan Ditolak',
    `ID: ${idSiswa}`,
    res.message || 'Terjadi kesalahan saat memproses scan.',
    `<span class="badge-unpaid">Ditolak</span>`,
    [
      {
        text: 'Tutup & Lanjut Scan',
        class: 'btn-secondary',
        onClick: () => resumeScanner()
      }
    ]
  );
}

// ─────────────────────────────────────────────
// Feedback UI Card & Pembayaran
// ─────────────────────────────────────────────

function showFeedback(type, title, desc, actions = []) {
  feedbackCard.style.display = 'block';
  feedbackCard.className = `feedback-card feedback-${type}`;
  feedbackTitle.textContent = title;
  feedbackDesc.textContent = desc;

  feedbackActions.innerHTML = '';
  if (actions.length > 0) {
    actions.forEach(act => {
      const btn = document.createElement('button');
      btn.className = `btn ${act.class || 'btn-secondary btn-sm'}`;
      btn.textContent = act.text;
      btn.onclick = act.onClick;
      feedbackActions.appendChild(btn);
    });
  }
}

function hideFeedback() {
  feedbackCard.style.display = 'none';
}

async function markQuickPaid(idSesi, idSiswa, customJumlah = null) {
  showFeedback('warning', 'Menyimpan...', 'Memperbarui status bayar ke Google Sheets...');
  try {
    const res = await apiRequest('markPaid', {
      idSesi: idSesi,
      idSiswa: idSiswa,
      metode: 'Tunai',
      jumlah: customJumlah
    });

    if (res.ok) {
      playChime('success');
      vibrate([150]);
      
      // Update item di daftar kehadiran lokal
      const item = sessionAttendanceList.find(a => a.idSiswa === idSiswa);
      if (item) {
        item.statusBayar = res.data.statusBayar;
        item.jumlahDibayar = res.data.jumlahDibayar;
        item.metode = res.data.metode;
        item.tglBayar = res.data.tglBayar;
        renderAttendanceList();
      }
      showFeedback('success', 'Status Lunas (Tunai)', `Pembayaran ${idSiswa} berhasil dicatat di Google Sheets.`);
    } else {
      showFeedback('danger', 'Gagal Update', res.message || 'Gagal mengubah status bayar.');
    }
  } catch (err) {
    showFeedback('danger', 'Koneksi Error', 'Gagal menghubungi server untuk update pembayaran.');
  }
}

function promptMarkPaid(idSesi, idSiswa, nama, isPaid) {
  if (isPaid) {
    alert(`Siswa ${nama} (${idSiswa}) sudah berstatus LUNAS.`);
    return;
  }
  if (confirm(`Tandai pembayaran ${nama} (${idSiswa}) sebagai LUNAS (Tunai)?`)) {
    markQuickPaid(idSesi, idSiswa);
  }
}

// ─────────────────────────────────────────────
// Manual Search Siswa
// ─────────────────────────────────────────────

function handleManualSearch(e) {
  const query = e.target.value.trim().toLowerCase();
  if (query.length === 0) {
    studentSearchResults.style.display = 'none';
    return;
  }

  const matches = appData.siswa.filter(s => 
    s.nama.toLowerCase().includes(query) ||
    s.panggilan.toLowerCase().includes(query) ||
    s.idSiswa.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    studentSearchResults.innerHTML = '<div style="padding: 12px; color: var(--text-muted); font-size: 0.9rem;">Tidak ditemukan siswa yang cocok.</div>';
    studentSearchResults.style.display = 'block';
    return;
  }

  studentSearchResults.innerHTML = '';
  matches.forEach(s => {
    const item = document.createElement('div');
    item.className = 'student-item';
    item.innerHTML = `
      <div>
        <strong>${s.nama}</strong> ${s.panggilan ? `(${s.panggilan})` : ''}
        <div style="font-size: 0.8rem; color: var(--text-muted);">${s.idSiswa} • ${s.status}</div>
      </div>
      <button class="btn btn-primary btn-sm" style="width: auto;">Scan Hadir</button>
    `;
    item.onclick = () => {
      studentSearchResults.style.display = 'none';
      inputManualSearch.value = '';
      pauseScanner();
      processScan(s.idSiswa);
    };
    studentSearchResults.appendChild(item);
  });

  studentSearchResults.style.display = 'block';
}

// ─────────────────────────────────────────────
// Riwayat Kehadiran Sesi
// ─────────────────────────────────────────────

function addAttendanceRecord(record) {
  // Cegah duplikasi di tampilan lokal
  const existingIdx = sessionAttendanceList.findIndex(a => a.idSiswa === record.idSiswa);
  if (existingIdx !== -1) {
    sessionAttendanceList[existingIdx] = record;
  } else {
    sessionAttendanceList.unshift(record);
  }
  renderAttendanceList();
}

function renderAttendanceList() {
  attendanceCount.textContent = `${sessionAttendanceList.length} Hadir`;

  if (sessionAttendanceList.length === 0) {
    attendanceList.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 12px 0;">Belum ada siswa yang discan pada sesi ini.</p>';
    return;
  }

  attendanceList.innerHTML = '';
  sessionAttendanceList.forEach(item => {
    const el = document.createElement('div');
    el.className = 'attendance-item';
    const isPaid = item.statusBayar === 'Lunas';
    el.innerHTML = `
      <div>
        <div class="attendance-name">${item.nama} (${item.idSiswa})</div>
        <div class="attendance-time">${item.timestamp}</div>
      </div>
      <div>
        <button class="badge-${isPaid ? 'paid' : 'unpaid'}" style="cursor: pointer; border: none; font-family: inherit;" onclick="promptMarkPaid('${item.idSesi}', '${item.idSiswa}', '${item.nama}', ${isPaid})" title="Klik untuk ubah status bayar">
          ${item.statusBayar || 'Belum'} ${isPaid ? '✓' : '✎'}
        </button>
      </div>
    `;
    attendanceList.appendChild(el);
  });
}
