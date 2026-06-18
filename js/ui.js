/* ═══════════════════════════════════════════════════════════════
   ProTrader Analytics — ui.js
   Global UI utilities: toast, dark mode, session, format, alerts
   Dipanggil dari halaman manapun via window.UI.*
   ═══════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ═══════════════════════════════════════════
  // 1. TOAST NOTIFICATIONS
  // ═══════════════════════════════════════════

  const TOAST_ICONS = {
    success: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--accent-green)" stroke-width="1.5"/>
      <polyline points="4.5,8 7,10.5 11.5,5.5" stroke="var(--accent-green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    error: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--accent-red)" stroke-width="1.5"/>
      <line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="var(--accent-red)" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="var(--accent-red)" stroke-width="1.5" stroke-linecap="round"/>
    </svg>`,
    warning: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2 L14 13 H2 Z" stroke="var(--accent-gold)" stroke-width="1.5" stroke-linejoin="round"/>
      <line x1="8" y1="6.5" x2="8" y2="9.5" stroke="var(--accent-gold)" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="8" cy="11.5" r="0.8" fill="var(--accent-gold)"/>
    </svg>`,
    info: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="var(--accent-blue)" stroke-width="1.5"/>
      <line x1="8" y1="7" x2="8" y2="11" stroke="var(--accent-blue)" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="8" cy="5" r="0.8" fill="var(--accent-blue)"/>
    </svg>`,
  };

  let _toastQueue = [];

  /**
   * showToast(message, type, duration)
   * @param {string} message  - Pesan yang ditampilkan
   * @param {string} type     - 'success' | 'error' | 'warning' | 'info'
   * @param {number} duration - Durasi dalam ms (default 4000)
   */
  function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const id   = `toast-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
    const now  = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.id = id;
    el.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <div class="toast-body">
        <div class="toast-msg">${message}</div>
        <div class="toast-time">${time}</div>
      </div>
      <button class="toast-close" onclick="window.UI.dismissToast('${id}')" title="Tutup">×</button>
    `;

    container.appendChild(el);
    _toastQueue.push(id);

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration);
    }

    // Batasi max 5 toast sekaligus
    if (_toastQueue.length > 5) {
      dismissToast(_toastQueue[0]);
    }

    // Tambah ke notif panel
    if (window.addNotification) {
      window.addNotification(message, type);
    }
  }

  function dismissToast(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('dismissing');
    setTimeout(() => {
      el.remove();
      _toastQueue = _toastQueue.filter(t => t !== id);
    }, 280);
  }

  // ═══════════════════════════════════════════
  // 2. DARK / LIGHT MODE TOGGLE
  // ═══════════════════════════════════════════

  function toggleDarkMode() {
    const body    = document.body;
    const isDark  = body.classList.contains('dark-mode');
    const btnIcon = document.querySelector('.dark-mode-toggle');

    if (isDark) {
      body.classList.replace('dark-mode', 'light-mode');
      localStorage.setItem('darkMode', 'false');
      if (window.AppState) window.AppState.darkMode = false;
      _updateDarkModeIcon(false);
      showToast('Mode terang aktif', 'info', 2000);
    } else {
      body.classList.replace('light-mode', 'dark-mode');
      localStorage.setItem('darkMode', 'true');
      if (window.AppState) window.AppState.darkMode = true;
      _updateDarkModeIcon(true);
      showToast('Mode gelap aktif', 'info', 2000);
    }
  }

  function _updateDarkModeIcon(isDark) {
    const iconDark  = document.querySelector('.icon-dark');
    const iconLight = document.querySelector('.icon-light');
    const label     = document.querySelector('.dm-label');
    if (iconDark)  iconDark.style.display  = isDark ? 'block' : 'none';
    if (iconLight) iconLight.style.display = isDark ? 'none' : 'block';
    if (label)     label.textContent = isDark ? 'Dark Mode' : 'Light Mode';
  }

  // Terapkan mode yang tersimpan
  (function applyStoredMode() {
    const saved = localStorage.getItem('darkMode');
    _updateDarkModeIcon(saved !== 'false');
  })();

  // ═══════════════════════════════════════════
  // 3. MARKET SESSION DISPLAY
  // ═══════════════════════════════════════════

  /**
   * Hitung sesi pasar yang aktif berdasarkan jam UTC
   * Sydney:  21:00 – 06:00 UTC (melewati tengah malam)
   * Tokyo:   00:00 – 09:00 UTC
   * London:  07:00 – 16:00 UTC
   * New York: 13:00 – 22:00 UTC
   */
  function isSessionActive(start, end, utcHour) {
    if (start > end) {
      // Melewati tengah malam (Sydney)
      return utcHour >= start || utcHour < end;
    }
    return utcHour >= start && utcHour < end;
  }

  function updateMarketSessionDisplay() {
    const now     = new Date();
    const utcH    = now.getUTCHours();
    const utcM    = now.getUTCMinutes();
    const utcTime = utcH + utcM / 60;

    const sessions = {
      sydney:  { el: document.getElementById('session-sydney'),  start: 21, end: 6  },
      tokyo:   { el: document.getElementById('session-tokyo'),   start: 0,  end: 9  },
      london:  { el: document.getElementById('session-london'),  start: 7,  end: 16 },
      newyork: { el: document.getElementById('session-newyork'), start: 13, end: 22 },
    };

    Object.entries(sessions).forEach(([name, cfg]) => {
      if (!cfg.el) return;
      const active = isSessionActive(cfg.start, cfg.end, utcH);
      cfg.el.classList.toggle('active', active);
    });
  }

  // Auto-update setiap menit
  function startSessionUpdater() {
    updateMarketSessionDisplay();
    setInterval(updateMarketSessionDisplay, CONFIG?.REFRESH?.SESSION || 60000);
  }

  // ═══════════════════════════════════════════
  // 4. PRICE FORMATTING
  // ═══════════════════════════════════════════

  /**
   * formatPrice(price, decimals)
   * Mengembalikan string harga dengan pemisah ribuan
   */
  function formatPrice(price, decimals = 2) {
    if (price === null || price === undefined || isNaN(price)) return '—';
    const num = parseFloat(price);

    // Auto-detect decimals untuk harga kecil
    if (decimals === 'auto') {
      if (num >= 1000)    decimals = 2;
      else if (num >= 1)  decimals = 3;
      else if (num >= 0.01) decimals = 4;
      else if (num >= 0.0001) decimals = 5;
      else decimals = 8;
    }

    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /**
   * formatPriceUSD(price, decimals)
   * Sama seperti formatPrice tapi dengan prefix $
   */
  function formatPriceUSD(price, decimals = 2) {
    if (price === null || price === undefined || isNaN(price)) return '—';
    return `$${formatPrice(price, decimals)}`;
  }

  /**
   * formatChange(change, changePct)
   * Mengembalikan HTML badge merah/hijau dengan arrow
   */
  function formatChange(change, changePct) {
    const pct    = parseFloat(changePct);
    const chg    = parseFloat(change);
    const isUp   = pct >= 0;
    const cls    = isUp ? 'badge-up' : 'badge-down';
    const arrow  = isUp ? '▲' : '▼';
    const sign   = isUp ? '+' : '';
    const pctStr = `${sign}${Math.abs(pct).toFixed(2)}%`;

    return `<span class="${cls}">${arrow} ${pctStr}</span>`;
  }

  /**
   * formatChangePlain(changePct)
   * Mengembalikan teks plain (untuk tabel, bukan HTML)
   */
  function formatChangePlain(changePct) {
    const pct   = parseFloat(changePct);
    const isUp  = pct >= 0;
    const arrow = isUp ? '▲' : '▼';
    return `${arrow} ${Math.abs(pct).toFixed(2)}%`;
  }

  /**
   * formatVolume(volume)
   * Konversi volume besar ke K/M/B
   */
  function formatVolume(volume) {
    if (!volume || isNaN(volume)) return '—';
    const v = parseFloat(volume);
    if (v >= 1e9)  return `$${(v/1e9).toFixed(2)}B`;
    if (v >= 1e6)  return `$${(v/1e6).toFixed(2)}M`;
    if (v >= 1e3)  return `$${(v/1e3).toFixed(1)}K`;
    return `$${v.toFixed(2)}`;
  }

  /**
   * formatNumber(num)
   * Format angka dengan K/M/B tanpa simbol mata uang
   */
  function formatNumber(num) {
    if (!num || isNaN(num)) return '0';
    const v = parseFloat(num);
    if (v >= 1e12) return `${(v/1e12).toFixed(2)}T`;
    if (v >= 1e9)  return `${(v/1e9).toFixed(2)}B`;
    if (v >= 1e6)  return `${(v/1e6).toFixed(2)}M`;
    if (v >= 1e3)  return `${(v/1e3).toFixed(1)}K`;
    return v.toFixed(2);
  }

  // ═══════════════════════════════════════════
  // 5. SKELETON CARD GENERATOR
  // ═══════════════════════════════════════════

  /**
   * createSkeletonCard(rows)
   * Mengembalikan HTML skeleton placeholder
   */
  function createSkeletonCard(rows = 3) {
    const lines = Array.from({ length: rows }, (_, i) => {
      const w = [80, 60, 70, 90, 50][i % 5];
      return `<div class="skeleton-line" style="width:${w}%;height:12px;background:var(--bg-hover);border-radius:4px;margin:6px 0;position:relative;overflow:hidden;">
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.03),transparent);animation:shimmer 1.8s infinite;"></div>
      </div>`;
    }).join('');

    return `<div class="card" style="padding:16px 18px;">
      <div class="skeleton-line" style="width:45%;height:14px;background:var(--bg-hover);border-radius:4px;margin-bottom:12px;position:relative;overflow:hidden;">
        <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.03),transparent);animation:shimmer 1.8s infinite;"></div>
      </div>
      ${lines}
    </div>`;
  }

  // ═══════════════════════════════════════════
  // 6. WEB NOTIFICATIONS PERMISSION
  // ═══════════════════════════════════════════

  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Tunda 3 detik agar tidak langsung muncul saat load
      setTimeout(() => {
        Notification.requestPermission();
      }, 3000);
    }
  }

  function sendWebNotification(title, body, icon = '📈') {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: `protrader-${Date.now()}`,
        silent: false,
      });
    } catch (e) {
      // Service worker notifications belum tersedia
      console.debug('[UI] Web Notification tidak tersedia:', e);
    }
  }

  // ═══════════════════════════════════════════
  // 7. ALERT SOUND — Web Audio API
  // ═══════════════════════════════════════════

  let _audioCtx = null;

  function _getAudioCtx() {
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return _audioCtx;
  }

  /**
   * playAlertSound(type)
   * @param {string} type - 'up' | 'down' | 'neutral'
   * Tidak butuh file audio eksternal — murni Web Audio API
   */
  function playAlertSound(type = 'up') {
    try {
      const ctx  = _getAudioCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'up') {
        // Nada naik: C4 → E4 → G4
        osc.type = 'sine';
        osc.frequency.setValueAtTime(261.63, now);        // C4
        osc.frequency.setValueAtTime(329.63, now + 0.1);  // E4
        osc.frequency.setValueAtTime(392.00, now + 0.2);  // G4
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);

      } else if (type === 'down') {
        // Nada turun: G4 → E4 → C4
        osc.type = 'sine';
        osc.frequency.setValueAtTime(392.00, now);        // G4
        osc.frequency.setValueAtTime(329.63, now + 0.1);  // E4
        osc.frequency.setValueAtTime(261.63, now + 0.2);  // C4
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);

      } else {
        // Neutral: beep pendek
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch (e) {
      console.debug('[UI] Audio tidak tersedia:', e);
    }
  }

  // ═══════════════════════════════════════════
  // 8. TIME FORMATTING — BAHASA INDONESIA
  // ═══════════════════════════════════════════

  /**
   * formatTimeAgo(dateString)
   * Mengembalikan "2 menit lalu", "1 jam lalu", dll dalam Bahasa Indonesia
   */
  function formatTimeAgo(dateString) {
    if (!dateString) return '—';
    const date  = new Date(dateString);
    const now   = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr  = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    const diffWk  = Math.floor(diffDay / 7);
    const diffMo  = Math.floor(diffDay / 30);

    if (diffSec < 10)  return 'Baru saja';
    if (diffSec < 60)  return `${diffSec} detik lalu`;
    if (diffMin < 60)  return `${diffMin} menit lalu`;
    if (diffHr  < 24)  return `${diffHr} jam lalu`;
    if (diffDay < 7)   return `${diffDay} hari lalu`;
    if (diffWk  < 4)   return `${diffWk} minggu lalu`;
    if (diffMo  < 12)  return `${diffMo} bulan lalu`;

    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  /**
   * formatDateTime(dateString)
   * Format: "03 Jun 2025, 14:30 WIB"
   */
  function formatDateTime(dateString) {
    if (!dateString) return '—';
    const d = new Date(dateString);
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const day  = String(d.getDate()).padStart(2,'0');
    const mon  = months[d.getMonth()];
    const yr   = d.getFullYear();
    const h    = String(d.getHours()).padStart(2,'0');
    const m    = String(d.getMinutes()).padStart(2,'0');
    return `${day} ${mon} ${yr}, ${h}:${m} WIB`;
  }

  // ═══════════════════════════════════════════
  // 9. PRICE ALERT CHECKER
  // ═══════════════════════════════════════════

  /**
   * checkPriceAlerts(prices)
   * Cek AppState.priceAlerts vs harga terbaru
   * Trigger toast + sound + web notification jika tercapai
   * @param {Object} prices - { 'BTCUSDT': { price, ... }, ... }
   */
  function checkPriceAlerts(prices) {
    if (!prices || !window.AppState) return;
    const alerts = window.AppState.priceAlerts;
    if (!alerts || alerts.length === 0) return;

    let changed = false;

    alerts.forEach(alert => {
      if (alert.triggered) return;
      const data = prices[alert.symbol];
      if (!data) return;

      const currentPrice = parseFloat(data.price);
      const targetPrice  = parseFloat(alert.price);
      const triggered    =
        (alert.direction === 'above' && currentPrice >= targetPrice) ||
        (alert.direction === 'below' && currentPrice <= targetPrice);

      if (triggered) {
        alert.triggered   = true;
        alert.triggeredAt = new Date().toISOString();
        changed = true;

        const symbol    = alert.symbol;
        const direction = alert.direction === 'above' ? 'melewati atas' : 'melewati bawah';
        const priceStr  = formatPrice(targetPrice, 2);
        const msg       = `🚨 Alert: ${symbol} ${direction} $${priceStr}`;

        // Toast
        const toastType = alert.direction === 'above' ? 'success' : 'error';
        showToast(msg, toastType, 8000);

        // Sound
        playAlertSound(alert.direction === 'above' ? 'up' : 'down');

        // Web Notification
        sendWebNotification(
          `ProTrader Alert — ${symbol}`,
          `Harga ${direction} target $${priceStr}`,
        );

        console.log('[UI] Price alert triggered:', alert);
      }
    });

    if (changed) {
      window.AppState.savePriceAlerts();
    }
  }

  // ═══════════════════════════════════════════
  // 10. PRICE FLASH ANIMATION
  // ═══════════════════════════════════════════

  /**
   * flashPrice(element, isUp)
   * Animasi flash hijau/merah pada elemen harga saat update
   */
  function flashPrice(element, isUp) {
    if (!element) return;
    element.classList.remove('flash-up', 'flash-down');
    void element.offsetWidth; // reflow trigger
    element.classList.add(isUp ? 'flash-up' : 'flash-down');
    setTimeout(() => element.classList.remove('flash-up', 'flash-down'), 800);
  }

  // ═══════════════════════════════════════════
  // 11. CONFIRMATION DIALOG (ringan, tanpa library)
  // ═══════════════════════════════════════════

  /**
   * showConfirm(message, onConfirm, onCancel)
   * Dialog konfirmasi sederhana, tanpa popup browser
   */
  function showConfirm(message, onConfirm, onCancel) {
    const id = `confirm-${Date.now()}`;

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9998;
      background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);
      display:flex;align-items:center;justify-content:center;
      animation:fadeInFast 0.15s ease;
    `;
    overlay.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border-color);
        border-radius:var(--radius-lg);padding:24px;max-width:360px;width:90%;
        box-shadow:var(--shadow-lg);animation:fadeIn 0.2s ease;">
        <div style="font-size:0.9rem;color:var(--text-primary);line-height:1.5;margin-bottom:20px;">${message}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button id="${id}-cancel" class="btn-secondary btn-sm">Batal</button>
          <button id="${id}-ok" class="btn-danger btn-sm">Konfirmasi</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    document.getElementById(`${id}-cancel`).onclick = () => {
      overlay.remove();
      if (onCancel) onCancel();
    };
    document.getElementById(`${id}-ok`).onclick = () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) { overlay.remove(); if (onCancel) onCancel(); }
    };
  }

  // ═══════════════════════════════════════════
  // 12. COPY TO CLIPBOARD
  // ═══════════════════════════════════════════

  function copyToClipboard(text, label = 'Teks') {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
        .then(() => showToast(`${label} disalin ke clipboard`, 'success', 2500))
        .catch(() => _fallbackCopy(text, label));
    } else {
      _fallbackCopy(text, label);
    }
  }

  function _fallbackCopy(text, label) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(`${label} disalin`, 'success', 2500);
    } catch {
      showToast('Gagal menyalin', 'error', 2500);
    }
    document.body.removeChild(ta);
  }

  // ═══════════════════════════════════════════
  // 13. LOADING OVERLAY (per-komponen)
  // ═══════════════════════════════════════════

  function showLoading(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.setAttribute('data-loading-for', elementId);
    overlay.style.cssText = `
      position:absolute;inset:0;z-index:10;
      display:flex;align-items:center;justify-content:center;
      background:rgba(13,17,23,0.7);backdrop-filter:blur(2px);
      border-radius:inherit;
    `;
    overlay.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style="animation:spin 1s linear infinite;">
        <circle cx="16" cy="16" r="12" stroke="var(--border-color)" stroke-width="3"/>
        <path d="M16 4 A12 12 0 0 1 28 16" stroke="var(--accent-blue)" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
    el.style.position = 'relative';
    el.appendChild(overlay);
  }

  function hideLoading(elementId) {
    const overlay = document.querySelector(`[data-loading-for="${elementId}"]`);
    if (overlay) overlay.remove();
  }

  // Tambahkan keyframe spin jika belum ada
  if (!document.getElementById('spin-style')) {
    const style = document.createElement('style');
    style.id = 'spin-style';
    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════

  function init() {
    startSessionUpdater();
    requestNotificationPermission();
    console.log('[UI] UI utilities initialized.');
  }

  // ═══════════════════════════════════════════
  // EXPORT ke window.UI
  // ═══════════════════════════════════════════
  window.UI = {
    // Toast
    showToast,
    dismissToast,

    // Dark mode
    toggleDarkMode,

    // Market session
    updateMarketSessionDisplay,

    // Price formatting
    formatPrice,
    formatPriceUSD,
    formatChange,
    formatChangePlain,
    formatVolume,
    formatNumber,

    // Skeleton
    createSkeletonCard,

    // Notifications
    requestNotificationPermission,
    sendWebNotification,

    // Audio
    playAlertSound,

    // Time
    formatTimeAgo,
    formatDateTime,

    // Alerts
    checkPriceAlerts,

    // Animasi
    flashPrice,

    // Dialog
    showConfirm,

    // Clipboard
    copyToClipboard,

    // Loading per-komponen
    showLoading,
    hideLoading,

    // Init
    init,
  };

  // Auto-init saat DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM sudah ready (script di-load setelah DOMContentLoaded)
    init();
  }

})();

console.log('[UI] ui.js loaded.');
