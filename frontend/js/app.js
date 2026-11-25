/**
 * app.js — Logika Frontend Pelatih Absensi Silat Putra Setia Rawa Bebek
 * Milestone 2 & 3: Login Pelatih, Sesi Aktif, Scan Kamera QR, Feedback, Cari Manual, Pembayaran Lunas,
 *                  Izin/Sakit Manual, Hapus Kehadiran, Tutup Sesi.
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
let isFastScanMode = localStorage.getItem('fast_scan_mode') !== 'false'; // Default TRUE
let isTorchOn = false;
let currentRosterFilter = 'hadir'; // 'hadir' | 'belum' | 'semua'
let cachedRevenueData = null; // Cache data pendapatan bulanan untuk Salin WA
let supportsBulkMarkPaid = null; // Deteksi endpoint bulkMarkPaid pada backend

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

function showScanToast(type, title, desc, duration = 1800) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `scan-toast ${type}`;
  const iconSvg = type === 'success' 
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    : (type === 'duplicate' 
       ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
       : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>');
  
  toast.innerHTML = `
    <div class="scan-toast-icon">${iconSvg}</div>
    <div class="scan-toast-body">
      <div class="scan-toast-title">${title}</div>
      <div class="scan-toast-desc">${desc}</div>
    </div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
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
const btnFastScanToggle = document.getElementById('btnFastScanToggle');
const fastScanLabel = document.getElementById('fastScanLabel');
const btnFlashlight = document.getElementById('btnFlashlight');

const feedbackCard = document.getElementById('feedbackCard');
const feedbackTitle = document.getElementById('feedbackTitle');
const feedbackDesc = document.getElementById('feedbackDesc');
const feedbackActions = document.getElementById('feedbackActions');

const inputManualSearch = document.getElementById('inputManualSearch');
const studentSearchResults = document.getElementById('studentSearchResults');

const attendanceCount = document.getElementById('attendanceCount');
const attendanceList = document.getElementById('attendanceList');

const scanModal = document.getElementById('scanModal');
const modalIconContainer = document.getElementById('modalIconContainer');
const modalTitle = document.getElementById('modalTitle');
const modalStudentName = document.getElementById('modalStudentName');
const modalStudentMeta = document.getElementById('modalStudentMeta');
const modalStatusBadge = document.getElementById('modalStatusBadge');
const modalActions = document.getElementById('modalActions');

// M3: Tutup Sesi
const btnCloseSession = document.getElementById('btnCloseSession');

// M4: Tab & Roster & Pendapatan & Tunggakan & Sesi
const bottomNav = document.getElementById('bottomNav');
const navTabs = document.querySelectorAll('.bottom-nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');
const rosterFilterBtns = document.querySelectorAll('.roster-segment-btn');
const rosterCountHadir = document.getElementById('rosterCountHadir');
const rosterCountBelum = document.getElementById('rosterCountBelum');
const rosterCountSemua = document.getElementById('rosterCountSemua');
const rosterProgressFill = document.getElementById('rosterProgressFill');
const inputMonthRevenue = document.getElementById('inputMonthRevenue');
const btnRefreshRevenue = document.getElementById('btnRefreshRevenue');
const btnCopyReportWA = document.getElementById('btnCopyReportWA');
const revTotalHadir = document.getElementById('revTotalHadir');
const revTotalSesi = document.getElementById('revTotalSesi');
const revTotalDiterima = document.getElementById('revTotalDiterima');
const revTotalPiutang = document.getElementById('revTotalPiutang');
const revUmumHadirSesi = document.getElementById('revUmumHadirSesi');
const revUmumUang = document.getElementById('revUmumUang');
const revKhususHadirSesi = document.getElementById('revKhususHadirSesi');
const revKhususUang = document.getElementById('revKhususUang');
const tableRevenuePerSesiBody = document.getElementById('tableRevenuePerSesiBody');

const btnRefreshDebtors = document.getElementById('btnRefreshDebtors');
const debtorSummaryText = document.getElementById('debtorSummaryText');
const debtorsList = document.getElementById('debtorsList');

const btnRefreshSessions = document.getElementById('btnRefreshSessions');
const sessionsManageList = document.getElementById('sessionsManageList');
const sessionModal = document.getElementById('sessionModal');
const modalSessionTitle = document.getElementById('modalSessionTitle');
const editSessionId = document.getElementById('editSessionId');
const editSessionStatus = document.getElementById('editSessionStatus');
const editSessionActualDate = document.getElementById('editSessionActualDate');
const editSessionKeterangan = document.getElementById('editSessionKeterangan');
const btnSaveSessionEdit = document.getElementById('btnSaveSessionEdit');
const btnCancelSessionEdit = document.getElementById('btnCancelSessionEdit');

const btnOpenCreateSessionModal = document.getElementById('btnOpenCreateSessionModal');
const createSessionModal = document.getElementById('createSessionModal');
const newSessionDate = document.getElementById('newSessionDate');
const newSessionJenis = document.getElementById('newSessionJenis');
const newSessionTarif = document.getElementById('newSessionTarif');
const newSessionKeterangan = document.getElementById('newSessionKeterangan');
const btnSaveNewSession = document.getElementById('btnSaveNewSession');
const btnCancelNewSession = document.getElementById('btnCancelNewSession');

const sessionPickerModal = document.getElementById('sessionPickerModal');
const sessionPickerList = document.getElementById('sessionPickerList');
const btnPickerClose = document.getElementById('btnPickerClose');
const btnPickerCreateSession = document.getElementById('btnPickerCreateSession');

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
  btnToggleSessionSelect.addEventListener('click', openSessionPickerModal);
  selectSession.addEventListener('change', handleSessionChange);
  btnToggleCamera.addEventListener('click', toggleCamera);
  inputManualSearch.addEventListener('input', handleManualSearch);
  if (btnCloseSession) btnCloseSession.addEventListener('click', handleCloseSession);

  // M4 Event Listeners
  if (bottomNav) {
    bottomNav.addEventListener('click', (e) => {
      const btn = e.target.closest('.bottom-nav-item');
      if (btn && btn.dataset.tab) {
        e.preventDefault();
        switchTab(btn.dataset.tab);
      }
    });
  }
  navTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(tab.dataset.tab);
    });
  });
  rosterFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => setRosterFilter(btn.dataset.rosterFilter));
  });

  if (btnRefreshRevenue) btnRefreshRevenue.addEventListener('click', () => loadRevenueMonth(inputMonthRevenue.value));
  if (inputMonthRevenue) inputMonthRevenue.addEventListener('change', () => loadRevenueMonth(inputMonthRevenue.value));
  if (btnCopyReportWA) btnCopyReportWA.addEventListener('click', copyRevenueReportWA);
  if (btnRefreshDebtors) btnRefreshDebtors.addEventListener('click', () => loadDebtors());
  if (btnRefreshSessions) btnRefreshSessions.addEventListener('click', () => renderSessionsManage());
  if (btnSaveSessionEdit) btnSaveSessionEdit.addEventListener('click', handleSaveSessionEdit);
  if (btnCancelSessionEdit) btnCancelSessionEdit.addEventListener('click', closeSessionEditModal);
  if (btnOpenCreateSessionModal) btnOpenCreateSessionModal.addEventListener('click', openCreateSessionModal);
  if (btnCancelNewSession) btnCancelNewSession.addEventListener('click', closeCreateSessionModal);
  if (btnSaveNewSession) btnSaveNewSession.addEventListener('click', handleSaveNewSession);
  if (newSessionJenis) newSessionJenis.addEventListener('change', handleNewSessionJenisChange);

  if (btnPickerClose) btnPickerClose.addEventListener('click', closeSessionPickerModal);
  if (btnPickerCreateSession) {
    btnPickerCreateSession.addEventListener('click', () => {
      closeSessionPickerModal();
      openCreateSessionModal();
    });
  }
  if (sessionPickerModal) {
    sessionPickerModal.addEventListener('click', (e) => {
      if (e.target === sessionPickerModal) closeSessionPickerModal();
    });
  }
  if (sessionPickerList) {
    sessionPickerList.addEventListener('click', (e) => {
      const card = e.target.closest('[data-picker-session-id]');
      if (card) {
        const sid = card.dataset.pickerSessionId;
        if (sid) selectSessionById(sid);
      }
    });
  }

  // Fast Scan & Flashlight
  if (btnFastScanToggle) {
    updateFastScanUI();
    btnFastScanToggle.addEventListener('click', toggleFastScanMode);
  }
  if (btnFlashlight) {
    btnFlashlight.addEventListener('click', toggleFlashlight);
  }
});

function toggleFastScanMode() {
  isFastScanMode = !isFastScanMode;
  localStorage.setItem('fast_scan_mode', isFastScanMode ? 'true' : 'false');
  updateFastScanUI();
}

function updateFastScanUI() {
  if (!btnFastScanToggle) return;
  btnFastScanToggle.classList.toggle('active', isFastScanMode);
  if (fastScanLabel) {
    fastScanLabel.textContent = isFastScanMode ? 'Mode Cepat' : 'Mode Detail';
  }
}

async function toggleFlashlight() {
  if (!html5QrCode || !isScannerRunning) return;
  try {
    isTorchOn = !isTorchOn;
    await html5QrCode.applyVideoConstraints({
      advanced: [{ torch: isTorchOn }]
    });
    if (btnFlashlight) {
      btnFlashlight.classList.toggle('active', isTorchOn);
      btnFlashlight.style.backgroundColor = isTorchOn ? 'var(--accent)' : '';
      btnFlashlight.style.color = isTorchOn ? '#212529' : '';
    }
  } catch (err) {
    console.warn('Senter tidak didukung pada kamera/browser ini:', err);
    isTorchOn = false;
    if (btnFlashlight) {
      btnFlashlight.classList.remove('active');
      btnFlashlight.style.backgroundColor = '';
      btnFlashlight.style.color = '';
    }
  }
}

// ─────────────────────────────────────────────
// Auth / Login
// ─────────────────────────────────────────────

function showLogin() {
  loginSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
  coachProfileHeader.classList.add('hidden');
  if (bottomNav) bottomNav.classList.add('hidden');
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
  if (confirm('Keluar dari aplikasi absensi pelatih?')) {
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
  if (bottomNav) bottomNav.classList.remove('hidden');
  coachDisplayName.textContent = currentUser.nama;

  sessionTitle.textContent = 'Memuat data sesi...';

  try {
    const res = await apiRequest('bootstrap');

    if (!res.ok) {
      if (res.code === 'unauthorized') {
        showScanToast('error', 'Sesi Masuk Berakhir', 'Sesi login telah berakhir. Silakan masuk kembali.', 3000);
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

    // M4: Set default bulan di input
    if (inputMonthRevenue && appData.today) {
      inputMonthRevenue.value = appData.today.substring(0, 7);
    }

  } catch (err) {
    sessionTitle.textContent = 'Koneksi gagal. Muat ulang halaman.';
  }
}

function formatTanggalIndo(ymd) {
  if (!ymd) return '-';
  const parts = String(ymd).split('-');
  if (parts.length < 3) return ymd;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dateObj = new Date(y, m, d);
  if (isNaN(dateObj.getTime())) return ymd;
  const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulanArr = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const hari = hariArr[dateObj.getDay()];
  const bulan = bulanArr[m];
  return `${hari}, ${d} ${bulan} ${y}`;
}

function formatNamaLatihan(jenis) {
  const j = String(jenis || '').toLowerCase();
  if (j === 'khusus') return 'Latihan Khusus TC / Tanding';
  if (j === 'ujian') return 'Ujian Kenaikan Tingkat';
  return 'Latihan Reguler Sabtu Malam';
}

function findDefaultSession() {
  if (appData.sesi.length === 0) return null;
  // Cari sesi yang bukan batal
  const activeSesi = appData.sesi.find(s => s.statusSesi !== 'Batal');
  return activeSesi || appData.sesi[0];
}

function renderSessionInfo() {
  if (!appData.sesiAktif) {
    sessionTitle.textContent = 'Tidak Ada Jadwal Aktif';
    sessionMeta.innerHTML = 'Silakan pilih jadwal latihan atau jadwalkan latihan baru.';
    return;
  }

  const s = appData.sesiAktif;
  const isKhusus = s.jenis === 'Khusus';
  const tarif = s.tarif || (isKhusus ? appData.tarif.khusus : appData.tarif.umum);

  sessionBadge.textContent = s.jenis;
  sessionBadge.className = 'session-badge ' + (isKhusus ? 'badge-khusus' : 'badge-umum');
  sessionTarif.textContent = 'Rp' + tarif.toLocaleString('id-ID');

  sessionTitle.textContent = formatNamaLatihan(s.jenis);
  const tgl = s.tglEfektif || s.tglRencana || '-';
  const isToday = tgl === appData.today;
  const statusHuman = isToday
    ? '<span style="color: #2E7D32; font-weight: 700;">• Sedang Berlangsung Hari Ini</span>'
    : (tgl > appData.today
      ? '<span style="color: #8A6D0B; font-weight: 700;">• Jadwal Mendatang</span>'
      : `<span style="color: var(--text-muted);">• Sesi Lalu (${s.statusSesi === 'Terlaksana' ? 'Terlaksana' : 'Arsip'})</span>`);

  sessionMeta.innerHTML = `📅 <strong>${formatTanggalIndo(tgl)}</strong> ${statusHuman}`;

  if (btnToggleSessionSelect) {
    btnToggleSessionSelect.innerHTML = '<span>🔄 Ganti Jadwal Latihan</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  }

  if (btnCloseSession) {
    const isClosed = s.statusSesi === 'Terlaksana';
    btnCloseSession.disabled = isClosed;
    btnCloseSession.innerHTML = isClosed
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>✓ Latihan Ini Sudah Selesai & Terkunci'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>Selesaikan Latihan & Kunci Presensi';
  }

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

function openSessionPickerModal() {
  if (!sessionPickerModal) return;
  renderSessionPicker();
  sessionPickerModal.classList.remove('hidden');
}

function closeSessionPickerModal() {
  if (!sessionPickerModal) return;
  sessionPickerModal.classList.add('hidden');
}

function renderSessionPicker() {
  if (!sessionPickerList) return;
  if (!appData.sesi || appData.sesi.length === 0) {
    sessionPickerList.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 20px 0;">Belum ada jadwal sesi latihan. Silakan buat sesi baru melalui tombol di bawah.</p>';
    return;
  }

  const todayStr = appData.today || new Date().toISOString().substring(0, 10);
  const activeId = appData.sesiAktif ? appData.sesiAktif.idSesi : null;

  const sesiHariIni = [];
  const sesiMendatang = [];
  const sesiLalu = [];

  appData.sesi.forEach(s => {
    const tgl = s.tglEfektif || s.tglRencana || '';
    if (tgl === todayStr) {
      sesiHariIni.push(s);
    } else if (tgl > todayStr && s.statusSesi !== 'Terlaksana') {
      sesiMendatang.push(s);
    } else {
      sesiLalu.push(s);
    }
  });

  // Urutkan mendatang dari yang paling dekat
  sesiMendatang.sort((a, b) => (a.tglEfektif || a.tglRencana).localeCompare(b.tglEfektif || b.tglRencana));
  // Urutkan riwayat dari yang paling baru
  sesiLalu.sort((a, b) => (b.tglEfektif || b.tglRencana).localeCompare(a.tglEfektif || a.tglRencana));

  function createPickerCardHtml(s, isTodayGroup) {
    const tgl = s.tglEfektif || s.tglRencana;
    const isCurrentActive = s.idSesi === activeId;
    const isKhusus = s.jenis === 'Khusus';
    const tarif = s.tarif || (isKhusus ? appData.tarif.khusus : appData.tarif.umum);
    const badgeCls = isKhusus ? 'badge-khusus' : 'badge-umum';
    const cardCls = `session-picker-card ${isTodayGroup ? 'is-today' : ''} ${isCurrentActive ? 'active' : ''}`;
    const statusText = s.statusSesi === 'Terlaksana' ? '✓ Sudah Terlaksana' : (s.statusSesi === 'Batal' ? '✕ Batal' : 'Terjadwal');

    return `
      <div class="${cardCls}" data-picker-session-id="${escapeHtml(s.idSesi)}" role="button" tabindex="0" aria-label="Pilih sesi ${escapeHtml(formatNamaLatihan(s.jenis))}">
        <div class="session-picker-info">
          <div class="session-picker-name">
            ${isCurrentActive ? '🟢 ' : ''}${escapeHtml(formatNamaLatihan(s.jenis))}
          </div>
          <div class="session-picker-date">
            <span>📅 ${escapeHtml(formatTanggalIndo(tgl))}</span>
            <span class="session-badge ${badgeCls}" style="font-size: 0.7rem; padding: 2px 7px;">${escapeHtml(s.jenis)}</span>
            <span style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(s.idSesi)}</span>
          </div>
          <div class="session-picker-meta">
            <span>Tarif: Rp${tarif.toLocaleString('id-ID')}</span> • <span>${statusText}</span>
          </div>
        </div>
        <div>
          ${isCurrentActive
            ? '<button type="button" class="btn btn-secondary session-picker-btn" style="pointer-events: none; border-color: var(--accent); color: var(--primary);">✓ Aktif</button>'
            : `<button type="button" class="btn btn-primary session-picker-btn" data-picker-btn-id="${escapeHtml(s.idSesi)}">Pilih Sesi</button>`
          }
        </div>
      </div>
    `;
  }

  let html = '';

  if (sesiHariIni.length > 0) {
    html += `
      <div class="session-picker-group">
        <div class="session-picker-group-title">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#2E7D32;"></span>
          ⚡ Sesi Latihan Hari Ini
        </div>
        ${sesiHariIni.map(s => createPickerCardHtml(s, true)).join('')}
      </div>
    `;
  }

  if (sesiMendatang.length > 0) {
    html += `
      <div class="session-picker-group">
        <div class="session-picker-group-title">
          🗓️ Jadwal Latihan Mendatang
        </div>
        ${sesiMendatang.map(s => createPickerCardHtml(s, false)).join('')}
      </div>
    `;
  }

  if (sesiLalu.length > 0) {
    html += `
      <div class="session-picker-group">
        <div class="session-picker-group-title">
          📁 Riwayat Sesi Lalu (Arsip / Susulan)
        </div>
        ${sesiLalu.map(s => createPickerCardHtml(s, false)).join('')}
      </div>
    `;
  }

  sessionPickerList.innerHTML = html;
}

function selectSessionById(sessionId) {
  const found = appData.sesi.find(s => s.idSesi === sessionId);
  if (found) {
    appData.sesiAktif = found;
    if (selectSession) selectSession.value = sessionId;
    renderSessionInfo();
    closeSessionPickerModal();
    playChime('neutral');
    showScanToast('info', 'Jadwal Dipilih', formatNamaLatihan(found.jenis));
  }
}

function toggleSessionDropdown() {
  openSessionPickerModal();
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

function openScanModal(iconType, title, studentName, studentMeta, statusHtml, actions = []) {
  if (modalIconContainer) {
    if (iconType === 'success' || iconType === '✅') {
      modalIconContainer.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>';
      modalIconContainer.style.background = 'var(--success-bg)';
      modalIconContainer.style.color = 'var(--success)';
    } else if (iconType === 'warning' || iconType === '⚠️') {
      modalIconContainer.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
      modalIconContainer.style.background = 'var(--warning-bg)';
      modalIconContainer.style.color = 'var(--warning)';
    } else {
      modalIconContainer.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
      modalIconContainer.style.background = 'var(--danger-bg)';
      modalIconContainer.style.color = 'var(--danger)';
    }
  }

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
    openScanModal('warning', 'Sesi Belum Dipilih', '-', 'Silakan pilih sesi aktif terlebih dahulu sebelum scan.', '<span class="badge-unpaid">Sesi Kosong</span>', [
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
    openScanModal('danger', 'QR Tidak Dikenali', `Format ID: ${idSiswa}`, 'Format QR tidak sesuai (contoh: S001).', '<span class="badge-unpaid">Bukan Kartu Siswa</span>', [
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
    openScanModal('danger', 'Koneksi Error', `ID: ${idSiswa}`, 'Gagal menghubungi server. Periksa jaringan internet kamu.', '<span class="badge-unpaid">Koneksi Putus</span>', [
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
    vibrate([80]);

    // Tambahkan ke riwayat tampilan
    addAttendanceRecord(record);

    // Jika Mode Cepat aktif, tampilkan toast dan auto-resume tanpa modal
    if (isFastScanMode) {
      showScanToast('success', `${displayName} Hadir!`, `ID: ${record.idSiswa} • Jam: ${record.timestamp}`);
      setTimeout(() => {
        resumeScanner();
      }, 1000);
      return;
    }

    // Tampilkan Pop-up Pembayaran & Jeda Kamera (Mode Detail)
    openScanModal(
      'success',
      'Kehadiran Tercatat!',
      displayName,
      `ID: ${record.idSiswa} • Jam: ${record.timestamp}`,
      `<span class="badge-unpaid">Status: Belum Lunas</span>`,
      [
        {
          text: `Bayar Lunas (Tunai ${tarifText})`,
          class: 'btn-success',
          onClick: async () => {
            await markQuickPaid(record.idSesi, record.idSiswa);
            resumeScanner();
          }
        },
        {
          text: 'Belum Bayar (Lanjut Scan)',
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

    // Jika Mode Cepat aktif, tampilkan toast peringatan dan auto-resume
    if (isFastScanMode) {
      showScanToast('duplicate', `${studentName} (Sudah Hadir)`, `Discan jam: ${jamHadir} • ${isPaid ? 'Lunas ✓' : 'Belum Lunas'}`);
      setTimeout(() => {
        resumeScanner();
      }, 1200);
      return;
    }

    const actions = [];
    if (!isPaid) {
      actions.push({
        text: 'Tandai Lunas Sekarang',
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
      'warning',
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
      'warning',
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
      'warning',
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
    'danger',
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
      
      // Update item di daftar kehadiran lokal (khusus sesi yang cocok)
      const item = sessionAttendanceList.find(a => a.idSesi === idSesi && a.idSiswa === idSiswa);
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
    showScanToast('info', 'Sudah Lunas', `Siswa ${nama} sudah berstatus LUNAS.`);
    return;
  }
  if (confirm(`Tandai iuran ${nama} (${idSiswa}) sebagai LUNAS (Tunai)?`)) {
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
        <strong>${escapeHtml(s.nama)}</strong> ${s.panggilan ? `(${escapeHtml(s.panggilan)})` : ''}
        <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(s.idSiswa)} • ${escapeHtml(s.status)}</div>
      </div>
      <button class="btn btn-primary btn-sm" style="width: auto;" aria-label="Tandai hadir ${escapeHtml(s.nama)}">Hadir</button>
    `;
    // Tombol Hadir: langsung proses scan
    item.querySelector('button').addEventListener('click', (e) => {
      e.stopPropagation();
      studentSearchResults.style.display = 'none';
      inputManualSearch.value = '';
      pauseScanner();
      processScan(s.idSiswa);
    });
    // Klik baris nama: tampilkan opsi Hadir / Izin / Sakit
    item.addEventListener('click', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      studentSearchResults.style.display = 'none';
      inputManualSearch.value = '';
      showAttendanceOptions(s);
    });
    studentSearchResults.appendChild(item);
  });

  studentSearchResults.style.display = 'block';
}

// ─────────────────────────────────────────────
// Riwayat Kehadiran Sesi & Filter Roster
// ─────────────────────────────────────────────

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setRosterFilter(filter) {
  currentRosterFilter = filter || 'hadir';
  rosterFilterBtns.forEach(btn => {
    const isActive = btn.dataset.rosterFilter === currentRosterFilter;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  renderAttendanceList();
}

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

function createAttendedRow(item) {
  const el = document.createElement('div');
  el.className = 'roster-item attended';
  const isPaid = item.statusBayar === 'Lunas';
  const statusHadirLabel = item.statusHadir === 'Izin'
    ? ' <span style="font-size:0.75rem; color:#1565c0; font-weight:700;">(Izin)</span>'
    : item.statusHadir === 'Sakit'
      ? ' <span style="font-size:0.75rem; color:#e65100; font-weight:700;">(Sakit)</span>'
      : '';

  const payIconSvg = isPaid
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>';

  el.innerHTML = `
    <div style="flex: 1; min-width: 0; padding-right: 8px;">
      <div class="attendance-name">${escapeHtml(item.nama)} (${escapeHtml(item.idSiswa)})${statusHadirLabel}</div>
      <div class="attendance-time">${escapeHtml(item.timestamp || '-')}</div>
    </div>
    <div class="roster-quick-actions">
      <button type="button" class="badge-${isPaid ? 'paid' : 'unpaid'} btn-touch-badge" aria-label="Status pembayaran ${escapeHtml(item.nama)}: ${isPaid ? 'Lunas' : 'Belum Lunas'}. Ketuk untuk ubah">
        <span>${escapeHtml(item.statusBayar || 'Belum')}</span>
        ${payIconSvg}
      </button>
      <button type="button" class="btn btn-secondary btn-icon btn-touch-icon" aria-label="Hapus kehadiran ${escapeHtml(item.nama)}" title="Hapus kehadiran">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    </div>
  `;

  el.querySelector('.btn-touch-badge').addEventListener('click', () => {
    promptMarkPaid(item.idSesi, item.idSiswa, item.nama, isPaid);
  });
  el.querySelector('.btn-touch-icon').addEventListener('click', () => {
    promptDeleteAttendance(item.idSesi, item.idSiswa, item.nama);
  });
  return el;
}

function createUnattendedRow(student, isKhususSession, pesertaKhususSet) {
  const el = document.createElement('div');
  el.className = 'roster-item unattended';
  const isKhususMember = isKhususSession && pesertaKhususSet.has(student.idSiswa);
  const khususPill = isKhususMember
    ? ' <span style="font-size:0.7rem; background:var(--accent-light); color:#7B5E00; border:1px solid var(--accent); padding:1px 6px; border-radius:8px; font-weight:700;">Khusus</span>'
    : '';
  const panggilanText = student.panggilan ? ` (${escapeHtml(student.panggilan)})` : '';

  el.innerHTML = `
    <div style="flex: 1; min-width: 0; padding-right: 8px;">
      <div class="attendance-name">${escapeHtml(student.nama)}${panggilanText}${khususPill}</div>
      <div class="attendance-time">${escapeHtml(student.idSiswa)} • ${escapeHtml(student.tingkatan || '-')}</div>
    </div>
    <div class="roster-quick-actions">
      <button type="button" class="btn btn-primary btn-sm btn-quick-hadir" aria-label="Tandai hadir ${escapeHtml(student.nama)}">Hadir</button>
      <button type="button" class="btn btn-secondary btn-sm btn-quick-izin" aria-label="Catat izin atau sakit ${escapeHtml(student.nama)}">Izin</button>
    </div>
  `;

  const btnHadir = el.querySelector('.btn-quick-hadir');
  btnHadir.addEventListener('click', () => quickMarkStudentPresent(student, btnHadir));

  const btnIzin = el.querySelector('.btn-quick-izin');
  btnIzin.addEventListener('click', () => showAttendanceOptions(student));

  return el;
}

async function quickMarkStudentPresent(student, btnEl) {
  if (!appData.sesiAktif) {
    showScanToast('warning', 'Pilih Jadwal Latihan', 'Silakan pilih jadwal latihan aktif terlebih dahulu.');
    return;
  }
  if (isProcessingScan) return;

  const originalText = btnEl.textContent;
  btnEl.disabled = true;
  btnEl.textContent = '...';
  pauseScanner();

  try {
    await processScan(student.idSiswa);
  } finally {
    if (document.body.contains(btnEl)) {
      btnEl.disabled = false;
      btnEl.textContent = originalText;
    }
  }
}

function renderAttendanceList() {
  const activeStudents = (appData.siswa || []).filter(s => (s.status || '').toLowerCase() === 'aktif');
  const attendedMap = new Map(sessionAttendanceList.map(item => [item.idSiswa, item]));
  const isKhususSession = Boolean(appData.sesiAktif && appData.sesiAktif.jenis === 'Khusus');
  const pesertaKhususSet = new Set(appData.pesertaKhusus || []);

  // Siswa aktif yang belum tercatat pada sesi ini
  const belumList = activeStudents.filter(s => !attendedMap.has(s.idSiswa));
  belumList.sort((a, b) => {
    if (isKhususSession) {
      const aKhusus = pesertaKhususSet.has(a.idSiswa) ? 0 : 1;
      const bKhusus = pesertaKhususSet.has(b.idSiswa) ? 0 : 1;
      if (aKhusus !== bKhusus) return aKhusus - bKhusus;
    }
    return (a.nama || '').localeCompare(b.nama || '', 'id');
  });

  // Gabungkan siswa aktif + siswa nonaktif yang tetap hadir (jika ada) untuk tab Semua
  const allStudentsMap = new Map();
  activeStudents.forEach(s => allStudentsMap.set(s.idSiswa, s));
  sessionAttendanceList.forEach(a => {
    if (!allStudentsMap.has(a.idSiswa)) {
      allStudentsMap.set(a.idSiswa, { idSiswa: a.idSiswa, nama: a.nama, panggilan: '', tingkatan: '-' });
    }
  });
  const semuaList = Array.from(allStudentsMap.values()).sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id'));

  const hadirCount = sessionAttendanceList.length;
  const activeCount = activeStudents.length;
  const pct = activeCount > 0 ? Math.min(100, Math.round((hadirCount / activeCount) * 100)) : 0;

  if (attendanceCount) {
    attendanceCount.textContent = activeCount > 0
      ? `${hadirCount} dari ${activeCount} Hadir (${pct}%)`
      : `${hadirCount} Hadir`;
  }
  if (rosterCountHadir) rosterCountHadir.textContent = hadirCount;
  if (rosterCountBelum) rosterCountBelum.textContent = belumList.length;
  if (rosterCountSemua) rosterCountSemua.textContent = semuaList.length;
  if (rosterProgressFill) rosterProgressFill.style.width = `${pct}%`;

  attendanceList.innerHTML = '';

  if (currentRosterFilter === 'hadir') {
    if (sessionAttendanceList.length === 0) {
      attendanceList.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 12px 0;">Belum ada siswa yang discan pada sesi ini.</p>';
      return;
    }
    sessionAttendanceList.forEach(item => {
      attendanceList.appendChild(createAttendedRow(item));
    });
    return;
  }

  if (currentRosterFilter === 'belum') {
    if (belumList.length === 0) {
      attendanceList.innerHTML = '<p style="font-size: 0.85rem; color: var(--success); text-align: center; padding: 14px 0; font-weight: 700;">Semua siswa aktif sudah tercatat pada sesi ini.</p>';
      return;
    }
    belumList.forEach(student => {
      attendanceList.appendChild(createUnattendedRow(student, isKhususSession, pesertaKhususSet));
    });
    return;
  }

  // Filter: 'semua'
  if (semuaList.length === 0) {
    attendanceList.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 12px 0;">Data siswa belum tersedia.</p>';
    return;
  }
  semuaList.forEach(student => {
    const attendedRecord = attendedMap.get(student.idSiswa);
    if (attendedRecord) {
      attendanceList.appendChild(createAttendedRow(attendedRecord));
    } else {
      attendanceList.appendChild(createUnattendedRow(student, isKhususSession, pesertaKhususSet));
    }
  });
}

// ─────────────────────────────────────────────
// M3: Opsi Kehadiran Manual (Hadir/Izin/Sakit)
// ─────────────────────────────────────────────

function showAttendanceOptions(siswa) {
  if (!appData.sesiAktif) {
    showScanToast('warning', 'Pilih Jadwal Latihan', 'Silakan pilih jadwal latihan aktif terlebih dahulu.');
    return;
  }
  openScanModal(
    'warning',
    'Catat Kehadiran Manual',
    `${siswa.nama} ${siswa.panggilan ? '(' + siswa.panggilan + ')' : ''}`,
    `ID: ${siswa.idSiswa} • Pilih status kehadiran`,
    `<span class="badge-unpaid">Pilih Status</span>`,
    [
      {
        text: 'Hadir (Siswa Hadir)',
        class: 'btn-primary',
        onClick: () => {
          closeScanModal();
          pauseScanner();
          processScan(siswa.idSiswa);
        }
      },
      {
        text: 'Izin (Ada Keperluan)',
        class: 'btn-secondary',
        onClick: async () => {
          closeScanModal();
          await submitSetAttendance(siswa.idSiswa, 'Izin', siswa.nama);
        }
      },
      {
        text: 'Sakit (Tidak Enak Badan)',
        class: 'btn-secondary',
        onClick: async () => {
          closeScanModal();
          await submitSetAttendance(siswa.idSiswa, 'Sakit', siswa.nama);
        }
      },
      {
        text: 'Batal',
        class: 'btn-secondary',
        onClick: () => resumeScanner()
      }
    ]
  );
}

async function submitSetAttendance(idSiswa, statusHadir, namaDisplay) {
  showFeedback('warning', 'Menyimpan...', `Mencatat ${statusHadir} untuk ${namaDisplay}...`);
  try {
    const res = await apiRequest('setAttendance', {
      idSesi: appData.sesiAktif.idSesi,
      idSiswa: idSiswa,
      statusHadir: statusHadir
    });
    if (res.ok) {
      playChime('success');
      vibrate([150]);
      // Reload daftar dari server
      await loadSessionAttendance(appData.sesiAktif.idSesi);
      showFeedback('success', `${statusHadir} Tercatat`, `${namaDisplay} dicatat ${statusHadir}.`);
    } else {
      showFeedback('danger', 'Gagal', res.message || 'Gagal menyimpan status.');
    }
  } catch (err) {
    showFeedback('danger', 'Koneksi Error', 'Gagal menghubungi server.');
  }
  resumeScanner();
}

// ─────────────────────────────────────────────
// M3: Hapus Kehadiran
// ─────────────────────────────────────────────

function promptDeleteAttendance(idSesi, idSiswa, nama) {
  openScanModal(
    'danger',
    'Hapus Kehadiran?',
    nama,
    `ID: ${idSiswa} • Sesi: ${idSesi}`,
    `<span class="badge-unpaid">Konfirmasi Hapus</span>`,
    [
      {
        text: 'Ya, Hapus',
        class: 'btn-danger',
        onClick: async () => {
          closeScanModal();
          await submitDeleteAttendance(idSesi, idSiswa, nama);
        }
      },
      {
        text: 'Batal',
        class: 'btn-secondary',
        onClick: () => closeScanModal()
      }
    ]
  );
}

async function submitDeleteAttendance(idSesi, idSiswa, namaDisplay) {
  showFeedback('warning', 'Menghapus...', `Menghapus kehadiran ${namaDisplay}...`);
  try {
    const res = await apiRequest('deleteAttendance', { idSesi, idSiswa });
    if (res.ok) {
      playChime('success');
      vibrate([150]);
      // Hapus dari daftar lokal
      sessionAttendanceList = sessionAttendanceList.filter(a => a.idSiswa !== idSiswa);
      renderAttendanceList();
      showFeedback('success', 'Kehadiran Dihapus', `${namaDisplay} telah dihapus dari sesi ini.`);
    } else {
      showFeedback('danger', 'Gagal Hapus', res.message || 'Gagal menghapus.');
    }
  } catch (err) {
    showFeedback('danger', 'Koneksi Error', 'Gagal menghubungi server.');
  }
}

// ─────────────────────────────────────────────
// M3: Tutup Sesi
// ─────────────────────────────────────────────

async function handleCloseSession() {
  if (!appData.sesiAktif) {
    showScanToast('warning', 'Tidak Ada Jadwal Aktif', 'Tidak ada jadwal latihan aktif yang bisa diselesaikan.');
    return;
  }
  const sesi = appData.sesiAktif;
  const tglTutup = sesi.tglEfektif || sesi.tglRencana;
  if (!confirm(`Selesaikan latihan ini dan kunci daftar presensi?\n\nJadwal: ${formatNamaLatihan(sesi.jenis)}\nTanggal: ${formatTanggalIndo(tglTutup)}\nTotal hadir: ${sessionAttendanceList.length} siswa.\n\nSetelah dikunci, sesi ditandai Terlaksana.`)) {
    return;
  }
  const lockSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
  btnCloseSession.disabled = true;
  btnCloseSession.innerHTML = '<span class="spinner" style="border-color: rgba(123,19,23,0.25); border-top-color: var(--primary);"></span> Mengunci presensi...';
  showFeedback('warning', 'Mengunci Presensi...', `Menyimpan status selesai untuk ${formatNamaLatihan(sesi.jenis)}...`);
  try {
    const res = await apiRequest('updateSession', {
      idSesi: sesi.idSesi,
      statusSesi: 'Terlaksana'
    });
    if (res.ok) {
      playChime('success');
      vibrate([200, 100, 200]);
      // Update data sesi di local state
      if (res.data && res.data.sesi) {
        appData.sesiAktif = res.data.sesi;
        // Update juga di daftar sesi
        const idx = appData.sesi.findIndex(s => s.idSesi === sesi.idSesi);
        if (idx !== -1) appData.sesi[idx] = res.data.sesi;
        renderSessionInfo();
      }
      showFeedback('success', 'Latihan Selesai & Terkunci', `Presensi ${formatNamaLatihan(sesi.jenis)} berhasil dikunci.`);
      btnCloseSession.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 6px;"><polyline points="20 6 9 17 4 12"></polyline></svg>✓ Latihan Ini Sudah Selesai & Terkunci';
    } else {
      showFeedback('danger', 'Gagal Kunci Presensi', res.message || 'Gagal mengubah status sesi.');
      btnCloseSession.disabled = false;
      btnCloseSession.innerHTML = `${lockSvg}Selesaikan Latihan & Kunci Presensi`;
    }
  } catch (err) {
    showFeedback('danger', 'Koneksi Error', 'Gagal menghubungi server.');
    btnCloseSession.disabled = false;
    btnCloseSession.innerHTML = `${lockSvg}Selesaikan Latihan & Kunci Presensi`;
  }
}

// ─────────────────────────────────────────────
// M4: Navigasi Tab
// ─────────────────────────────────────────────

function switchTab(tabId) {
  if (!tabId) return;

  const currentNavTabs = document.querySelectorAll('.bottom-nav-item');
  currentNavTabs.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  const currentPanes = document.querySelectorAll('.tab-pane');
  currentPanes.forEach(pane => {
    pane.classList.toggle('hidden', pane.id !== tabId);
  });

  window.scrollTo({ top: 0, behavior: 'instant' });

  if (tabId === 'panePresensi') {
    resumeScanner();
  } else {
    pauseScanner();
  }

  if (tabId === 'panePendapatan') {
    const bulan = (inputMonthRevenue && inputMonthRevenue.value) || (appData.today ? appData.today.substring(0, 7) : new Date().toISOString().substring(0, 7));
    loadRevenueMonth(bulan);
  } else if (tabId === 'paneTunggakan') {
    loadDebtors();
  } else if (tabId === 'paneKelolaSesi') {
    renderSessionsManage();
  }
}

// ─────────────────────────────────────────────
// M4: Pendapatan & Rekap Bulanan
// ─────────────────────────────────────────────

async function loadRevenueMonth(month) {
  if (!month) {
    month = appData.today ? appData.today.substring(0, 7) : new Date().toISOString().substring(0, 7);
  }
  cachedRevenueData = null;
  tableRevenuePerSesiBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px 0;">Memuat pendapatan...</td></tr>';
  try {
    const res = await apiRequest('revenueMonth', { bulan: month });
    if (res.ok && res.data) {
      renderRevenueData(res.data, month);
    } else {
      tableRevenuePerSesiBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger); padding: 12px 0;">${res.message || 'Gagal memuat data.'}</td></tr>`;
    }
  } catch (err) {
    tableRevenuePerSesiBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger); padding: 12px 0;">Koneksi gagal.</td></tr>';
  }
}

function formatBulanIndo(ym) {
  const bulanNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const parts = String(ym || '').split('-');
  if (parts.length !== 2) return ym || '-';
  const idx = parseInt(parts[1], 10) - 1;
  return `${bulanNames[idx] || parts[1]} ${parts[0]}`;
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('Copy fallback gagal');
}

async function copyRevenueReportWA() {
  if (!cachedRevenueData || !cachedRevenueData.ringkasan) {
    showScanToast('duplicate', 'Data Belum Siap', 'Tunggu data pendapatan selesai dimuat.');
    return;
  }

  const r = cachedRevenueData.ringkasan;
  const perSesi = cachedRevenueData.perSesi || [];
  const bulanLabel = formatBulanIndo(cachedRevenueData.bulan);
  const sesiLines = perSesi.map(s => {
    const tglIndo = formatTanggalIndo(s.tanggal);
    const namaSesi = formatNamaLatihan(s.jenis);
    return `• ${namaSesi} (${tglIndo}): ${s.jumlahHadir} siswa | Masuk: Rp${s.diterima.toLocaleString('id-ID')}${s.piutang > 0 ? ` | Belum: Rp${s.piutang.toLocaleString('id-ID')}` : ''}`;
  }).join('\n');

  const lines = [
    '🥋 *LAPORAN REKAP KAS LATIHAN SILAT PUTRA SETIA*',
    '📍 Cabang Rawa Bebek',
    `🗓️ Periode: *${bulanLabel}*`,
    '────────────────────────',
    `👥 Total Siswa Hadir: *${r.total.totalHadir} siswa*`,
    `🥋 Total Sesi Terlaksana: *${r.total.jumlahSesi} sesi latihan*`,
    '',
    `💰 *Kas Masuk (Lunas): Rp${r.total.diterima.toLocaleString('id-ID')}*`,
    `⏳ Iuran Belum Lunas: Rp${r.total.piutang.toLocaleString('id-ID')}`,
    '────────────────────────',
    '*Rincian Per Kategori:*',
    `• Latihan Reguler (Sabtu): ${r.umum.totalHadir} hadir (${r.umum.jumlahSesi} sesi) — Rp${r.umum.diterima.toLocaleString('id-ID')}`,
    `• Latihan Khusus TC (Sel/Kam): ${r.khusus.totalHadir} hadir (${r.khusus.jumlahSesi} sesi) — Rp${r.khusus.diterima.toLocaleString('id-ID')}`
  ];

  if (sesiLines) {
    lines.push('', '*Rincian Sesi Latihan:*', sesiLines);
  }
  lines.push('', `Dilaporkan oleh: Pelatih *${currentUser.nama || 'Putra Setia'}*`, 'Semoga berkah untuk kemajuan persilatan kita bersama. Aamiin.');

  const originalHtml = btnCopyReportWA.innerHTML;
  try {
    await copyTextToClipboard(lines.join('\n'));
    playChime('success');
    vibrate([80]);
    showScanToast('success', 'Rekap Disalin', 'Siap di-paste ke grup WhatsApp.');
    btnCopyReportWA.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Tersalin ke Clipboard!</span>';
    setTimeout(() => {
      if (btnCopyReportWA) btnCopyReportWA.innerHTML = originalHtml;
    }, 2400);
  } catch (err) {
    showScanToast('error', 'Gagal Menyalin', 'Browser tidak mengizinkan akses clipboard.');
  }
}

function renderRevenueData(data, month) {
  cachedRevenueData = {
    bulan: month || (inputMonthRevenue ? inputMonthRevenue.value : ''),
    ...data
  };

  const r = data.ringkasan;
  revTotalHadir.textContent = `${r.total.totalHadir} Siswa`;
  revTotalSesi.textContent = `${r.total.jumlahSesi} Sesi`;
  revTotalDiterima.textContent = `Rp${r.total.diterima.toLocaleString('id-ID')}`;
  revTotalPiutang.textContent = `Rp${r.total.piutang.toLocaleString('id-ID')}`;

  revUmumHadirSesi.textContent = `${r.umum.totalHadir} Hadir / ${r.umum.jumlahSesi} Sesi`;
  revUmumUang.textContent = `Rp${r.umum.diterima.toLocaleString('id-ID')} / Rp${r.umum.piutang.toLocaleString('id-ID')}`;

  revKhususHadirSesi.textContent = `${r.khusus.totalHadir} Hadir / ${r.khusus.jumlahSesi} Sesi`;
  revKhususUang.textContent = `Rp${r.khusus.diterima.toLocaleString('id-ID')} / Rp${r.khusus.piutang.toLocaleString('id-ID')}`;

  // Tabel per sesi
  if (!data.perSesi || data.perSesi.length === 0) {
    tableRevenuePerSesiBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 12px 0;">Tidak ada sesi di bulan ini.</td></tr>';
    return;
  }

  tableRevenuePerSesiBody.innerHTML = '';
  data.perSesi.forEach(s => {
    const tr = document.createElement('tr');
    const badgeColor = s.jenis === 'Khusus' ? 'color: #8A6D0B;' : 'color: var(--primary);';
    const statusLabel = s.statusSesi === 'Terlaksana' ? '✓' : s.statusSesi === 'Batal' ? '✕' : '';
    tr.innerHTML = `
      <td><strong style="${badgeColor}">[${escapeHtml(s.jenis.substring(0, 1))}]</strong> ${escapeHtml(s.idSesi)} <span style="font-size: 0.7rem; color: var(--text-muted);">${statusLabel}</span></td>
      <td>${escapeHtml((s.tanggal || '').substring(5))}</td>
      <td><strong>${s.jumlahHadir}</strong></td>
      <td class="text-success" style="font-weight: 600;">Rp${s.diterima.toLocaleString('id-ID')}</td>
      <td class="${s.piutang > 0 ? 'text-danger' : 'text-muted'}" style="font-weight: 600;">Rp${s.piutang.toLocaleString('id-ID')}</td>
    `;
    tableRevenuePerSesiBody.appendChild(tr);
  });
}

// ─────────────────────────────────────────────
// M4: Daftar Tunggakan Siswa
// ─────────────────────────────────────────────

function formatWaPhone(rawPhone) {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8')) {
    digits = '62' + digits;
  }
  return digits.length >= 10 ? digits : '';
}

function buildWaBillingUrl(debtor) {
  const phone = formatWaPhone(debtor.noHpWali);
  if (!phone) return '';
  const rincian = (debtor.sesiList || []).map(item =>
    `• ${formatNamaLatihan(item.jenis)} (${formatTanggalIndo(item.tanggal)}): Rp${item.sisa.toLocaleString('id-ID')}`
  ).join('\n');

  const msg = [
    `Assalamu'alaikum Warahmatullahi Wabarakatuh.`,
    `Semoga Ayah/Bunda dari ananda *${debtor.nama}* selalu dalam keadaan sehat dan berkah.`,
    '',
    `Mohon izin kami menginformasikan catatan iuran kas latihan Silat Putra Setia Rawa Bebek yang belum terselesaikan sebanyak *${debtor.jumlahSesi} sesi latihan* dengan total *Rp${debtor.totalTunggakan.toLocaleString('id-ID')}*:`,
    rincian,
    '',
    'Iuran kas ini digunakan untuk pemeliharaan fasilitas dan operasional latihan ananda.',
    'Pembayaran dapat diserahkan langsung secara tunai kepada pelatih pada jadwal latihan berikutnya.',
    '',
    'Terima kasih banyak atas perhatian dan dukungan Ayah/Bunda.',
    `Wassalamu'alaikum Warahmatullahi Wabarakatuh.`,
    '',
    `Salam hormat,`,
    `Pelatih ${currentUser.nama || 'Putra Setia Rawa Bebek'}`
  ].join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
}

async function loadDebtors() {
  debtorsList.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 12px 0;">Memuat daftar penunggak...</p>';
  debtorSummaryText.textContent = 'Memuat...';
  try {
    const res = await apiRequest('debtors');
    if (res.ok && res.data) {
      renderDebtorsList(res.data);
    } else {
      debtorsList.innerHTML = `<p style="font-size: 0.85rem; color: var(--danger); text-align: center; padding: 12px 0;">${res.message || 'Gagal memuat tunggakan.'}</p>`;
    }
  } catch (err) {
    debtorsList.innerHTML = '<p style="font-size: 0.85rem; color: var(--danger); text-align: center; padding: 12px 0;">Koneksi gagal.</p>';
  }
}

function renderDebtorsList(data) {
  debtorSummaryText.textContent = `${data.totalSiswa} Siswa Belum Lunas • Total Rp${data.totalTunggakan.toLocaleString('id-ID')}`;

  if (!data.debtors || data.debtors.length === 0) {
    debtorsList.innerHTML = `
      <div style="text-align: center; padding: 20px 12px; color: var(--success);">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-bottom: 8px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <p style="font-size: 0.9rem; font-weight: 700;">Alhamdulillah, seluruh siswa sudah melunasi iuran kas latihan!</p>
      </div>
    `;
    return;
  }

  const waSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.031 2c-5.516 0-9.969 4.453-9.969 9.969 0 1.766.469 3.484 1.344 5.016l-1.406 5.156 5.281-1.375c1.484.813 3.109 1.25 4.75 1.25 5.516 0 9.969-4.453 9.969-9.969s-4.453-10.047-9.969-10.047zm5.797 14.125c-.25.703-1.438 1.344-1.984 1.422-.516.078-1.156.109-1.875-.125-.453-.141-1.016-.344-1.719-.641-2.969-1.281-4.906-4.297-5.063-4.5-.141-.203-1.203-1.609-1.203-3.063s.766-2.172 1.031-2.469c.266-.297.578-.375.781-.375.188 0 .391 0 .563.016.188.016.438-.078.688.516.25.609.859 2.094.938 2.25.078.156.125.344.016.547-.109.203-.156.344-.313.531-.156.188-.328.406-.469.547-.156.156-.328.328-.141.641.188.313.844 1.391 1.797 2.25 1.234 1.094 2.281 1.438 2.594 1.594.313.156.5.125.688-.094.188-.219.813-.938 1.031-1.266.219-.328.422-.266.719-.156.297.109 1.875.891 2.203 1.047.328.156.547.234.625.359.078.125.078.734-.172 1.438z"/></svg>';

  debtorsList.innerHTML = '';
  data.debtors.forEach(d => {
    const card = document.createElement('div');
    card.className = 'debtor-card';

    const header = document.createElement('div');
    header.className = 'debtor-header';
    header.innerHTML = `
      <div>
        <div class="debtor-name">${escapeHtml(d.nama)} ${d.panggilan ? '(' + escapeHtml(d.panggilan) + ')' : ''}</div>
        <div class="debtor-meta">${escapeHtml(d.idSiswa)} ${d.tingkatan ? '• ' + escapeHtml(d.tingkatan) : ''} • ${d.jumlahSesi} Sesi Belum Lunas</div>
      </div>
      <div class="debtor-amount">Rp${d.totalTunggakan.toLocaleString('id-ID')}</div>
    `;
    card.appendChild(header);

    const sessionsContainer = document.createElement('div');
    d.sesiList.forEach(item => {
      const row = document.createElement('div');
      row.className = 'debtor-session-item';
      row.innerHTML = `
        <div style="padding-right: 8px;">
          <strong>${escapeHtml(item.idSesi)}</strong> (${escapeHtml(item.tanggal)})
          <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.jenis)} • Tarif: Rp${item.tarif.toLocaleString('id-ID')} • Dibayar: Rp${item.jumlahDibayar.toLocaleString('id-ID')}</div>
        </div>
        <div style="text-align: right; flex-shrink: 0;">
          <div style="font-weight: 700; color: var(--danger); margin-bottom: 6px;">Sisa Rp${item.sisa.toLocaleString('id-ID')}</div>
          <button type="button" class="btn btn-success btn-sm" style="min-height: 44px; padding: 6px 12px; font-size: 0.78rem; width: auto;" aria-label="Tandai lunas iuran untuk ${escapeHtml(d.nama)}">Tandai Lunas (Rp${item.sisa.toLocaleString('id-ID')})</button>
        </div>
      `;
      row.querySelector('button').addEventListener('click', () => {
        payDebtorItem(item.idSesi, d.idSiswa, d.nama, item.sisa);
      });
      sessionsContainer.appendChild(row);
    });
    card.appendChild(sessionsContainer);

    const actionsBar = document.createElement('div');
    actionsBar.className = 'debtor-card-actions';

    const btnBulkPay = document.createElement('button');
    btnBulkPay.type = 'button';
    btnBulkPay.className = 'btn-bulk-pay';
    btnBulkPay.setAttribute('aria-label', `Pelunasan semua tunggakan ${d.nama} sebesar Rp${d.totalTunggakan.toLocaleString('id-ID')}`);
    btnBulkPay.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>✓ Tandai Semua Lunas (Rp${d.totalTunggakan.toLocaleString('id-ID')})</span>`;
    btnBulkPay.addEventListener('click', () => payAllDebtorSessions(d, btnBulkPay));
    actionsBar.appendChild(btnBulkPay);

    const waUrl = buildWaBillingUrl(d);
    if (waUrl) {
      const waLink = document.createElement('a');
      waLink.href = waUrl;
      waLink.target = '_blank';
      waLink.rel = 'noopener noreferrer';
      waLink.className = 'btn-wa-reminder';
      waLink.setAttribute('aria-label', `Kirim tagihan WhatsApp ke wali ${d.nama}`);
      waLink.innerHTML = `${waSvg}<span>Hubungi via WhatsApp</span>`;
      actionsBar.appendChild(waLink);
    } else {
      const noWaNote = document.createElement('span');
      noWaNote.style.cssText = 'display: inline-flex; align-items: center; justify-content: center; font-size: 0.78rem; color: var(--text-muted); min-height: 44px; background: #f1f3f5; border-radius: 6px; padding: 6px 10px;';
      noWaNote.textContent = 'No. WA wali belum tercatat';
      actionsBar.appendChild(noWaNote);
    }

    card.appendChild(actionsBar);
    debtorsList.appendChild(card);
  });
}

async function payDebtorItem(idSesi, idSiswa, nama, sisa) {
  if (confirm(`Tandai Lunas iuran untuk ${nama} sebesar Rp${sisa.toLocaleString('id-ID')}?`)) {
    await markQuickPaid(idSesi, idSiswa);
    loadDebtors();
  }
}

async function payAllDebtorSessions(debtor, btnEl) {
  const sesiList = debtor.sesiList || [];
  if (sesiList.length === 0) return;

  if (!confirm(`Tandai lunas SEMUA iuran (${debtor.jumlahSesi} sesi) untuk ${debtor.nama} sebesar total Rp${debtor.totalTunggakan.toLocaleString('id-ID')}?`)) {
    return;
  }

  const originalHtml = btnEl.innerHTML;
  btnEl.disabled = true;
  btnEl.textContent = 'Memproses pelunasan...';

  let usedBulk = false;
  let successCount = 0;

  try {
    if (supportsBulkMarkPaid !== false) {
      try {
        const bulkRes = await apiRequest('bulkMarkPaid', {
          idSiswa: debtor.idSiswa,
          sesiList: sesiList.map(s => s.idSesi),
          metode: 'Tunai'
        });
        if (bulkRes.ok) {
          supportsBulkMarkPaid = true;
          usedBulk = true;
          successCount = (bulkRes.data && bulkRes.data.updatedCount) || sesiList.length;
        } else if (bulkRes.code === 'invalid_input') {
          supportsBulkMarkPaid = false;
        }
      } catch (err) {
        // Lanjutkan dengan fallback markPaid berurutan
      }
    }

    if (!usedBulk) {
      for (let i = 0; i < sesiList.length; i++) {
        btnEl.textContent = `Melunasi ${i + 1}/${sesiList.length}...`;
        const res = await apiRequest('markPaid', {
          idSesi: sesiList[i].idSesi,
          idSiswa: debtor.idSiswa,
          metode: 'Tunai'
        });
        if (res.ok) {
          successCount++;
          const localItem = sessionAttendanceList.find(a => a.idSesi === sesiList[i].idSesi && a.idSiswa === debtor.idSiswa);
          if (localItem) {
            localItem.statusBayar = res.data.statusBayar;
            localItem.jumlahDibayar = res.data.jumlahDibayar;
            localItem.metode = res.data.metode;
            localItem.tglBayar = res.data.tglBayar;
          }
        }
      }
    } else if (appData.sesiAktif) {
      // Sinkronkan status lokal jika sesi aktif termasuk yang dilunasi
      sesiList.forEach(s => {
        const localItem = sessionAttendanceList.find(a => a.idSesi === s.idSesi && a.idSiswa === debtor.idSiswa);
        if (localItem) localItem.statusBayar = 'Lunas';
      });
    }

    if (successCount > 0) {
      playChime('success');
      vibrate([150, 80, 150]);
      renderAttendanceList();
      showScanToast('success', 'Pelunasan Berhasil', `${debtor.nama}: ${successCount} sesi dilunasi.`);
      await loadDebtors();
    } else {
      showScanToast('error', 'Pelunasan Gagal', 'Gagal memperbarui pembayaran di server.');
      btnEl.disabled = false;
      btnEl.innerHTML = originalHtml;
    }
  } catch (err) {
    showScanToast('error', 'Koneksi Error', 'Gagal menghubungi server.');
    btnEl.disabled = false;
    btnEl.innerHTML = originalHtml;
  }
}

// ─────────────────────────────────────────────
// M4: Kelola Sesi Latihan
// ─────────────────────────────────────────────

function renderSessionsManage() {
  if (!appData.sesi || appData.sesi.length === 0) {
    sessionsManageList.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 12px 0;">Tidak ada data sesi.</p>';
    return;
  }

  sessionsManageList.innerHTML = '';
  appData.sesi.forEach(s => {
    const item = document.createElement('div');
    item.className = 'session-manage-item';
    const isTerlaksana = s.statusSesi === 'Terlaksana';
    const isBatal = s.statusSesi === 'Batal';
    const statusClass = isTerlaksana ? 'badge-paid' : isBatal ? 'badge-unpaid' : 'session-badge badge-umum';

    item.innerHTML = `
      <div class="session-manage-header">
        <div>
          <strong style="color: var(--primary); font-size: 0.95rem;">${formatNamaLatihan(s.jenis)}</strong>
          <div style="font-size: 0.75rem; color: var(--text-muted);">${s.idSesi}</div>
        </div>
        <span class="${statusClass}" style="font-size: 0.75rem; padding: 3px 8px;">${s.statusSesi}</span>
      </div>
      <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
        <div>Rencana: <strong>${formatTanggalIndo(s.tglRencana)}</strong></div>
        <div>Aktual: ${s.tglAktual ? `<strong>${formatTanggalIndo(s.tglAktual)}</strong>` : '(Sesuai rencana)'}</div>
        ${s.keterangan ? `<div style="color: var(--text); margin-top: 2px;">Ket: ${s.keterangan}</div>` : ''}
      </div>
      <button class="btn btn-secondary btn-sm" style="width: 100%; font-size: 0.85rem;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
        <span>✏️ Ubah Jadwal / Status Latihan</span>
      </button>
    `;
    item.querySelector('button').addEventListener('click', () => {
      openSessionEditModal(s);
    });
    sessionsManageList.appendChild(item);
  });
}

function openSessionEditModal(s) {
  editSessionId.value = s.idSesi;
  modalSessionTitle.textContent = `Ubah Jadwal Latihan: ${formatNamaLatihan(s.jenis)}`;
  editSessionStatus.value = s.statusSesi || 'Terjadwal';
  editSessionActualDate.value = s.tglAktual || s.tglRencana || '';
  editSessionKeterangan.value = s.keterangan || '';
  sessionModal.classList.remove('hidden');
}

function closeSessionEditModal() {
  sessionModal.classList.add('hidden');
}

async function handleSaveSessionEdit() {
  const idSesi = editSessionId.value;
  const statusSesi = editSessionStatus.value;
  const tanggalAktual = editSessionActualDate.value.trim();
  const keterangan = editSessionKeterangan.value.trim();

  btnSaveSessionEdit.disabled = true;
  btnSaveSessionEdit.textContent = 'Menyimpan...';

  try {
    const res = await apiRequest('updateSession', {
      idSesi: idSesi,
      statusSesi: statusSesi,
      tanggalAktual: tanggalAktual,
      keterangan: keterangan
    });

    if (res.ok && res.data && res.data.sesi) {
      playChime('success');
      // Update local state
      const idx = appData.sesi.findIndex(x => x.idSesi === idSesi);
      if (idx !== -1) appData.sesi[idx] = res.data.sesi;
      if (appData.sesiAktif && appData.sesiAktif.idSesi === idSesi) {
        appData.sesiAktif = res.data.sesi;
        renderSessionInfo();
      }
      closeSessionEditModal();
      renderSessionsManage();
      showFeedback('success', 'Sesi Diperbarui', `Sesi ${idSesi} berhasil diupdate.`);
    } else {
      showScanToast('error', 'Gagal Simpan', res.message || 'Gagal menyimpan perubahan jadwal latihan.');
    }
  } catch (err) {
    showScanToast('error', 'Koneksi Terputus', 'Koneksi internet bermasalah saat memperbarui jadwal.');
  } finally {
    btnSaveSessionEdit.disabled = false;
    btnSaveSessionEdit.textContent = 'Simpan Perubahan';
  }
}

// ─────────────────────────────────────────────
// Buat Sesi Baru (Create Session)
// ─────────────────────────────────────────────

function openCreateSessionModal() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  if (newSessionDate) newSessionDate.value = `${yyyy}-${mm}-${dd}`;
  if (newSessionJenis) newSessionJenis.value = 'Umum';
  if (newSessionTarif) newSessionTarif.value = (appData.tarif && appData.tarif.umum) || 15000;
  if (newSessionKeterangan) newSessionKeterangan.value = 'Latihan Rutin Umum';
  if (createSessionModal) createSessionModal.classList.remove('hidden');
}

function closeCreateSessionModal() {
  if (createSessionModal) createSessionModal.classList.add('hidden');
}

function handleNewSessionJenisChange() {
  const jenis = newSessionJenis.value;
  if (jenis === 'Khusus') {
    newSessionTarif.value = (appData.tarif && appData.tarif.khusus) || 5000;
    newSessionKeterangan.value = 'Latihan Khusus';
  } else if (jenis === 'Ujian') {
    newSessionTarif.value = (appData.tarif && appData.tarif.umum) || 15000;
    newSessionKeterangan.value = 'Ujian Kenaikan Tingkat';
  } else {
    newSessionTarif.value = (appData.tarif && appData.tarif.umum) || 15000;
    newSessionKeterangan.value = 'Latihan Rutin Umum';
  }
}

async function handleSaveNewSession() {
  const tanggal = newSessionDate.value.trim();
  const jenis = newSessionJenis.value;
  const tarif = parseInt(newSessionTarif.value, 10) || 0;
  const keterangan = newSessionKeterangan.value.trim();

  if (!tanggal) {
    showScanToast('warning', 'Tanggal Diperlukan', 'Tanggal jadwal latihan wajib dipilih.');
    return;
  }

  btnSaveNewSession.disabled = true;
  btnSaveNewSession.textContent = 'Membuat Sesi...';

  try {
    const res = await apiRequest('createSessions', {
      tanggal: tanggal,
      jenis: jenis,
      tarif: tarif,
      keterangan: keterangan
    });

    if (res.ok && res.data && res.data.sesi) {
      playChime('success');
      const newSesi = res.data.sesi;

      // Masukkan sesi baru ke state aplikasi
      appData.sesi.push(newSesi);

      // Urutkan berdasarkan tanggal & id
      appData.sesi.sort((a, b) => (b.tglEfektif || b.tglRencana).localeCompare(a.tglEfektif || a.tglRencana));

      // Re-render dropdown sesi di Tab Presensi
      populateSessionDropdown();

      // Jika belum ada sesi aktif, jadikan sesi baru ini sebagai sesi aktif
      if (!appData.sesiAktif) {
        appData.sesiAktif = newSesi;
        renderSessionInfo();
      }

      // Re-render daftar kelola sesi
      renderSessionsManage();

      closeCreateSessionModal();
      showFeedback('success', 'Sesi Baru Dibuat', `Sesi ${newSesi.idSesi} (${newSesi.jenis}) berhasil ditambahkan ke jadwal.`);
    } else {
      showScanToast('error', 'Gagal Buat Jadwal', res.message || 'Gagal membuat jadwal latihan baru.');
    }
  } catch (err) {
    showScanToast('error', 'Koneksi Terputus', 'Koneksi internet bermasalah saat membuat jadwal baru.');
  } finally {
    btnSaveNewSession.disabled = false;
    btnSaveNewSession.textContent = 'Simpan Sesi';
  }
}

