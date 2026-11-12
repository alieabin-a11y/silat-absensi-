// PWA Support & Install Prompt Handler - Silat Putra Setia
(function () {
  'use strict';

  // 1. Registrasi Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker aktif:', reg.scope);
        })
        .catch((err) => {
          console.warn('[PWA] Registrasi Service Worker gagal:', err);
        });
    });
  }

  // Cek apakah sudah dalam mode standalone (aplikasi terpasang)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) {
    console.log('[PWA] Berjalan dalam mode aplikasi standalone.');
    return;
  }

  // Cek apakah user pernah menutup banner dalam 7 hari terakhir
  const lastDismissed = localStorage.getItem('silat_pwa_dismissed');
  if (lastDismissed && (Date.now() - parseInt(lastDismissed, 10)) < 7 * 24 * 60 * 60 * 1000) {
    return;
  }

  let deferredPrompt = null;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // Buat Elemen Banner PWA
  function createInstallBanner() {
    if (document.getElementById('pwaInstallBanner')) return;

    const banner = document.createElement('div');
    banner.id = 'pwaInstallBanner';
    banner.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 16px;
      right: 16px;
      max-width: 420px;
      margin: 0 auto;
      background: linear-gradient(135deg, #4A0A0C 0%, #7B1317 100%);
      color: #FFFFFF;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(212, 175, 55, 0.5);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      z-index: 9999;
      font-family: inherit;
      animation: slideUp 0.3s ease-out;
    `;

    banner.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <img src="icons/icon-192.png" alt="Logo" style="width: 38px; height: 38px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.4); flex-shrink: 0; background: #fff;">
        <div style="line-height: 1.25;">
          <div style="font-weight: 700; font-size: 0.85rem; color: #FDE68A;">Pasang Aplikasi di HP</div>
          <div style="font-size: 0.72rem; color: #E2E8F0; margin-top: 2px;">Akses cepat tanpa repot buka browser</div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
        <button id="pwaBtnInstall" style="
          background: #D4AF37;
          color: #3B0709;
          font-weight: 700;
          font-size: 0.75rem;
          border: none;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
        ">Pasang</button>
        <button id="pwaBtnDismiss" style="
          background: transparent;
          color: rgba(255,255,255,0.7);
          font-size: 1rem;
          border: none;
          padding: 4px;
          cursor: pointer;
          line-height: 1;
        ">✕</button>
      </div>
    `;

    document.body.appendChild(banner);

    // Event Klik Pasang
    document.getElementById('pwaBtnInstall').addEventListener('click', () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('[PWA] User menerima instalasi aplikasi');
          }
          deferredPrompt = null;
          banner.remove();
        });
      } else if (isIOS) {
        alert("📲 Cara Pasang di iPhone/iPad:\n\n1. Ketuk ikon 'Bagikan' (kotak dengan panah ke atas 📤) di bilah bawah Safari.\n2. Gulir ke bawah dan pilih 'Tambah ke Layar Utama' (Add to Home Screen ➕).\n3. Ketuk 'Tambah' di kanan atas.");
      } else {
        alert("Untuk memasang aplikasi, buka menu browser (titik 3 di kanan atas) lalu pilih 'Pasang Aplikasi' atau 'Tambahkan ke Layar Utama'.");
      }
    });

    // Event Klik Tutup
    document.getElementById('pwaBtnDismiss').addEventListener('click', () => {
      localStorage.setItem('silat_pwa_dismissed', Date.now().toString());
      banner.remove();
    });
  }

  // Tangkap event instalasi browser Android / Chrome / Edge
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    createInstallBanner();
  });

  // Untuk iOS Safari (karena tidak ada beforeinstallprompt)
  if (isIOS && !isStandalone) {
    window.addEventListener('load', () => {
      setTimeout(createInstallBanner, 2000);
    });
  }

})();

