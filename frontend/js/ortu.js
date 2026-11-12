/**
 * ortu.js — Logika Portal Orang Tua & Siswa
 * Proyek: Absensi Silat Putra Setia Rawa Bebek
 *
 * M5: Login ID + PIN, Riwayat Kehadiran, Persentase Kehadiran.
 * ATURAN KEAMANAN: Bebas dari segala bentuk nominal uang!
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbzEJ0Gg3sbDU4YRk-nqwWPDab5-IAVYp-QddwFpUPRt8fOpmdrYN--B0VouKemwnGGEJw/exec';

// State
let parentAuth = {
  idSiswa: localStorage.getItem('parent_id_siswa') || null,
  pin: localStorage.getItem('parent_pin') || null
};

// DOM Elements
const loginParentSection = document.getElementById('loginParentSection');
const portalParentSection = document.getElementById('portalParentSection');
const formParentLogin = document.getElementById('formParentLogin');
const inputStudentId = document.getElementById('inputStudentId');
const inputStudentPin = document.getElementById('inputStudentPin');
const checkRememberMe = document.getElementById('checkRememberMe');
const btnSubmitParentLogin = document.getElementById('btnSubmitParentLogin');
const loginParentAlert = document.getElementById('loginParentAlert');

const parentHeaderProfile = document.getElementById('parentHeaderProfile');
const headerStudentName = document.getElementById('headerStudentName');
const btnLogoutParent = document.getElementById('btnLogoutParent');

const displayChildName = document.getElementById('displayChildName');
const displayChildMeta = document.getElementById('displayChildMeta');
const bannerNonaktif = document.getElementById('bannerNonaktif');
const textPesanNonaktif = document.getElementById('textPesanNonaktif');
const activeStudentContent = document.getElementById('activeStudentContent');

const displayPercentText = document.getElementById('displayPercentText');
const displayHadirRatio = document.getElementById('displayHadirRatio');
const progressFillBar = document.getElementById('progressFillBar');
const statHadirUmum = document.getElementById('statHadirUmum');
const statHadirKhusus = document.getElementById('statHadirKhusus');
const totalRiwayatCount = document.getElementById('totalRiwayatCount');
const parentSessionList = document.getElementById('parentSessionList');

// ─────────────────────────────────────────────
// Inisialisasi
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (parentAuth.idSiswa && parentAuth.pin) {
    loadParentPortal(parentAuth.idSiswa, parentAuth.pin, false);
  } else {
    showParentLogin();
  }

  formParentLogin.addEventListener('submit', handleParentLogin);
  btnLogoutParent.addEventListener('click', handleParentLogout);
});

// ─────────────────────────────────────────────
// Auth / Login
// ─────────────────────────────────────────────

function showParentLogin() {
  loginParentSection.classList.remove('hidden');
  portalParentSection.classList.add('hidden');
  parentHeaderProfile.classList.add('hidden');
  inputStudentPin.value = '';
}

async function handleParentLogin(e) {
  e.preventDefault();
  const idSiswa = inputStudentId.value.trim().toUpperCase();
  const pin = inputStudentPin.value.trim();
  const remember = checkRememberMe.checked;

  loginParentAlert.style.display = 'none';
  btnSubmitParentLogin.disabled = true;
  btnSubmitParentLogin.innerHTML = '<span class="spinner"></span> Memeriksa...';

  try {
    await loadParentPortal(idSiswa, pin, remember);
  } finally {
    btnSubmitParentLogin.disabled = false;
    btnSubmitParentLogin.innerHTML = '<span>Lihat Kehadiran Anak</span>';
  }
}

function handleParentLogout() {
  if (confirm('Keluar dari portal siswa?')) {
    localStorage.removeItem('parent_id_siswa');
    localStorage.removeItem('parent_pin');
    parentAuth.idSiswa = null;
    parentAuth.pin = null;
    showParentLogin();
  }
}

// ─────────────────────────────────────────────
// Muat Data Portal
// ─────────────────────────────────────────────

async function loadParentPortal(idSiswa, pin, saveToStorage = false) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'parentView',
        idSiswa: idSiswa,
        pin: pin
      })
    });

    const res = await response.json();

    if (res.ok && res.data) {
      if (saveToStorage) {
        localStorage.setItem('parent_id_siswa', idSiswa);
        localStorage.setItem('parent_pin', pin);
      }
      parentAuth.idSiswa = idSiswa;
      parentAuth.pin = pin;

      renderParentPortal(res.data);
    } else {
      loginParentAlert.className = 'feedback-card feedback-danger';
      loginParentAlert.textContent = res.message || 'ID atau PIN salah.';
      loginParentAlert.style.display = 'block';
      showParentLogin();
    }
  } catch (err) {
    loginParentAlert.className = 'feedback-card feedback-danger';
    loginParentAlert.textContent = 'Gagal menghubungi server. Periksa koneksi internet Anda.';
    loginParentAlert.style.display = 'block';
    showParentLogin();
  }
}

// ─────────────────────────────────────────────
// Render Tampilan Dashboard
// ─────────────────────────────────────────────

function renderParentPortal(data) {
  loginParentSection.classList.add('hidden');
  portalParentSection.classList.remove('hidden');
  parentHeaderProfile.classList.remove('hidden');

  const s = data.siswa;
  headerStudentName.textContent = s.panggilan || s.nama;
  displayChildName.textContent = s.nama + (s.panggilan ? ` (${s.panggilan})` : '');
  displayChildMeta.textContent = `ID: ${s.idSiswa} ${s.tingkatan ? '• Tingkat ' + s.tingkatan : ''} • Status: ${s.status}`;

  // Jika Siswa Nonaktif
  if (data.isNonaktif) {
    bannerNonaktif.style.display = 'block';
    textPesanNonaktif.textContent = data.pesan || 'Siswa saat ini berstatus Nonaktif.';
    activeStudentContent.style.display = 'none';
    return;
  }

  bannerNonaktif.style.display = 'none';
  activeStudentContent.style.display = 'block';

  // Statistik Kehadiran
  const stat = data.statistik;
  const totalUmum = stat.totalSesiUmum || 0;
  if (totalUmum > 0) {
    const percent = stat.kehadiranUmumPersen || 0;
    displayPercentText.textContent = `${percent}%`;
    displayHadirRatio.textContent = `${stat.hadirUmum} dari ${totalUmum} sesi`;
    progressFillBar.style.width = `${percent}%`;
  } else {
    displayPercentText.textContent = '-';
    displayHadirRatio.textContent = 'Belum ada sesi latihan umum';
    progressFillBar.style.width = '0%';
  }

  statHadirUmum.textContent = `${stat.hadirUmum} Kali`;
  statHadirKhusus.textContent = `${stat.hadirKhusus} Kali`;

  // Riwayat Per Sesi
  const list = data.riwayat || [];
  totalRiwayatCount.textContent = `${list.length} Sesi`;

  if (list.length === 0) {
    parentSessionList.innerHTML = '<p style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 16px 0;">Belum ada riwayat sesi latihan.</p>';
    return;
  }

  parentSessionList.innerHTML = '';
  list.forEach(item => {
    const el = document.createElement('div');
    el.className = 'parent-session-item';

    let hadirBadge = '';
    if (item.statusHadir === 'Hadir') {
      hadirBadge = '<span class="badge-paid" style="font-size: 0.75rem;">Hadir ✓</span>';
    } else if (item.statusHadir === 'Izin') {
      hadirBadge = '<span class="badge-izin" style="font-size: 0.75rem; padding: 3px 8px; border-radius: 20px; font-weight: 700;">Izin 📝</span>';
    } else if (item.statusHadir === 'Sakit') {
      hadirBadge = '<span class="badge-sakit" style="font-size: 0.75rem; padding: 3px 8px; border-radius: 20px; font-weight: 700;">Sakit 🤒</span>';
    } else {
      hadirBadge = '<span class="badge-absent" style="font-size: 0.75rem; padding: 3px 8px; border-radius: 20px; font-weight: 600;">Tidak Hadir ✕</span>';
    }

    let bayarBadge = '';
    if (item.statusBayar === 'Lunas') {
      bayarBadge = '<span class="badge-paid" style="font-size: 0.72rem; padding: 2px 7px;">Iuran: Lunas ✓</span>';
    } else if (item.statusBayar === 'Belum') {
      bayarBadge = '<span class="badge-unpaid" style="font-size: 0.72rem; padding: 2px 7px;">Iuran: Belum</span>';
    }

    el.innerHTML = `
      <div>
        <div style="font-weight: 700; font-size: 0.9rem; color: var(--text);">
          ${item.tanggal} <span style="font-size: 0.75rem; font-weight: 600; color: ${item.jenis === 'Khusus' ? 'var(--accent)' : 'var(--primary)'};">[${item.jenis}]</span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
          Sesi: ${item.idSesi}
        </div>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        ${hadirBadge}
        ${bayarBadge}
      </div>
    `;
    parentSessionList.appendChild(el);
  });
}

